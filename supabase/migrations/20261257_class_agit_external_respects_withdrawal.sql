-- 보안 점검(2026-09-07) 수정: **수록 철회한 작품이 외부 공개본에 다시 실리던** 문제.
--
-- 학급 발행(`run_class_agit_action_v1`)은 `revoked_at IS NOT NULL` 이면 거절한다.
-- 그런데 외부 발행(`run_class_agit_share_action_v1`)에는 그 검사가 없어 `removed_at` 만 봤다. 결과:
--   1. 철회한 작품이 외부 발행에 통과하고 익명 방문자가 **본문 전체**를 읽었다.
--   2. `display_version=2` 의 "전체 작품" 규칙이 철회분까지 세어, 그 작품을 빼면 23514 로 거절했다.
--      즉 교사가 빼려 해도 **뺄 수 없고 다시 실어야만** 발행되는 상태였다.
--   3. 재발행 때 `class_agit_external_items` 를 통째로 지워, 외부에서 한 수록 철회도 사라졌다.
-- 학급 화면은 철회를 지키는데 외부만 뚫려 있었다. 학부모·학생이 내려 달라고 해서 철회한 글이
-- 주소 갱신이나 제목 수정 한 번에 인터넷으로 되돌아갔다.
--
-- 고침: (1) 미배정·전체 작품 셈에서 철회분 제외 (2) 외부 발행 자격에 `revoked_at IS NULL` 추가
--       (3) 외부 수록 철회를 재발행 뒤에도 보존 (4) 교사 화면 후보에 `revoked` 를 실어 미리 경고.
-- 클라이언트의 `hasBlockedShareWorks` 는 이미 `revoked` 를 막게 돼 있었는데 서버가 그 값을 보내지 않았다.
BEGIN;

CREATE OR REPLACE FUNCTION public.run_class_agit_share_action_v1(p_class_id uuid, p_exhibition_id uuid, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET lock_timeout TO '250ms'
 SET search_path TO 'public'
AS $function$
DECLARE v_actor UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_share public.class_agit_external_shares%ROWTYPE;
    v_item JSONB; v_source JSONB; v_n INTEGER:=0; v_token TEXT:=p_payload->>'token'; v_hash TEXT; v_start TIMESTAMPTZ; v_end TIMESTAMPTZ; v_external_item UUID; v_rooms JSONB; v_room_no INTEGER; v_withdrawn JSONB:='[]'; v_display INTEGER:=COALESCE((p_payload->>'display_version')::INTEGER,1);
BEGIN
    v_actor:=public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>public.class_agit_max_works_v1()*1000 THEN RAISE EXCEPTION '공개 요청을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    PERFORM id FROM public.classes WHERE id=p_class_id FOR UPDATE NOWAIT;

    IF p_action IN ('save','publish') THEN
        PERFORM s.id FROM public.students s WHERE s.class_id=p_class_id ORDER BY s.id FOR SHARE NOWAIT;
        PERFORM m.id FROM public.writing_missions m WHERE m.class_id=p_class_id
            AND m.id IN (SELECT p.mission_id FROM public.student_posts p WHERE p.class_id=p_class_id
                AND (p.id IN (SELECT i.post_id FROM public.class_agit_items i WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id)
                     OR p.id IN (SELECT (x->>'sourceId')::UUID FROM jsonb_array_elements(COALESCE(p_payload->'items','[]')) x)))
            ORDER BY m.id FOR SHARE NOWAIT;
    END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id FOR UPDATE NOWAIT;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_share FROM public.class_agit_external_shares WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id FOR UPDATE NOWAIT;
    IF p_action IN('publish','rotate') THEN
        IF v_token IS NULL OR v_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION '새 공유 주소를 준비해 주세요.' USING ERRCODE='22023'; END IF;
        v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
        -- 같은 토큰으로 잃어버린 응답을 재시도해도 중복 발행/판 증가가 없다.
        IF v_share.token_hash=v_hash AND v_share.revoked_at IS NULL THEN RETURN public.get_class_agit_share_workspace_v1(p_class_id,p_exhibition_id); END IF;
    END IF;
    IF p_action IN('publish','rotate') AND v_share.shortened_at>clock_timestamp()-INTERVAL '5 seconds' THEN RAISE EXCEPTION '주소를 만든 직후입니다. 5초 뒤에 다시 시도해 주세요.' USING ERRCODE='PT429'; END IF;
    IF COALESCE((p_payload->>'expected_revision')::INTEGER,0) IS DISTINCT FROM COALESCE(v_share.revision,0)
        THEN RAISE EXCEPTION '공유 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF p_action IN('publish','rotate','extend') THEN
        IF NOT (SELECT external_enabled FROM public.class_agit_rollout WHERE singleton) THEN RAISE EXCEPTION '관리자가 외부 공유를 허용한 뒤 발행할 수 있습니다.' USING ERRCODE='42501'; END IF;
        IF p_action='publish' THEN
            v_start:=(p_payload->>'starts_at')::TIMESTAMPTZ;
            v_end:=(p_payload->>'expires_at')::TIMESTAMPTZ;
            IF v_start IS NULL OR v_start < now()-INTERVAL '5 minutes' THEN
                RAISE EXCEPTION '전시 시작 시간을 현재 이후로 정해 주세요.' USING ERRCODE='22023'; END IF;
        ELSIF p_action='extend' THEN
            v_start:=v_share.starts_at; v_end:=(p_payload->>'expires_at')::TIMESTAMPTZ;
        ELSE v_start:=v_share.starts_at; v_end:=v_share.expires_at;
        END IF;
        IF NOT public.class_agit_valid_share_period_v1(v_start,v_end) OR v_end<=now() THEN
            RAISE EXCEPTION '종료는 시작 이후, 시작부터 최대 30일 이내로 정해 주세요.' USING ERRCODE='22023'; END IF;
    END IF;
    IF p_action='publish' THEN
        IF v_ex.layout_version=2 AND COALESCE((p_payload->>'layout_version')::INTEGER,1)<>2 THEN RAISE EXCEPTION '전시실 구성을 공유하려면 화면을 새로고침해 주세요.' USING ERRCODE='PT409';END IF;
        IF EXISTS(SELECT 1 FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND removed_at IS NULL AND revoked_at IS NULL AND room_id IS NULL) THEN RAISE EXCEPTION '미배정 작품을 전시실에 넣거나 빼 주세요.' USING ERRCODE='23514';END IF;
        v_rooms:=CASE WHEN v_ex.layout_version=2 THEN v_ex.rooms ELSE public.class_agit_legacy_rooms_v1(jsonb_array_length(p_payload->'items')) END;
        IF v_display NOT IN (1,2) THEN RAISE EXCEPTION '공개 편집 버전을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF v_display=2 THEN
            v_rooms:=p_payload->'rooms';
            IF NOT COALESCE(public.class_agit_valid_rooms_v1(v_rooms),FALSE) OR jsonb_array_length(v_rooms)<>jsonb_array_length(v_ex.rooms)
                OR EXISTS(SELECT 1 FROM jsonb_array_elements(v_rooms) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_ex.rooms) old WHERE old->>'id'=r->>'id'))
            THEN RAISE EXCEPTION '전시 주제 구성을 다시 확인해 주세요.' USING ERRCODE='22023'; END IF;
            IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') i WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_rooms) r WHERE r->>'id'=i->>'roomId'))
                OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') i GROUP BY i->>'roomId' HAVING count(*)>public.class_agit_room_capacity_v1())
            THEN RAISE EXCEPTION '모든 작품을 주제에 배정하고 한 전시실은 최대 20편으로 정해 주세요.' USING ERRCODE='22023'; END IF;
        END IF;
        IF v_ex.state='archived' THEN RAISE EXCEPTION '보관한 전시를 먼저 복원해 주세요.' USING ERRCODE='22023'; END IF;
        IF (p_payload->>'exhibition_revision')::INTEGER IS DISTINCT FROM v_ex.revision THEN RAISE EXCEPTION '전시 작품이 바뀌었습니다. 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
        IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND public.class_agit_max_works_v1()
            OR length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '공개 제목과 1~%편의 작품을 확인해 주세요.', public.class_agit_max_works_v1() USING ERRCODE='22023'; END IF;
        -- 철회분이 섞여 있으면 전체 작품 규칙보다 먼저 짚어 준다. 그러지 않으면
        -- "전체 작품으로 준비해 주세요" 라는 엉뚱한 안내가 나가 교사가 원인을 못 찾는다.
        IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') x
                  JOIN public.class_agit_items i ON i.id=(x->>'itemId')::UUID
                  WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.revoked_at IS NOT NULL)
        THEN RAISE EXCEPTION '수록을 철회한 작품이 들어 있습니다. 목록에서 빼거나 전시 편집에서 다시 담아 주세요.' USING ERRCODE='42501'; END IF;
        IF (v_ex.layout_version=2 OR v_display=2) AND jsonb_array_length(p_payload->'items')<>(SELECT count(*) FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND removed_at IS NULL AND revoked_at IS NULL) THEN RAISE EXCEPTION '전시에 담은 전체 작품으로 공유를 준비해 주세요.' USING ERRCODE='23514';END IF;
        IF (SELECT count(DISTINCT x->>'itemId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items')
            THEN RAISE EXCEPTION '같은 작품을 중복 선택할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.class_id=p.class_id AND i.post_id=p.id
            WHERE p.class_id=p_class_id AND i.exhibition_id=p_exhibition_id ORDER BY p.id FOR SHARE OF p NOWAIT;
        INSERT INTO public.class_agit_external_shares(id,class_id,exhibition_id,title,introduction,token_hash,starts_at,expires_at,theme,rooms,display_version)
        VALUES(p_exhibition_id,p_class_id,p_exhibition_id,btrim(p_payload->>'title'),COALESCE(p_payload->>'introduction',''),v_hash,v_start,v_end,v_ex.theme,v_rooms,v_display)
        ON CONFLICT(exhibition_id) DO UPDATE SET display_version=EXCLUDED.display_version,rooms=EXCLUDED.rooms,theme=EXCLUDED.theme,title=EXCLUDED.title,introduction=EXCLUDED.introduction,token_hash=v_hash,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,
            revoked_at=NULL,revision=class_agit_external_shares.revision+1,publication_no=class_agit_external_shares.publication_no+1,updated_at=now();
        -- 외부에서 수록 철회한 작품은 재발행(주소 갱신·제목 수정) 뒤에도 계속 가려져야 한다.
        SELECT COALESCE(jsonb_agg(post_id),'[]') INTO v_withdrawn FROM public.class_agit_external_items
            WHERE class_id=p_class_id AND share_id=p_exhibition_id AND revoked_at IS NOT NULL;
        DELETE FROM public.class_agit_external_items WHERE class_id=p_class_id AND share_id=p_exhibition_id;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) INTO v_source FROM public.class_agit_items i
                WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(v_item->>'itemId')::UUID AND i.removed_at IS NULL AND i.revoked_at IS NULL;
            -- 2026-09-07 보안 점검: 학급 발행(run_class_agit_action_v1)은 철회된 작품을 막는데 외부 발행에는
            -- 그 검사가 없어, 철회한 작품이 익명 인터넷에 다시 올라갔다. 같은 규칙을 여기에도 건다.
            IF v_source IS NULL THEN RAISE EXCEPTION '수록이 철회되었거나 공개할 수 없는 작품이 있습니다. 전시 편집에서 다시 담은 뒤 발행해 주세요.' USING ERRCODE='42501'; END IF;
            IF v_source->>'source_revision' IS DISTINCT FROM v_item->>'sourceRevision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
            IF v_display=2 AND (length(btrim(COALESCE(v_item->>'title',''))) NOT BETWEEN 1 AND 80 OR length(btrim(COALESCE(v_item->>'author',''))) NOT BETWEEN 1 AND 30) THEN RAISE EXCEPTION '작품 제목은 1~80자, 지은이는 1~30자로 적어 주세요.' USING ERRCODE='22023'; END IF;
            IF v_display=1 AND length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30
                THEN RAISE EXCEPTION '가림 이름을 1~30자로 적어 주세요.' USING ERRCODE='22023'; END IF;
            v_n:=v_n+1;
            SELECT r.n::INTEGER INTO v_room_no FROM public.class_agit_items i JOIN LATERAL jsonb_array_elements(v_ex.rooms) WITH ORDINALITY r(value,n) ON r.value->>'id'=i.room_id
             WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(v_item->>'itemId')::UUID;
            IF v_ex.layout_version=1 THEN v_room_no:=(v_n-1)/12+1;END IF;
            IF v_display=2 THEN SELECT r.n::INTEGER INTO v_room_no FROM jsonb_array_elements(v_rooms) WITH ORDINALITY r(value,n) WHERE r.value->>'id'=v_item->>'roomId'; END IF;
            INSERT INTO public.class_agit_external_items(class_id,share_id,post_id,student_id,position,room_no,snapshot)
            VALUES(p_class_id,p_exhibition_id,(v_source->>'id')::UUID,(v_source->>'student_id')::UUID,v_n,v_room_no,
                jsonb_build_object('title',CASE WHEN v_display=2 THEN btrim(v_item->>'title') ELSE v_source->>'title' END,'author',CASE WHEN v_display=2 THEN btrim(v_item->>'author') ELSE CASE WHEN v_ex.layout_version=2 THEN '새싹 작가 '||lpad(v_n::TEXT,GREATEST(2,length(v_n::TEXT)),'0') ELSE btrim(v_item->>'publicAlias') END END,'format',v_source->>'format',
                    'kindLabel',v_source->>'kindLabel','excerpt',v_source->>'excerpt','blocks',v_source->'blocks')) RETURNING id INTO v_external_item;
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_external_item,'external','selected',v_actor);
        END LOOP;
        UPDATE public.class_agit_external_items SET revoked_at=now()
            WHERE class_id=p_class_id AND share_id=p_exhibition_id AND to_jsonb(post_id) <@ v_withdrawn;
        PERFORM public.class_agit_refresh_catalog_v1(p_class_id,p_exhibition_id,'external');
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id)
            VALUES(p_class_id,p_exhibition_id,'external','published',v_actor);
    ELSIF p_action IN('rotate','extend') THEN
        IF v_share.id IS NULL OR v_share.revoked_at IS NOT NULL OR v_share.expires_at<=now() THEN RAISE EXCEPTION '외부 공개본을 먼저 발행해 주세요.' USING ERRCODE='22023'; END IF;
        UPDATE public.class_agit_external_shares SET token_hash=CASE WHEN p_action='rotate' THEN v_hash ELSE token_hash END,
            expires_at=v_end,revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_share.id,'external','renewed',v_actor);
    ELSIF p_action='revoke' THEN
        UPDATE public.class_agit_external_shares SET revoked_at=COALESCE(revoked_at,now()),revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
        IF NOT FOUND THEN RAISE EXCEPTION '공개본을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_share.id,'external','revoked',v_actor);
    ELSIF p_action='withdraw' THEN
        UPDATE public.class_agit_external_items SET revoked_at=COALESCE(revoked_at,now()) WHERE class_id=p_class_id AND share_id=v_share.id AND id=(p_payload->>'item_id')::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION '공개 작품을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        UPDATE public.class_agit_external_shares SET revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,(p_payload->>'item_id')::UUID,'external','withdrawn',v_actor);
    ELSE RAISE EXCEPTION '지원하지 않는 공유 동작입니다.' USING ERRCODE='22023'; END IF;
    IF p_action IN('publish','rotate') AND (v_display=2 OR v_share.samlink_slug IS NOT NULL) THEN PERFORM public.class_agit_create_samlink_v1(p_class_id,p_exhibition_id,v_token); END IF;
    RETURN public.get_class_agit_share_workspace_v1(p_class_id,p_exhibition_id);
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION '원글이나 공개 설정을 변경하는 작업이 진행 중입니다. 잠시 뒤 다시 확인해 주세요.' USING ERRCODE='PT409';
END; $function$;

CREATE OR REPLACE FUNCTION public.get_class_agit_share_workspace_v1(p_class_id uuid, p_exhibition_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_share JSONB; v_items JSONB; v_ex public.class_agit_exhibitions%ROWTYPE; v_selected JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT jsonb_build_object('revision',s.revision,'publication_no',s.publication_no,'title',s.title,'introduction',s.introduction,
        'display_version',s.display_version,'short_url',CASE WHEN l.id IS NOT NULL AND l.is_active AND s.revoked_at IS NULL THEN 'https://샘링크.kr/'||l.slug ELSE NULL END,'starts_at',s.starts_at,'scheduled',s.starts_at>now(),'expires_at',s.expires_at,'revoked',s.revoked_at IS NOT NULL,'expired',s.expires_at<=now()) INTO v_share
        FROM public.class_agit_external_shares s LEFT JOIN samlink.short_links l ON l.slug=s.samlink_slug WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id;
    SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position),'[]') INTO v_items FROM (
        SELECT i.position,i.snapshot||jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'sourceRevision',i.source_revision,'publicAlias',i.public_alias,'roomId',i.room_id,
            'shareTitle',edited.snapshot->>'title','shareAuthor',edited.snapshot->>'author','shareRoomId',shared.rooms->(edited.room_no-1)->>'id',
            'unavailable',cur.data IS NULL,'revoked',i.revoked_at IS NOT NULL,'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision) AS data
        FROM public.class_agit_items i LEFT JOIN LATERAL(SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
        LEFT JOIN public.class_agit_external_shares shared ON shared.class_id=i.class_id AND shared.exhibition_id=i.exhibition_id AND shared.display_version=2
        LEFT JOIN public.class_agit_external_items edited ON edited.class_id=i.class_id AND edited.share_id=shared.id AND edited.post_id=i.post_id AND edited.revoked_at IS NULL
        WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.removed_at IS NULL ORDER BY i.position LIMIT public.class_agit_max_works_v1()) q;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'title',i.snapshot->>'title','author',i.snapshot->>'author','room_no',i.room_no,'room_title',(SELECT s.rooms->(i.room_no-1)->>'title' FROM public.class_agit_external_shares s WHERE s.class_id=i.class_id AND s.id=i.share_id),'revoked',i.revoked_at IS NOT NULL) ORDER BY i.position),'[]') INTO v_selected
        FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id;
    RETURN jsonb_build_object('version',1,'exhibition_title',v_ex.title,'exhibition_introduction',v_ex.introduction,'exhibition_revision',v_ex.revision,'exhibition_theme',v_ex.theme,'rooms',v_ex.rooms,'share_rooms',(SELECT s.rooms FROM public.class_agit_external_shares s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.display_version=2 AND s.rooms IS NOT NULL AND jsonb_array_length(s.rooms)=jsonb_array_length(v_ex.rooms) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.rooms) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_ex.rooms) x WHERE x->>'id'=r->>'id'))),'layout_version',v_ex.layout_version,'share',v_share,'candidates',v_items,'published_items',v_selected,
        'external_enabled',(SELECT external_enabled FROM public.class_agit_rollout WHERE singleton));
END; $function$;

NOTIFY pgrst,'reload schema';
COMMIT;

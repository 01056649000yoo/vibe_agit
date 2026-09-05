-- 전시 표시 정보 편집 + 같은 DB의 샘링크 단축주소. 운영 적용은 배포 요청 때만 한다.
BEGIN;
ALTER TABLE public.class_agit_external_shares ADD COLUMN IF NOT EXISTS display_version INTEGER NOT NULL DEFAULT 1 CHECK(display_version IN(1,2));
ALTER TABLE public.class_agit_external_shares ADD COLUMN IF NOT EXISTS samlink_slug TEXT;
ALTER TABLE public.class_agit_external_shares ADD COLUMN IF NOT EXISTS shortened_at TIMESTAMPTZ;

-- 목적지를 클라이언트에서 받지 않는다. 담당 교사 RPC의 발행과 같은 트랜잭션에서만 호출한다.
CREATE OR REPLACE FUNCTION public.class_agit_create_samlink_v1(p_class_id UUID,p_exhibition_id UUID,p_token TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s public.class_agit_external_shares%ROWTYPE; slug TEXT; attempt INTEGER;
BEGIN
 SELECT * INTO s FROM public.class_agit_external_shares WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id FOR UPDATE;
 IF s.id IS NULL OR s.revoked_at IS NOT NULL OR s.expires_at<=now() OR p_token !~ '^[a-f0-9]{64}$'
    OR s.token_hash IS DISTINCT FROM encode(extensions.digest(p_token,'sha256'),'hex') THEN RAISE EXCEPTION '공개 주소를 확인할 수 없습니다.' USING ERRCODE='22023'; END IF;
 FOR attempt IN 1..5 LOOP
  slug:='e-'||translate(encode(extensions.gen_random_bytes(18),'base64'),'+/','-_');
  BEGIN
   INSERT INTO samlink.short_links(slug,destination,expires_at,created_by,display_label)
   VALUES(slug,'https://xn--vz0ba242ncqcba79xhwx.site/exhibition#'||p_token,s.expires_at,NULL,'아지트 글 전시관');
   UPDATE public.class_agit_external_shares SET samlink_slug=slug,shortened_at=clock_timestamp() WHERE class_id=p_class_id AND id=s.id;
   RETURN;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
 END LOOP;
 RAISE EXCEPTION '샘링크 주소를 만들지 못했습니다. 잠시 뒤 다시 시도해 주세요.' USING ERRCODE='PT503';
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_create_samlink_v1(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;

-- 기간 변경·해지·주소 회전·전시 삭제에 단축주소도 함께 동기화한다.
CREATE OR REPLACE FUNCTION public.class_agit_sync_samlink_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF TG_OP='DELETE' THEN
  DELETE FROM samlink.short_links WHERE slug=OLD.samlink_slug;
  RETURN OLD;
 END IF;
 IF OLD.samlink_slug IS NOT NULL AND (NEW.samlink_slug IS DISTINCT FROM OLD.samlink_slug OR NEW.revoked_at IS NOT NULL) THEN
  DELETE FROM samlink.short_links WHERE slug=OLD.samlink_slug;
 ELSIF NEW.samlink_slug IS NOT NULL THEN
  UPDATE samlink.short_links SET expires_at=NEW.expires_at,is_active=NEW.revoked_at IS NULL WHERE slug=NEW.samlink_slug;
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_sync_samlink_v1() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS class_agit_sync_samlink ON public.class_agit_external_shares;
CREATE TRIGGER class_agit_sync_samlink AFTER UPDATE OR DELETE ON public.class_agit_external_shares FOR EACH ROW EXECUTE FUNCTION public.class_agit_sync_samlink_v1();

CREATE OR REPLACE FUNCTION public.get_class_agit_share_workspace_v1(p_class_id UUID,p_exhibition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
            'unavailable',cur.data IS NULL,'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision) AS data
        FROM public.class_agit_items i LEFT JOIN LATERAL(SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
        LEFT JOIN public.class_agit_external_shares shared ON shared.class_id=i.class_id AND shared.exhibition_id=i.exhibition_id AND shared.display_version=2
        LEFT JOIN public.class_agit_external_items edited ON edited.class_id=i.class_id AND edited.share_id=shared.id AND edited.post_id=i.post_id AND edited.revoked_at IS NULL
        WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.removed_at IS NULL ORDER BY i.position LIMIT public.class_agit_max_works_v1()) q;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'title',i.snapshot->>'title','author',i.snapshot->>'author','room_no',i.room_no,'room_title',(SELECT s.rooms->(i.room_no-1)->>'title' FROM public.class_agit_external_shares s WHERE s.class_id=i.class_id AND s.id=i.share_id),'revoked',i.revoked_at IS NOT NULL) ORDER BY i.position),'[]') INTO v_selected
        FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id;
    RETURN jsonb_build_object('version',1,'exhibition_title',v_ex.title,'exhibition_introduction',v_ex.introduction,'exhibition_revision',v_ex.revision,'exhibition_theme',v_ex.theme,'rooms',v_ex.rooms,'share_rooms',(SELECT s.rooms FROM public.class_agit_external_shares s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.display_version=2 AND s.rooms IS NOT NULL AND jsonb_array_length(s.rooms)=jsonb_array_length(v_ex.rooms) AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s.rooms) r WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_ex.rooms) x WHERE x->>'id'=r->>'id'))),'layout_version',v_ex.layout_version,'share',v_share,'candidates',v_items,'published_items',v_selected,
        'external_enabled',(SELECT external_enabled FROM public.class_agit_rollout WHERE singleton));
END; $$;

CREATE OR REPLACE FUNCTION public.run_class_agit_share_action_v1(p_class_id UUID,p_exhibition_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET lock_timeout='250ms' SET search_path=public AS $$
DECLARE v_actor UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_share public.class_agit_external_shares%ROWTYPE;
    v_item JSONB; v_source JSONB; v_n INTEGER:=0; v_token TEXT:=p_payload->>'token'; v_hash TEXT; v_start TIMESTAMPTZ; v_end TIMESTAMPTZ; v_external_item UUID; v_rooms JSONB; v_room_no INTEGER; v_display INTEGER:=COALESCE((p_payload->>'display_version')::INTEGER,1);
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
        IF EXISTS(SELECT 1 FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND removed_at IS NULL AND room_id IS NULL) THEN RAISE EXCEPTION '미배정 작품을 전시실에 넣거나 빼 주세요.' USING ERRCODE='23514';END IF;
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
        IF (v_ex.layout_version=2 OR v_display=2) AND jsonb_array_length(p_payload->'items')<>(SELECT count(*) FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND removed_at IS NULL) THEN RAISE EXCEPTION '전시에 담은 전체 작품으로 공유를 준비해 주세요.' USING ERRCODE='23514';END IF;
        IF (SELECT count(DISTINCT x->>'itemId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items')
            THEN RAISE EXCEPTION '같은 작품을 중복 선택할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.class_id=p.class_id AND i.post_id=p.id
            WHERE p.class_id=p_class_id AND i.exhibition_id=p_exhibition_id ORDER BY p.id FOR SHARE OF p NOWAIT;
        INSERT INTO public.class_agit_external_shares(id,class_id,exhibition_id,title,introduction,token_hash,starts_at,expires_at,theme,rooms,display_version)
        VALUES(p_exhibition_id,p_class_id,p_exhibition_id,btrim(p_payload->>'title'),COALESCE(p_payload->>'introduction',''),v_hash,v_start,v_end,v_ex.theme,v_rooms,v_display)
        ON CONFLICT(exhibition_id) DO UPDATE SET display_version=EXCLUDED.display_version,rooms=EXCLUDED.rooms,theme=EXCLUDED.theme,title=EXCLUDED.title,introduction=EXCLUDED.introduction,token_hash=v_hash,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,
            revoked_at=NULL,revision=class_agit_external_shares.revision+1,publication_no=class_agit_external_shares.publication_no+1,updated_at=now();
        DELETE FROM public.class_agit_external_items WHERE class_id=p_class_id AND share_id=p_exhibition_id;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) INTO v_source FROM public.class_agit_items i
                WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(v_item->>'itemId')::UUID AND i.removed_at IS NULL;
            IF v_source IS NULL THEN RAISE EXCEPTION '공개할 수 없는 원글이 있습니다.' USING ERRCODE='42501'; END IF;
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
END; $$;


REVOKE ALL ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) TO authenticated;
-- 사용자 요청: 현재 지정된 진남초 4학년 1반의 외부 공유 주소 발급 허용.
-- 다른 학급이 추가됐거나 운영 단계가 달라졌다면 이 변경으로 범위를 확대하지 않는다.
UPDATE public.class_agit_rollout SET external_enabled=TRUE,revision=revision+1
WHERE singleton AND mode='pilot' AND external_enabled IS FALSE
 AND EXISTS(SELECT 1 FROM public.class_agit_pilot_classes WHERE class_id='a4b4512b-6378-4edf-aa25-58e46c82c87a')
 AND NOT EXISTS(SELECT 1 FROM public.class_agit_pilot_classes WHERE class_id<>'a4b4512b-6378-4edf-aa25-58e46c82c87a');
NOTIFY pgrst,'reload schema';
COMMIT;

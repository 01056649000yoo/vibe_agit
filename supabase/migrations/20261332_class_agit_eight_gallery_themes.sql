-- 전시관 디자인 8종: 저장·공개·외부 공유의 허용값을 함께 확장한다.
BEGIN;
ALTER TABLE public.class_agit_exhibitions DROP CONSTRAINT IF EXISTS class_agit_exhibitions_theme_check;
ALTER TABLE public.class_agit_exhibitions ADD CONSTRAINT class_agit_exhibitions_theme_check CHECK(theme IN ('garden','museum','library','night','atelier','terracotta','ink','lilac'));
ALTER TABLE public.class_agit_external_shares DROP CONSTRAINT IF EXISTS class_agit_external_shares_theme_check;
ALTER TABLE public.class_agit_external_shares ADD CONSTRAINT class_agit_external_shares_theme_check CHECK(theme IN ('garden','museum','library','night','atelier','terracotta','ink','lilac'));
ALTER TABLE public.class_agit_publication_catalog DROP CONSTRAINT IF EXISTS class_agit_publication_catalog_theme_check;
ALTER TABLE public.class_agit_publication_catalog ADD CONSTRAINT class_agit_publication_catalog_theme_check CHECK(theme IN ('garden','museum','library','night','atelier','terracotta','ink','lilac'));

CREATE OR REPLACE FUNCTION public.run_class_agit_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET lock_timeout='250ms' SET search_path = public AS $$
DECLARE v_actor UUID; v_id UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_data JSONB; v_item JSONB; v_snapshot JSONB;
    v_existing public.class_agit_items%ROWTYPE; v_item_id UUID; v_position INTEGER := 0; v_items JSONB := '[]'; v_post_id UUID;
    v_rooms JSONB; v_room_id TEXT; v_old_enabled BOOLEAN; v_selection_changed BOOLEAN; v_modules TEXT[]; v_legacy_enabled BOOLEAN;
BEGIN
    v_actor := public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT) > public.class_agit_max_works_v1()*500 THEN
        RAISE EXCEPTION '전시 요청 크기 또는 형식이 올바르지 않습니다.' USING ERRCODE = '22023'; END IF;
    -- Conflicting publication/source edits fail with PT409 instead of holding a lock cycle.
    -- 학급당 프로젝트 상한과 모듈 변경·발행을 같은 잠금 순서로 직렬화한다.
    SELECT COALESCE('class-agit'=ANY(enabled_modules),FALSE),enabled_modules,vocab_tower_enabled
    INTO v_old_enabled,v_modules,v_legacy_enabled FROM public.classes WHERE id=p_class_id FOR UPDATE NOWAIT;
    IF p_action = 'set_enabled' THEN
        IF jsonb_typeof(p_payload->'enabled') IS DISTINCT FROM 'boolean'
           OR (p_payload->>'expected_enabled')::BOOLEAN IS DISTINCT FROM v_old_enabled THEN
            RAISE EXCEPTION '학급 공개 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
        -- 미설정 학급은 화면이 공용 registry로 계산한 기존 메뉴를 함께 초기화한다.
        -- 이미 설정된 목록은 잠금 안에서 읽은 서버 값을 유지해 다른 메뉴 변경을 덮지 않는다.
        IF (p_payload->>'enabled')::BOOLEAN AND COALESCE(cardinality(v_modules),0)=0 THEN
            IF jsonb_typeof(p_payload->'initial_modules') IS DISTINCT FROM 'array' THEN
                RAISE EXCEPTION '기존 학급 메뉴를 확인하려면 작업공간을 다시 열어 주세요.' USING ERRCODE='22023'; END IF;
            IF jsonb_array_length(p_payload->'initial_modules')>100
               OR NOT (p_payload->'initial_modules' ? '__configured__')
               OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'initial_modules') x
                   WHERE jsonb_typeof(x)<>'string' OR length(x#>>'{}')>80)
               THEN RAISE EXCEPTION '기존 학급 메뉴 설정을 확인해 주세요.' USING ERRCODE='22023'; END IF;
            IF (p_payload->>'initial_vocab_tower_enabled')::BOOLEAN IS DISTINCT FROM v_legacy_enabled THEN
                RAISE EXCEPTION '학급 메뉴 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
            SELECT array_agg(DISTINCT value) INTO v_modules FROM jsonb_array_elements_text(p_payload->'initial_modules');
        END IF;
        UPDATE public.classes SET enabled_modules = CASE WHEN (p_payload->>'enabled')::BOOLEAN
            THEN array_append(array_remove(v_modules,'class-agit'),'class-agit')
            ELSE array_remove(v_modules,'class-agit') END WHERE id=p_class_id;
        RETURN public.get_class_agit_workspace_v1(p_class_id,(p_payload->>'exhibition_id')::UUID);
    END IF;
    v_id := (p_payload->>'exhibition_id')::UUID;
    IF v_id IS NULL THEN RAISE EXCEPTION '전시 식별자가 필요합니다.' USING ERRCODE='22023'; END IF;

    IF p_action IN ('save','publish') THEN
        PERFORM s.id FROM public.students s WHERE s.class_id=p_class_id ORDER BY s.id FOR SHARE NOWAIT;
        PERFORM m.id FROM public.writing_missions m WHERE m.class_id=p_class_id
            AND m.id IN (SELECT p.mission_id FROM public.student_posts p WHERE p.class_id=p_class_id
                AND (p.id IN (SELECT i.post_id FROM public.class_agit_items i WHERE i.class_id=p_class_id AND i.exhibition_id=v_id)
                     OR p.id IN (SELECT (x->>'sourceId')::UUID FROM jsonb_array_elements(COALESCE(p_payload->'items','[]')) x)))
            ORDER BY m.id FOR SHARE NOWAIT;
    END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=v_id FOR UPDATE NOWAIT;
    IF p_action = 'create' THEN
        IF FOUND THEN RETURN public.get_class_agit_workspace_v1(p_class_id,v_id); END IF;
        IF (SELECT count(*) FROM public.class_agit_exhibitions WHERE class_id=p_class_id) >= 20 THEN
            RAISE EXCEPTION '한 학급은 전시를 20개까지 보관할 수 있습니다.' USING ERRCODE='23514'; END IF;
        INSERT INTO public.class_agit_exhibitions(id,class_id,title) VALUES(v_id,p_class_id,'우리의 작은 발견');
        RETURN public.get_class_agit_workspace_v1(p_class_id,v_id);
    END IF;
    IF v_ex.id IS NULL THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF (p_payload->>'expected_revision')::INTEGER IS DISTINCT FROM v_ex.revision THEN
        RAISE EXCEPTION '다른 화면에서 전시가 변경되었습니다. 현재 편집은 남겨 두고 최신 전시를 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF p_action = 'delete' THEN
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN
            RAISE EXCEPTION '전시 삭제 동작을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        -- FK CASCADE removes only drafts, publication catalogs/slots and external shares.
        -- student_posts is the referenced parent and is never deleted here.
        DELETE FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=v_id;
        RETURN public.get_class_agit_workspace_v1(p_class_id,NULL);
    END IF;
    IF p_action = 'save' THEN
        IF NOT p_payload ? 'rooms' AND v_ex.layout_version=2 THEN RAISE EXCEPTION '새 전시실 구성을 편집하려면 화면을 새로고침해 주세요.' USING ERRCODE='PT409';END IF;
        v_rooms:=CASE WHEN p_payload ? 'rooms' THEN p_payload->'rooms' ELSE public.class_agit_legacy_rooms_v1(jsonb_array_length(p_payload->'items')) END;
        IF NOT public.class_agit_valid_rooms_v1(v_rooms) THEN RAISE EXCEPTION '전시실 이름·소개·배경·10실 상한을 확인해 주세요.' USING ERRCODE='22023';END IF;
        IF p_payload ? 'rooms' AND (EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') x WHERE x->>'roomId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(v_rooms) r WHERE r->>'id'=x->>'roomId'))
         OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_payload->'items') x WHERE x->>'roomId' IS NOT NULL GROUP BY x->>'roomId' HAVING count(*)>public.class_agit_room_capacity_v1())) THEN RAISE EXCEPTION '작품 배정과 전시실당 20편 상한을 확인해 주세요.' USING ERRCODE='23514';END IF;
        IF COALESCE(p_payload->>'theme',v_ex.theme) NOT IN ('garden','museum','library','night','atelier','terracotta','ink','lilac') THEN
            RAISE EXCEPTION '전시관 디자인을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF char_length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 OR char_length(COALESCE(p_payload->>'introduction',''))>240
           OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION '전시 제목·소개·작품 목록을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF jsonb_array_length(p_payload->'items') > public.class_agit_max_works_v1() OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_payload->'items') a GROUP BY a->>'sourceId' HAVING count(*)>1
        ) THEN RAISE EXCEPTION '전시는 중복 없이 %편까지 담을 수 있습니다.', public.class_agit_max_works_v1() USING ERRCODE='23514'; END IF;
        -- source를 먼저 잠근다. source 회수 트리거는 전시 행을 잠그지 않으므로 잠금 순환이 없다.
        PERFORM p.id FROM public.student_posts p WHERE p.class_id=p_class_id
            AND p.id IN (SELECT (a->>'sourceId')::UUID FROM jsonb_array_elements(p_payload->'items') a) ORDER BY p.id FOR SHARE NOWAIT;
        UPDATE public.class_agit_items SET removed_at=NOW() WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL;
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
            v_position := v_position + 1; v_room_id:=CASE WHEN p_payload ? 'rooms' THEN v_item->>'roomId' ELSE 'room-'||((v_position-1)/12+1) END; v_post_id := (v_item->>'sourceId')::UUID;
            v_data := public.class_agit_current_source_v1(p_class_id,v_post_id);
            IF v_data IS NULL THEN RAISE EXCEPTION '담은 글 중 제출·확인·공개 조건이 바뀐 글이 있습니다. 해당 작품을 빼거나 다시 확인해 주세요.' USING ERRCODE='42501'; END IF;
            IF v_item->>'sourceRevision' IS DISTINCT FROM v_data->>'source_revision' THEN
                RAISE EXCEPTION '원글 내용이 바뀌었습니다. 전문을 다시 읽고 담아 주세요.' USING ERRCODE='PT409'; END IF;
            IF char_length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30 THEN
                RAISE EXCEPTION '가림 이름을 1~30자로 적어 주세요.' USING ERRCODE='22023'; END IF;
            SELECT * INTO v_existing FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND post_id=v_post_id;
            v_selection_changed := v_existing.id IS NULL OR v_existing.revoked_at IS NOT NULL OR v_existing.source_revision<>v_data->>'source_revision';
            v_snapshot := jsonb_build_object('title',v_data->>'title','authorName',v_data->>'student_name','groupTitle',v_data->>'group_title','format',v_data->>'format',
                'kindLabel',v_data->>'kindLabel','blocks',v_data->'blocks','excerpt',v_data->>'excerpt');
            INSERT INTO public.class_agit_items(class_id,exhibition_id,post_id,student_id,position,source_revision,snapshot,public_alias,confirmed_by,room_id)
            VALUES(p_class_id,v_id,v_post_id,(v_data->>'student_id')::UUID,v_position,v_data->>'source_revision',v_snapshot,btrim(v_item->>'publicAlias'),v_actor,v_room_id)
            ON CONFLICT(exhibition_id,post_id) DO UPDATE SET room_id=EXCLUDED.room_id,position=EXCLUDED.position,source_revision=EXCLUDED.source_revision,snapshot=EXCLUDED.snapshot,
                public_alias=EXCLUDED.public_alias,removed_at=NULL,revoked_at=NULL,
                confirmed_by=CASE WHEN v_selection_changed THEN v_actor ELSE class_agit_items.confirmed_by END,
                confirmed_at=CASE WHEN v_selection_changed THEN NOW() ELSE class_agit_items.confirmed_at END,
                consent_id=CASE WHEN v_existing.revoked_at IS NOT NULL THEN gen_random_uuid() ELSE class_agit_items.consent_id END
            RETURNING id INTO v_item_id;
            IF v_selection_changed THEN INSERT INTO public.class_agit_consent_events(class_id,item_id,action,actor_id) VALUES(p_class_id,v_item_id,'selected',v_actor); END IF;
        END LOOP;
        WITH numbered AS (
            SELECT i.id,row_number() OVER(ORDER BY COALESCE(r.n,999),i.position,i.id)::INTEGER AS position
            FROM public.class_agit_items i LEFT JOIN LATERAL (SELECT n FROM jsonb_array_elements(v_rooms) WITH ORDINALITY x(r,n) WHERE r->>'id'=i.room_id) r ON TRUE
            WHERE i.class_id=p_class_id AND i.exhibition_id=v_id AND i.removed_at IS NULL
        ) UPDATE public.class_agit_items i SET position=n.position FROM numbered n WHERE i.class_id=p_class_id AND i.exhibition_id=v_id AND i.id=n.id;
        UPDATE public.class_agit_exhibitions SET rooms=v_rooms,layout_version=CASE WHEN p_payload ? 'rooms' THEN 2 ELSE 1 END,theme=COALESCE(p_payload->>'theme',v_ex.theme),title=btrim(p_payload->>'title'),introduction=COALESCE(p_payload->>'introduction',''),revision=revision+1,updated_at=NOW()
        WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action = 'publish' THEN
        IF EXISTS(SELECT 1 FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL AND room_id IS NULL) THEN RAISE EXCEPTION '미배정 작품을 전시실에 넣거나 빼 주세요.' USING ERRCODE='23514';END IF;
        IF NOT v_old_enabled THEN RAISE EXCEPTION '학생 공개 스위치를 먼저 켜 주세요.' USING ERRCODE='42501'; END IF;
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '학급 공개 내용을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.post_id=p.id AND i.class_id=p.class_id
        WHERE p.class_id=p_class_id AND i.exhibition_id=v_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p NOWAIT;
        FOR v_existing IN SELECT * FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL ORDER BY position,id LOOP
            v_data := public.class_agit_current_source_v1(p_class_id,v_existing.post_id);
            IF v_existing.revoked_at IS NOT NULL OR v_data IS NULL THEN RAISE EXCEPTION '수록이 철회되었거나 공개할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_existing.source_revision IS DISTINCT FROM v_data->>'source_revision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인하고 초안을 저장해 주세요.' USING ERRCODE='PT409'; END IF;
            v_items := v_items || jsonb_build_array(v_existing.snapshot || jsonb_build_object('itemId',v_existing.id,'consentId',v_existing.consent_id,'roomId',v_existing.room_id));
        END LOOP;
        IF jsonb_array_length(v_items) NOT BETWEEN 1 AND public.class_agit_max_works_v1() THEN RAISE EXCEPTION '공개할 작품을 먼저 담아 주세요.' USING ERRCODE='23514'; END IF;
        UPDATE public.class_agit_exhibitions SET state='published',publication_no=publication_no+1,published_at=NOW(),revision=revision+1,updated_at=NOW(),
            published_snapshot=jsonb_build_object('title',title,'introduction',introduction,'theme',theme,'rooms',rooms,'works',v_items)
        WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action = 'withdraw' THEN
        v_item_id := (p_payload->>'item_id')::UUID;
        UPDATE public.class_agit_items SET revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE class_id=p_class_id AND exhibition_id=v_id AND id=v_item_id;
        IF NOT FOUND THEN RAISE EXCEPTION '작품을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        INSERT INTO public.class_agit_consent_events(class_id,item_id,action,actor_id) VALUES(p_class_id,v_item_id,'withdrawn',v_actor);
        UPDATE public.class_agit_exhibitions SET revision=revision+1,updated_at=NOW() WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action IN ('unpublish','archive','restore') THEN
        UPDATE public.class_agit_exhibitions SET state=CASE WHEN p_action='archive' THEN 'archived' ELSE 'draft' END,revision=revision+1,updated_at=NOW()
        WHERE class_id=p_class_id AND id=v_id;
    ELSE RAISE EXCEPTION '지원하지 않는 전시 동작입니다.' USING ERRCODE='22023'; END IF;
    RETURN public.get_class_agit_workspace_v1(p_class_id,v_id);
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION '원글이나 공개 설정을 변경하는 작업이 진행 중입니다. 잠시 뒤 다시 확인해 주세요.' USING ERRCODE='PT409';
END; $$;
COMMIT;

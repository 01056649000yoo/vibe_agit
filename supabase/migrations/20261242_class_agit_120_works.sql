-- 120편 / 방당 12편. 기존 판과 권한은 유지하고 저장·공개·학생·외부 읽기 상한을 함께 확장한다.
-- 운영 적용 전 migrate:check로 120편 끝번호·121편 거절·철회·권한과 응답 크기를 검증한다.
BEGIN;

-- 서버 상한의 정본. 프런트 policy.js와의 일치는 classAgitCapacity.test.mjs가 확인한다.
CREATE OR REPLACE FUNCTION public.class_agit_max_works_v1()
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT 120; $$;
REVOKE ALL ON FUNCTION public.class_agit_max_works_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.class_agit_valid_work_id_v1(p_work_id TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path=public AS $$
    SELECT CASE WHEN p_work_id ~ '^published-[1-9][0-9]{0,2}$'
        THEN substring(p_work_id FROM 11)::INTEGER BETWEEN 1 AND public.class_agit_max_works_v1()
        ELSE FALSE END;
$$;
REVOKE ALL ON FUNCTION public.class_agit_valid_work_id_v1(TEXT) FROM PUBLIC,anon,authenticated,service_role;

ALTER TABLE public.class_agit_items DROP CONSTRAINT IF EXISTS class_agit_items_position_check;
ALTER TABLE public.class_agit_items ADD CONSTRAINT class_agit_items_position_check
    CHECK(position BETWEEN 1 AND public.class_agit_max_works_v1());
ALTER TABLE public.class_agit_external_items DROP CONSTRAINT IF EXISTS class_agit_external_items_position_check;
ALTER TABLE public.class_agit_external_items ADD CONSTRAINT class_agit_external_items_position_check
    CHECK(position BETWEEN 1 AND public.class_agit_max_works_v1());
-- 작품별 100KB와 고정판 메타데이터 여유. 본문/자격/해시 검증은 기존 정본을 사용한다.
ALTER TABLE public.class_agit_exhibitions DROP CONSTRAINT IF EXISTS class_agit_exhibitions_published_snapshot_check;
ALTER TABLE public.class_agit_exhibitions ADD CONSTRAINT class_agit_exhibitions_published_snapshot_check
    CHECK(published_snapshot IS NULL OR (jsonb_typeof(published_snapshot)='object'
        AND octet_length(published_snapshot::TEXT) <= public.class_agit_max_works_v1()*100000+500000));

CREATE OR REPLACE FUNCTION public.get_class_agit_workspace_v1(p_class_id UUID, p_exhibition_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_projects JSONB; v_students JSONB; v_draft JSONB; v_items JSONB; v_ex public.class_agit_exhibitions%ROWTYPE;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.updated_at DESC,q.id DESC),'[]') INTO v_projects FROM (
        SELECT e.id,e.title,e.state,e.revision,e.publication_no,e.published_at,e.updated_at
        FROM public.class_agit_exhibitions e WHERE e.class_id = p_class_id ORDER BY e.updated_at DESC,e.id DESC LIMIT 20
    ) q;
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.name,q.id),'[]') INTO v_students FROM (
        SELECT s.id,left(s.name,30) AS name FROM public.students s WHERE s.class_id = p_class_id AND s.deleted_at IS NULL
          AND s.is_active IS DISTINCT FROM FALSE ORDER BY s.name,s.id LIMIT 100
    ) q;
    IF p_exhibition_id IS NOT NULL THEN
        SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id = p_class_id AND id = p_exhibition_id;
        IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE = '42501'; END IF;
        SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position,q.id),'[]') INTO v_items FROM (
            SELECT i.id,i.position, i.snapshot || jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'studentId',i.student_id,
                'sourceRevision',i.source_revision,'publicAlias',i.public_alias,'authorNumber',i.position,
                'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision,
                'unavailable',cur.data IS NULL,'revoked',i.revoked_at IS NOT NULL,
                'scopes',jsonb_build_object('class',i.revoked_at IS NULL,'anthology',FALSE,'external',FALSE)) AS data
            FROM public.class_agit_items i LEFT JOIN LATERAL (SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
            WHERE i.class_id = p_class_id AND i.exhibition_id = p_exhibition_id AND i.removed_at IS NULL
            ORDER BY i.position,i.id LIMIT public.class_agit_max_works_v1()
        ) q;
        v_draft := jsonb_build_object('id',v_ex.id,'classId',p_class_id,'title',v_ex.title,'introduction',v_ex.introduction,
            'revision',v_ex.revision,'state',v_ex.state,'publicationNo',v_ex.publication_no,'items',v_items);
    END IF;
    RETURN jsonb_build_object('version',1,'rollout','internal','class',jsonb_build_object('id',p_class_id,
        'module_enabled',(SELECT COALESCE('class-agit'=ANY(c.enabled_modules),FALSE) FROM public.classes c WHERE c.id=p_class_id),
        'enabled_modules',(SELECT c.enabled_modules FROM public.classes c WHERE c.id=p_class_id),
        'vocab_tower_enabled',(SELECT c.vocab_tower_enabled FROM public.classes c WHERE c.id=p_class_id)),
        'projects',v_projects,'students',v_students,'draft',v_draft);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_workspace_v1(UUID,UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_workspace_v1(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_class_agit_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_actor UUID; v_id UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_data JSONB; v_item JSONB; v_snapshot JSONB;
    v_existing public.class_agit_items%ROWTYPE; v_item_id UUID; v_position INTEGER := 0; v_items JSONB := '[]'; v_post_id UUID;
    v_old_enabled BOOLEAN; v_class_confirmed BOOLEAN; v_modules TEXT[]; v_legacy_enabled BOOLEAN;
BEGIN
    v_actor := public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT) > public.class_agit_max_works_v1()*500 THEN
        RAISE EXCEPTION '전시 요청 크기 또는 형식이 올바르지 않습니다.' USING ERRCODE = '22023'; END IF;
    -- 학급당 프로젝트 상한과 모듈 변경·발행을 같은 잠금 순서로 직렬화한다.
    SELECT COALESCE('class-agit'=ANY(enabled_modules),FALSE),enabled_modules,vocab_tower_enabled
    INTO v_old_enabled,v_modules,v_legacy_enabled FROM public.classes WHERE id=p_class_id FOR UPDATE;
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
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=v_id FOR UPDATE;
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
    IF p_action = 'save' THEN
        IF char_length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 OR char_length(COALESCE(p_payload->>'introduction',''))>240
           OR jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' THEN
            RAISE EXCEPTION '전시 제목·소개·작품 목록을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF jsonb_array_length(p_payload->'items') > public.class_agit_max_works_v1() OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(p_payload->'items') a GROUP BY a->>'sourceId' HAVING count(*)>1
        ) THEN RAISE EXCEPTION '전시는 중복 없이 %편까지 담을 수 있습니다.', public.class_agit_max_works_v1() USING ERRCODE='23514'; END IF;
        -- source를 먼저 잠근다. source 회수 트리거는 전시 행을 잠그지 않으므로 잠금 순환이 없다.
        PERFORM p.id FROM public.student_posts p WHERE p.class_id=p_class_id
            AND p.id IN (SELECT (a->>'sourceId')::UUID FROM jsonb_array_elements(p_payload->'items') a) ORDER BY p.id FOR SHARE;
        UPDATE public.class_agit_items SET removed_at=NOW() WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL;
        FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items') LOOP
            v_position := v_position + 1; v_post_id := (v_item->>'sourceId')::UUID;
            v_data := public.class_agit_current_source_v1(p_class_id,v_post_id);
            IF v_data IS NULL THEN RAISE EXCEPTION '담은 글 중 제출·확인·공개 조건이 바뀐 글이 있습니다. 해당 작품을 빼거나 다시 확인해 주세요.' USING ERRCODE='42501'; END IF;
            IF v_item->>'sourceRevision' IS DISTINCT FROM v_data->>'source_revision' THEN
                RAISE EXCEPTION '원글 내용이 바뀌었습니다. 전문을 다시 읽고 담아 주세요.' USING ERRCODE='PT409'; END IF;
            IF v_item->'classAcknowledged' IS DISTINCT FROM 'true'::JSONB THEN
                RAISE EXCEPTION '작품별 학급 전시 수록 의사를 확인해 주세요.' USING ERRCODE='22023'; END IF;
            IF char_length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30 THEN
                RAISE EXCEPTION '가림 이름을 1~30자로 적어 주세요.' USING ERRCODE='22023'; END IF;
            SELECT * INTO v_existing FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND post_id=v_post_id;
            v_class_confirmed := v_existing.id IS NULL OR v_existing.revoked_at IS NOT NULL OR v_existing.source_revision<>v_data->>'source_revision';
            v_snapshot := jsonb_build_object('title',v_data->>'title','authorName',v_data->>'student_name','groupTitle',v_data->>'group_title','format',v_data->>'format',
                'kindLabel',v_data->>'kindLabel','blocks',v_data->'blocks','excerpt',v_data->>'excerpt');
            INSERT INTO public.class_agit_items(class_id,exhibition_id,post_id,student_id,position,source_revision,snapshot,public_alias,confirmed_by)
            VALUES(p_class_id,v_id,v_post_id,(v_data->>'student_id')::UUID,v_position,v_data->>'source_revision',v_snapshot,btrim(v_item->>'publicAlias'),v_actor)
            ON CONFLICT(exhibition_id,post_id) DO UPDATE SET position=EXCLUDED.position,source_revision=EXCLUDED.source_revision,snapshot=EXCLUDED.snapshot,
                public_alias=EXCLUDED.public_alias,removed_at=NULL,revoked_at=NULL,
                confirmed_by=CASE WHEN v_class_confirmed THEN v_actor ELSE class_agit_items.confirmed_by END,
                confirmed_at=CASE WHEN v_class_confirmed THEN NOW() ELSE class_agit_items.confirmed_at END,
                consent_id=CASE WHEN v_existing.revoked_at IS NOT NULL THEN gen_random_uuid() ELSE class_agit_items.consent_id END
            RETURNING id INTO v_item_id;
            IF v_class_confirmed THEN INSERT INTO public.class_agit_consent_events(class_id,item_id,action,actor_id) VALUES(p_class_id,v_item_id,'confirmed',v_actor); END IF;
        END LOOP;
        UPDATE public.class_agit_exhibitions SET title=btrim(p_payload->>'title'),introduction=COALESCE(p_payload->>'introduction',''),revision=revision+1,updated_at=NOW()
        WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action = 'publish' THEN
        IF NOT v_old_enabled THEN RAISE EXCEPTION '학생 공개 스위치를 먼저 켜 주세요.' USING ERRCODE='42501'; END IF;
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '학급 공개 내용을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.post_id=p.id AND i.class_id=p.class_id
        WHERE p.class_id=p_class_id AND i.exhibition_id=v_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p;
        FOR v_existing IN SELECT * FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL ORDER BY position,id LOOP
            v_data := public.class_agit_current_source_v1(p_class_id,v_existing.post_id);
            IF v_existing.revoked_at IS NOT NULL OR v_data IS NULL THEN RAISE EXCEPTION '수록이 철회되었거나 공개할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_existing.source_revision IS DISTINCT FROM v_data->>'source_revision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인하고 초안을 저장해 주세요.' USING ERRCODE='PT409'; END IF;
            v_items := v_items || jsonb_build_array(v_existing.snapshot || jsonb_build_object('itemId',v_existing.id,'consentId',v_existing.consent_id));
        END LOOP;
        IF jsonb_array_length(v_items) NOT BETWEEN 1 AND public.class_agit_max_works_v1() THEN RAISE EXCEPTION '공개할 작품을 먼저 담아 주세요.' USING ERRCODE='23514'; END IF;
        UPDATE public.class_agit_exhibitions SET state='published',publication_no=publication_no+1,published_at=NOW(),revision=revision+1,updated_at=NOW(),
            published_snapshot=jsonb_build_object('title',title,'introduction',introduction,'works',v_items)
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
END; $$;
REVOKE ALL ON FUNCTION public.run_class_agit_action_v1(UUID,TEXT,JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_action_v1(UUID,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_class_agit_publication_v1(p_class_id UUID,p_exhibition_id UUID,p_room INTEGER DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ex public.class_agit_exhibitions%ROWTYPE; v_works JSONB; v_total INTEGER; v_rooms INTEGER;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id=p_class_id AND public.class_agit_class_is_open_v1(c.id)
          AND (c.teacher_id=auth.uid() OR EXISTS(SELECT 1 FROM public.students s WHERE s.class_id=c.id AND s.auth_id=auth.uid()
            AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE))
    ) THEN RAISE EXCEPTION '이 학급 전시를 볼 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id AND state='published';
    IF NOT FOUND THEN RAISE EXCEPTION '공개 중인 전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF p_room IS NULL OR p_room NOT BETWEEN 1 AND ((public.class_agit_max_works_v1()+11)/12) THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    -- 공개 JSON 전체를 반환하지 않는다. 최신 자격/철회 상태를 통과한 표시 필드만 한 방씩 반환한다.
    WITH visible AS MATERIALIZED (
        SELECT w.value,w.ordinality FROM jsonb_array_elements(v_ex.published_snapshot->'works') WITH ORDINALITY w
        JOIN public.class_agit_items i ON i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(w.value->>'itemId')::UUID
        WHERE i.revoked_at IS NULL AND i.consent_id=(w.value->>'consentId')::UUID
            AND public.class_agit_current_source_v1(p_class_id,i.post_id) IS NOT NULL
    ), numbered AS (SELECT *,row_number() OVER(ORDER BY ordinality) AS n FROM visible)
    SELECT (SELECT count(*)::INTEGER FROM visible),COALESCE(jsonb_agg(jsonb_build_object('id','published-' || ordinality,
        'title',value->>'title','author',value->>'authorName','format',value->>'format','kindLabel',value->>'kindLabel',
        'excerpt',value->>'excerpt','blocks',value->'blocks') ORDER BY ordinality) FILTER(WHERE n BETWEEN (p_room-1)*12+1 AND p_room*12),'[]')
    INTO v_total,v_works FROM numbered;
    v_rooms:=GREATEST(1,(v_total+11)/12);
    RETURN jsonb_build_object('version',1,'publication_no',v_ex.publication_no,'room',p_room,'room_count',v_rooms,'total_count',v_total,
        'blocked_count',jsonb_array_length(v_ex.published_snapshot->'works')-v_total,
        'exhibition',jsonb_build_object('title',v_ex.published_snapshot->>'title','introduction',v_ex.published_snapshot->>'introduction','audience','class','works',v_works));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.class_agit_visible_works_v1(p_class_id UUID,p_exhibition_id UUID)
RETURNS TABLE(work_id TEXT,sort_position BIGINT,snapshot JSONB)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
    SELECT 'published-'||w.ordinality,row_number() OVER(ORDER BY w.ordinality),w.value
    FROM public.class_agit_exhibitions e
    CROSS JOIN LATERAL jsonb_array_elements(e.published_snapshot->'works') WITH ORDINALITY w
    JOIN public.class_agit_items i ON i.class_id=e.class_id AND i.exhibition_id=e.id AND i.id=(w.value->>'itemId')::UUID
    WHERE e.class_id=p_class_id AND e.id=p_exhibition_id AND e.state='published'
      AND i.revoked_at IS NULL AND i.consent_id=(w.value->>'consentId')::UUID
      AND public.class_agit_current_source_v1(p_class_id,i.post_id) IS NOT NULL
    ORDER BY w.ordinality LIMIT public.class_agit_max_works_v1();
$$;
REVOKE ALL ON FUNCTION public.class_agit_visible_works_v1(UUID,UUID) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_room_v1(p_exhibition_id UUID,p_room INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_items JSONB; v_rooms JSONB; v_total INTEGER;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_room IS NULL OR p_room NOT BETWEEN 0 AND ((public.class_agit_max_works_v1()+11)/12) THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=v_class AND id=p_exhibition_id AND state='published' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 전시를 볼 수 없어요.' USING ERRCODE='42501'; END IF;
    WITH visible AS MATERIALIZED (SELECT * FROM public.class_agit_visible_works_v1(v_class,p_exhibition_id)),
    rooms AS (SELECT ((sort_position-1)/12+1)::INTEGER AS number,count(*)::INTEGER AS count FROM visible GROUP BY 1)
    SELECT (SELECT count(*) FROM visible),
        COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY number) FROM rooms r),'[]'),
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id',work_id,'title',snapshot->>'title','author',snapshot->>'authorName',
            'format',snapshot->>'format','kindLabel',snapshot->>'kindLabel','excerpt',snapshot->>'excerpt') ORDER BY sort_position)
            FROM visible WHERE sort_position BETWEEN (p_room-1)*12+1 AND p_room*12),'[]')
    INTO v_total,v_rooms,v_items;
    RETURN jsonb_build_object('version',1,'exhibition_id',v_ex.id,'publication_no',v_ex.publication_no,
        'title',v_ex.published_snapshot->>'title','introduction',v_ex.published_snapshot->>'introduction',
        'room',p_room,'rooms',v_rooms,'total_count',v_total,'items',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_work_v1(p_exhibition_id UUID,p_publication_no INTEGER,p_work_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_class UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_item RECORD;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_work_id IS NULL OR NOT public.class_agit_valid_work_id_v1(p_work_id) THEN RAISE EXCEPTION '작품 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=v_class AND id=p_exhibition_id AND state='published' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 전시를 볼 수 없어요.' USING ERRCODE='42501'; END IF;
    IF p_publication_no IS DISTINCT FROM v_ex.publication_no THEN RAISE EXCEPTION '전시가 새로 바뀌었어요. 전시실에서 작품을 다시 골라 주세요.' USING ERRCODE='PT409'; END IF;
    WITH visible AS MATERIALIZED (SELECT *,lag(work_id) OVER(ORDER BY sort_position) AS previous_id,lead(work_id) OVER(ORDER BY sort_position) AS next_id
        FROM public.class_agit_visible_works_v1(v_class,p_exhibition_id))
    SELECT * INTO v_item FROM visible WHERE work_id=p_work_id;
    IF NOT FOUND THEN RAISE EXCEPTION '이 작품은 지금 읽을 수 없어요. 전시실에서 다른 작품을 골라 주세요.' USING ERRCODE='42501'; END IF;
    RETURN jsonb_build_object('version',1,'publication_no',v_ex.publication_no,'previous_id',v_item.previous_id,'next_id',v_item.next_id,
        'work',jsonb_build_object('id',v_item.work_id,'title',v_item.snapshot->>'title','author',v_item.snapshot->>'authorName',
            'format',v_item.snapshot->>'format','kindLabel',v_item.snapshot->>'kindLabel','excerpt',v_item.snapshot->>'excerpt','blocks',v_item.snapshot->'blocks'));
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_work_v1(UUID,INTEGER,TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_work_v1(UUID,INTEGER,TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_class_agit_share_workspace_v1(p_class_id UUID,p_exhibition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_share JSONB; v_items JSONB; v_ex public.class_agit_exhibitions%ROWTYPE; v_selected JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT jsonb_build_object('revision',s.revision,'publication_no',s.publication_no,'title',s.title,'introduction',s.introduction,
        'expires_at',s.expires_at,'revoked',s.revoked_at IS NOT NULL,'expired',s.expires_at<=now()) INTO v_share
        FROM public.class_agit_external_shares s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id;
    SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position),'[]') INTO v_items FROM (
        SELECT i.position,i.snapshot||jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'sourceRevision',i.source_revision,'publicAlias',i.public_alias,
            'unavailable',cur.data IS NULL,'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision) AS data
        FROM public.class_agit_items i LEFT JOIN LATERAL(SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
        WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.removed_at IS NULL ORDER BY i.position LIMIT public.class_agit_max_works_v1()) q;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'title',i.snapshot->>'title','author',i.snapshot->>'author','revoked',i.revoked_at IS NOT NULL) ORDER BY i.position),'[]') INTO v_selected
        FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id;
    RETURN jsonb_build_object('version',1,'exhibition_revision',v_ex.revision,'share',v_share,'candidates',v_items,'published_items',v_selected,
        'external_enabled',(SELECT external_enabled FROM public.class_agit_rollout WHERE singleton));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.run_class_agit_share_action_v1(p_class_id UUID,p_exhibition_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_share public.class_agit_external_shares%ROWTYPE;
    v_item JSONB; v_source JSONB; v_n INTEGER:=0; v_token TEXT:=p_payload->>'token'; v_hash TEXT; v_days INTEGER; v_external_item UUID;
BEGIN
    v_actor:=public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>public.class_agit_max_works_v1()*500 THEN RAISE EXCEPTION '공개 요청을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    PERFORM id FROM public.classes WHERE id=p_class_id FOR UPDATE;
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT * INTO v_share FROM public.class_agit_external_shares WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id FOR UPDATE;
    IF p_action IN('publish','rotate') THEN
        IF v_token IS NULL OR v_token !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION '새 공유 주소를 준비해 주세요.' USING ERRCODE='22023'; END IF;
        v_hash:=encode(extensions.digest(v_token,'sha256'),'hex');
        -- 같은 토큰으로 잃어버린 응답을 재시도해도 중복 발행/판 증가가 없다.
        IF v_share.token_hash=v_hash AND v_share.revoked_at IS NULL THEN RETURN public.get_class_agit_share_workspace_v1(p_class_id,p_exhibition_id); END IF;
    END IF;
    IF COALESCE((p_payload->>'expected_revision')::INTEGER,0) IS DISTINCT FROM COALESCE(v_share.revision,0)
        THEN RAISE EXCEPTION '공유 설정이 변경되었습니다. 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF p_action IN('publish','rotate','extend') THEN
        IF NOT (SELECT external_enabled FROM public.class_agit_rollout WHERE singleton) THEN RAISE EXCEPTION '관리자가 외부 공유를 허용한 뒤 발행할 수 있습니다.' USING ERRCODE='42501'; END IF;
        v_days:=(p_payload->>'days')::INTEGER;
        IF v_days IS NULL OR v_days NOT BETWEEN 1 AND 30 THEN RAISE EXCEPTION '공유 기간은 1~30일입니다.' USING ERRCODE='22023'; END IF;
    END IF;
    IF p_action='publish' THEN
        IF v_ex.state='archived' OR p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '외부 공개 내용을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF (p_payload->>'exhibition_revision')::INTEGER IS DISTINCT FROM v_ex.revision THEN RAISE EXCEPTION '전시 작품이 바뀌었습니다. 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
        IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND public.class_agit_max_works_v1()
            OR length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '공개 제목과 1~%편의 작품을 확인해 주세요.', public.class_agit_max_works_v1() USING ERRCODE='22023'; END IF;
        IF (SELECT count(DISTINCT x->>'itemId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items')
            THEN RAISE EXCEPTION '같은 작품을 중복 선택할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.class_id=p.class_id AND i.post_id=p.id
            WHERE p.class_id=p_class_id AND i.exhibition_id=p_exhibition_id ORDER BY p.id FOR SHARE OF p;
        INSERT INTO public.class_agit_external_shares(id,class_id,exhibition_id,title,introduction,token_hash,expires_at)
        VALUES(p_exhibition_id,p_class_id,p_exhibition_id,btrim(p_payload->>'title'),COALESCE(p_payload->>'introduction',''),v_hash,now()+make_interval(days=>v_days))
        ON CONFLICT(exhibition_id) DO UPDATE SET title=EXCLUDED.title,introduction=EXCLUDED.introduction,token_hash=v_hash,expires_at=EXCLUDED.expires_at,
            revoked_at=NULL,revision=class_agit_external_shares.revision+1,publication_no=class_agit_external_shares.publication_no+1,updated_at=now();
        DELETE FROM public.class_agit_external_items WHERE class_id=p_class_id AND share_id=p_exhibition_id;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) INTO v_source FROM public.class_agit_items i
                WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(v_item->>'itemId')::UUID AND i.removed_at IS NULL;
            IF v_source IS NULL THEN RAISE EXCEPTION '공개할 수 없는 원글이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_source->>'source_revision' IS DISTINCT FROM v_item->>'sourceRevision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
            IF v_item->'externalConfirmed' IS DISTINCT FROM 'true'::JSONB OR length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30
                THEN RAISE EXCEPTION '작품별 외부 공개 의사와 가림 이름을 확인해 주세요.' USING ERRCODE='22023'; END IF;
            v_n:=v_n+1;
            INSERT INTO public.class_agit_external_items(class_id,share_id,post_id,student_id,position,snapshot)
            VALUES(p_class_id,p_exhibition_id,(v_source->>'id')::UUID,(v_source->>'student_id')::UUID,v_n,
                jsonb_build_object('title',v_source->>'title','author',btrim(v_item->>'publicAlias'),'format',v_source->>'format',
                    'kindLabel',v_source->>'kindLabel','excerpt',v_source->>'excerpt','blocks',v_source->'blocks')) RETURNING id INTO v_external_item;
            INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_external_item,'external','confirmed',v_actor);
        END LOOP;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id)
            VALUES(p_class_id,p_exhibition_id,'external','confirmed',v_actor),(p_class_id,p_exhibition_id,'external','published',v_actor);
    ELSIF p_action IN('rotate','extend') THEN
        IF v_share.id IS NULL OR v_share.revoked_at IS NOT NULL THEN RAISE EXCEPTION '외부 공개본을 먼저 발행해 주세요.' USING ERRCODE='22023'; END IF;
        UPDATE public.class_agit_external_shares SET token_hash=CASE WHEN p_action='rotate' THEN v_hash ELSE token_hash END,
            expires_at=now()+make_interval(days=>v_days),revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_share.id;
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
    RETURN public.get_class_agit_share_workspace_v1(p_class_id,p_exhibition_id);
END; $$;
REVOKE ALL ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) TO authenticated;

CREATE OR REPLACE FUNCTION public.read_public_class_agit_v1(p_token TEXT,p_room INTEGER DEFAULT 0,p_work_id TEXT DEFAULT NULL,p_publication_no INTEGER DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public SET statement_timeout='3s' SET lock_timeout='1s' AS $$
DECLARE v_share public.class_agit_external_shares%ROWTYPE; v_items JSONB; v_work JSONB; v_count INTEGER; v_rooms JSONB;
BEGIN
    PERFORM set_config('response.status','200',TRUE);
    PERFORM set_config('response.headers','[{"Cache-Control":"no-store"},{"Referrer-Policy":"no-referrer"},{"X-Robots-Tag":"noindex, nofollow, noarchive"}]',TRUE);
    IF NOT public.class_agit_take_public_budget_v1('global',3000) THEN
        PERFORM set_config('response.status','429',TRUE); RETURN jsonb_build_object('version',1,'error','rate_limited'); END IF;
    IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' OR p_room IS NULL OR p_room NOT BETWEEN 0 AND ((public.class_agit_max_works_v1()+11)/12)
        OR (p_work_id IS NOT NULL AND NOT public.class_agit_valid_work_id_v1(p_work_id)) THEN
        PERFORM set_config('response.status','404',TRUE); RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    SELECT * INTO v_share FROM public.class_agit_external_shares s WHERE s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
        AND s.revoked_at IS NULL AND s.expires_at>now() AND public.class_agit_class_is_allowed_v1(s.class_id)
        AND EXISTS(SELECT 1 FROM public.class_agit_rollout WHERE singleton AND external_enabled) FOR SHARE;
    IF NOT FOUND THEN PERFORM set_config('response.status','404',TRUE); RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    IF NOT public.class_agit_take_public_budget_v1('share:'||v_share.id,600) THEN
        PERFORM set_config('response.status','429',TRUE); RETURN jsonb_build_object('version',1,'error','rate_limited'); END IF;
    IF p_work_id IS NOT NULL AND p_publication_no IS DISTINCT FROM v_share.publication_no THEN
        PERFORM set_config('response.status','409',TRUE); RETURN jsonb_build_object('version',1,'error','changed'); END IF;
    WITH visible AS MATERIALIZED (
        SELECT i.position,'published-'||i.position AS work_id,i.snapshot,row_number() OVER(ORDER BY i.position) AS n
        FROM public.class_agit_external_items i WHERE i.class_id=v_share.class_id AND i.share_id=v_share.id AND i.revoked_at IS NULL
            AND public.class_agit_current_source_v1(v_share.class_id,i.post_id) IS NOT NULL ORDER BY i.position LIMIT public.class_agit_max_works_v1()
    ), rooms AS (SELECT ((n-1)/12+1)::INTEGER AS number,count(*)::INTEGER AS count FROM visible GROUP BY 1)
    SELECT (SELECT count(*) FROM visible),COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY number) FROM rooms r),'[]'),
        COALESCE((SELECT jsonb_agg((snapshot-'blocks')||jsonb_build_object('id',work_id) ORDER BY n) FROM visible
            WHERE n BETWEEN (p_room-1)*12+1 AND p_room*12),'[]'),
        (SELECT snapshot||jsonb_build_object('id',work_id) FROM visible WHERE work_id=p_work_id)
    INTO v_count,v_rooms,v_items,v_work;
    IF p_work_id IS NOT NULL AND v_work IS NULL THEN PERFORM set_config('response.status','404',TRUE); RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    RETURN jsonb_build_object('version',1,'title',v_share.title,'introduction',v_share.introduction,'publication_no',v_share.publication_no,
        'room',p_room,'total_count',v_count,'rooms',v_rooms,'items',CASE WHEN p_work_id IS NULL THEN v_items ELSE '[]'::JSONB END,'work',v_work);
END; $$;
REVOKE ALL ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER) TO anon,authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

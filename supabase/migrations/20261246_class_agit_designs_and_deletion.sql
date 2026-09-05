-- 독립 전시/문집 편집: 디자인·실제 판형 저장, 확정 시 동결, 원글을 보존하는 삭제.
BEGIN;
ALTER TABLE public.class_agit_exhibitions ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'garden' CHECK(theme IN ('garden','museum','library','night'));
ALTER TABLE public.class_agit_external_shares ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'garden' CHECK(theme IN ('garden','museum','library','night'));
ALTER TABLE public.class_agit_publication_catalog ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'garden' CHECK(theme IN ('garden','museum','library','night'));
ALTER TABLE public.class_agit_books ADD COLUMN IF NOT EXISTS paper_format TEXT NOT NULL DEFAULT 'A4' CHECK(paper_format IN ('A4','A5','B5'));
ALTER TABLE public.class_agit_books ADD COLUMN IF NOT EXISTS design_id TEXT NOT NULL DEFAULT 'botanical' CHECK(design_id IN ('botanical','editorial','notebook','constellation'));


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
                'missionId',post.mission_id,'sourceRevision',i.source_revision,'publicAlias',i.public_alias,'authorNumber',i.position,
                'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision,
                'unavailable',cur.data IS NULL,'revoked',i.revoked_at IS NOT NULL,
                'scopes',jsonb_build_object('class',i.revoked_at IS NULL,'anthology',FALSE,'external',FALSE)) AS data
            FROM public.class_agit_items i LEFT JOIN public.student_posts post ON post.id=i.post_id AND post.class_id=i.class_id LEFT JOIN LATERAL (SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
            WHERE i.class_id = p_class_id AND i.exhibition_id = p_exhibition_id AND i.removed_at IS NULL
            ORDER BY i.position,i.id LIMIT public.class_agit_max_works_v1()
        ) q;
        v_draft := jsonb_build_object('id',v_ex.id,'classId',p_class_id,'title',v_ex.title,'introduction',v_ex.introduction,'theme',v_ex.theme,
            'revision',v_ex.revision,'state',v_ex.state,'publicationNo',v_ex.publication_no,'items',v_items);
    END IF;
    RETURN jsonb_build_object('version',1,'rollout','internal','class',jsonb_build_object('id',p_class_id,
        'module_enabled',(SELECT COALESCE('class-agit'=ANY(c.enabled_modules),FALSE) FROM public.classes c WHERE c.id=p_class_id),
        'enabled_modules',(SELECT c.enabled_modules FROM public.classes c WHERE c.id=p_class_id),
        'vocab_tower_enabled',(SELECT c.vocab_tower_enabled FROM public.classes c WHERE c.id=p_class_id)),
        'projects',v_projects,'students',v_students,'draft',v_draft);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_workspace_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_workspace_v1(UUID,UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_class_agit_book_workspace_v1(p_class_id UUID,p_book_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_books JSONB; v_students JSONB; v_book JSONB; v_items JSONB; v_editions JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY updated_at DESC,id DESC),'[]') INTO v_books FROM (
        SELECT id,title,archived,revision,updated_at FROM public.class_agit_books WHERE class_id=p_class_id ORDER BY updated_at DESC,id DESC LIMIT 20) q;
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY name,id),'[]') INTO v_students FROM (
        SELECT id,left(name,30) AS name FROM public.students WHERE class_id=p_class_id AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE ORDER BY name,id LIMIT 100) q;
    IF p_book_id IS NOT NULL THEN
        SELECT to_jsonb(b) INTO v_book FROM public.class_agit_books b WHERE b.class_id=p_class_id AND b.id=p_book_id;
        IF v_book IS NULL THEN RAISE EXCEPTION '문집을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position,q.id),'[]') INTO v_items FROM (
            SELECT i.id,i.position,i.snapshot||jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'studentId',i.student_id,
                'missionId',post.mission_id,'sourceRevision',i.source_revision,'revoked',i.revoked_at IS NOT NULL,'unavailable',cur.data IS NULL,
                'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision) AS data
            FROM public.class_agit_book_items i LEFT JOIN public.student_posts post ON post.id=i.post_id AND post.class_id=i.class_id LEFT JOIN LATERAL (SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
            WHERE i.class_id=p_class_id AND i.book_id=p_book_id AND i.removed_at IS NULL ORDER BY i.position,i.id LIMIT 100) q;
        SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY number DESC),'[]') INTO v_editions FROM (
            SELECT id,number,created_at,student_visible,snapshot->>'title' AS title,snapshot->'print' AS print FROM public.class_agit_book_editions
            WHERE class_id=p_class_id AND book_id=p_book_id ORDER BY number DESC LIMIT 20) q;
        v_book:=v_book||jsonb_build_object('items',v_items,'editions',v_editions);
    END IF;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'books',v_books,'students',v_students,'book',v_book);
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_book_workspace_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_book_workspace_v1(UUID,UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.class_agit_book_draft_snapshot_v1(p_class_id UUID,p_book_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_book public.class_agit_books%ROWTYPE; v_old public.class_agit_book_items%ROWTYPE; v_source JSONB; v_items JSONB:='[]';
BEGIN
    SELECT * INTO v_book FROM public.class_agit_books WHERE class_id=p_class_id AND id=p_book_id FOR SHARE;
    IF NOT FOUND OR v_book.archived THEN RAISE EXCEPTION '문집 초안을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_book_items i ON i.class_id=p.class_id AND i.post_id=p.id
            WHERE p.class_id=p_class_id AND i.book_id=p_book_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p;
        FOR v_old IN SELECT * FROM public.class_agit_book_items WHERE class_id=p_class_id AND book_id=p_book_id AND removed_at IS NULL ORDER BY position,id LOOP
            v_source:=public.class_agit_current_source_v1(p_class_id,v_old.post_id);
            IF v_source IS NULL OR v_old.revoked_at IS NOT NULL THEN RAISE EXCEPTION '수록할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_old.source_revision IS DISTINCT FROM v_source->>'source_revision' THEN RAISE EXCEPTION '원글 전문을 다시 확인하고 저장해 주세요.' USING ERRCODE='PT409'; END IF;
            v_items:=v_items||jsonb_build_array(v_old.snapshot||jsonb_build_object('itemId',v_old.id,'consentId',v_old.consent_id));
        END LOOP;
        IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION '문집에는 1~100편의 작품이 필요합니다.' USING ERRCODE='23514'; END IF;
    RETURN jsonb_build_object('title',v_book.title,'subtitle',v_book.subtitle,'introduction',v_book.introduction,
            'class_label',v_book.class_label,'term',v_book.term,'issue_date',v_book.issue_date,'grouping',v_book.grouping,'print',jsonb_build_object('paper',v_book.paper_format,'design',v_book.design_id,'body_pt',12,'poem_pt',14,'version',2),'works',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_book_draft_snapshot_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.run_class_agit_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB DEFAULT '{}')
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET lock_timeout='250ms' SET search_path = public AS $$
DECLARE v_actor UUID; v_id UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_data JSONB; v_item JSONB; v_snapshot JSONB;
    v_existing public.class_agit_items%ROWTYPE; v_item_id UUID; v_position INTEGER := 0; v_items JSONB := '[]'; v_post_id UUID;
    v_old_enabled BOOLEAN; v_selection_changed BOOLEAN; v_modules TEXT[]; v_legacy_enabled BOOLEAN;
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
        IF COALESCE(p_payload->>'theme',v_ex.theme) NOT IN ('garden','museum','library','night') THEN
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
            v_position := v_position + 1; v_post_id := (v_item->>'sourceId')::UUID;
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
            INSERT INTO public.class_agit_items(class_id,exhibition_id,post_id,student_id,position,source_revision,snapshot,public_alias,confirmed_by)
            VALUES(p_class_id,v_id,v_post_id,(v_data->>'student_id')::UUID,v_position,v_data->>'source_revision',v_snapshot,btrim(v_item->>'publicAlias'),v_actor)
            ON CONFLICT(exhibition_id,post_id) DO UPDATE SET position=EXCLUDED.position,source_revision=EXCLUDED.source_revision,snapshot=EXCLUDED.snapshot,
                public_alias=EXCLUDED.public_alias,removed_at=NULL,revoked_at=NULL,
                confirmed_by=CASE WHEN v_selection_changed THEN v_actor ELSE class_agit_items.confirmed_by END,
                confirmed_at=CASE WHEN v_selection_changed THEN NOW() ELSE class_agit_items.confirmed_at END,
                consent_id=CASE WHEN v_existing.revoked_at IS NOT NULL THEN gen_random_uuid() ELSE class_agit_items.consent_id END
            RETURNING id INTO v_item_id;
            IF v_selection_changed THEN INSERT INTO public.class_agit_consent_events(class_id,item_id,action,actor_id) VALUES(p_class_id,v_item_id,'selected',v_actor); END IF;
        END LOOP;
        UPDATE public.class_agit_exhibitions SET theme=COALESCE(p_payload->>'theme',v_ex.theme),title=btrim(p_payload->>'title'),introduction=COALESCE(p_payload->>'introduction',''),revision=revision+1,updated_at=NOW()
        WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action = 'publish' THEN
        IF NOT v_old_enabled THEN RAISE EXCEPTION '학생 공개 스위치를 먼저 켜 주세요.' USING ERRCODE='42501'; END IF;
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '학급 공개 내용을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.post_id=p.id AND i.class_id=p.class_id
        WHERE p.class_id=p_class_id AND i.exhibition_id=v_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p NOWAIT;
        FOR v_existing IN SELECT * FROM public.class_agit_items WHERE class_id=p_class_id AND exhibition_id=v_id AND removed_at IS NULL ORDER BY position,id LOOP
            v_data := public.class_agit_current_source_v1(p_class_id,v_existing.post_id);
            IF v_existing.revoked_at IS NOT NULL OR v_data IS NULL THEN RAISE EXCEPTION '수록이 철회되었거나 공개할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_existing.source_revision IS DISTINCT FROM v_data->>'source_revision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인하고 초안을 저장해 주세요.' USING ERRCODE='PT409'; END IF;
            v_items := v_items || jsonb_build_array(v_existing.snapshot || jsonb_build_object('itemId',v_existing.id,'consentId',v_existing.consent_id));
        END LOOP;
        IF jsonb_array_length(v_items) NOT BETWEEN 1 AND public.class_agit_max_works_v1() THEN RAISE EXCEPTION '공개할 작품을 먼저 담아 주세요.' USING ERRCODE='23514'; END IF;
        UPDATE public.class_agit_exhibitions SET state='published',publication_no=publication_no+1,published_at=NOW(),revision=revision+1,updated_at=NOW(),
            published_snapshot=jsonb_build_object('title',title,'introduction',introduction,'theme',theme,'works',v_items)
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
REVOKE ALL ON FUNCTION public.run_class_agit_action_v1(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_action_v1(UUID,TEXT,JSONB) TO authenticated;


CREATE OR REPLACE FUNCTION public.run_class_agit_book_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor UUID; v_id UUID:=(p_payload->>'book_id')::UUID; v_book public.class_agit_books%ROWTYPE;
    v_item JSONB; v_source JSONB; v_items JSONB:='[]'; v_item_id UUID; v_post UUID; v_n INTEGER:=0; v_number INTEGER;
    v_old public.class_agit_book_items%ROWTYPE; v_snapshot JSONB; v_edition UUID;
BEGIN
    v_actor:=public.assert_class_agit_manager_v1(p_class_id);
    IF v_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>60000
        THEN RAISE EXCEPTION '문집 요청을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    PERFORM id FROM public.classes WHERE id=p_class_id FOR UPDATE;
    SELECT * INTO v_book FROM public.class_agit_books WHERE class_id=p_class_id AND id=v_id FOR UPDATE;
    IF p_action='create' THEN
        IF FOUND THEN RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id); END IF;
        IF (SELECT count(*) FROM public.class_agit_books WHERE class_id=p_class_id)>=20 THEN RAISE EXCEPTION '문집은 학급당 20권까지 보관합니다.' USING ERRCODE='23514'; END IF;
        INSERT INTO public.class_agit_books(id,class_id) VALUES(v_id,p_class_id);
        RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id);
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION '문집을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF (p_payload->>'expected_revision')::INTEGER IS DISTINCT FROM v_book.revision
        THEN RAISE EXCEPTION '문집이 다른 화면에서 변경되었습니다. 입력을 확인한 뒤 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF p_action='delete' THEN
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN
            RAISE EXCEPTION '문집 삭제 동작을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        -- Editions and book items cascade; original posts and exhibitions remain intact.
        DELETE FROM public.class_agit_books WHERE class_id=p_class_id AND id=v_id;
        RETURN public.get_class_agit_book_workspace_v1(p_class_id,NULL);
    END IF;
    IF v_book.archived AND p_action NOT IN('restore','hide','withdraw') THEN RAISE EXCEPTION '보관한 문집을 먼저 복원해 주세요.' USING ERRCODE='22023'; END IF;
    IF p_action='save' THEN
        IF COALESCE(p_payload->>'paper_format',v_book.paper_format) NOT IN ('A4','A5','B5')
            OR COALESCE(p_payload->>'design_id',v_book.design_id) NOT IN ('botanical','editorial','notebook','constellation') THEN
            RAISE EXCEPTION '문집 판형과 디자인을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')>100
            OR length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80
            THEN RAISE EXCEPTION '문집 제목과 작품 수(최대 100편)를 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF (SELECT count(DISTINCT x->>'sourceId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items')
            THEN RAISE EXCEPTION '같은 작품을 중복 수록할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p WHERE p.class_id=p_class_id AND p.id IN(
            SELECT (x->>'sourceId')::UUID FROM jsonb_array_elements(p_payload->'items') x) ORDER BY p.id FOR SHARE;
        UPDATE public.class_agit_book_items SET removed_at=now() WHERE class_id=p_class_id AND book_id=v_id AND removed_at IS NULL;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            v_post:=(v_item->>'sourceId')::UUID; v_source:=public.class_agit_current_source_v1(p_class_id,v_post);
            IF v_source IS NULL THEN RAISE EXCEPTION '수록할 수 없는 원글이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_item->>'sourceRevision' IS DISTINCT FROM v_source->>'source_revision' THEN RAISE EXCEPTION '바뀐 원글의 전문을 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
            v_n:=v_n+1;
            SELECT * INTO v_old FROM public.class_agit_book_items WHERE class_id=p_class_id AND book_id=v_id AND post_id=v_post;
            v_snapshot:=jsonb_build_object('title',v_source->>'title','author',v_source->>'student_name','format',v_source->>'format',
                'kindLabel',v_source->>'kindLabel','blocks',v_source->'blocks','excerpt',v_source->>'excerpt','group',v_source->>'group_title');
            INSERT INTO public.class_agit_book_items(class_id,book_id,post_id,student_id,position,source_revision,snapshot)
            VALUES(p_class_id,v_id,v_post,(v_source->>'student_id')::UUID,v_n,v_source->>'source_revision',v_snapshot)
            ON CONFLICT(book_id,post_id) DO UPDATE SET position=EXCLUDED.position,source_revision=EXCLUDED.source_revision,snapshot=EXCLUDED.snapshot,
                consent_id=CASE WHEN class_agit_book_items.revoked_at IS NOT NULL THEN gen_random_uuid() ELSE class_agit_book_items.consent_id END,
                revoked_at=NULL,removed_at=NULL RETURNING id INTO v_item_id;
            IF v_old.id IS NULL OR v_old.revoked_at IS NOT NULL OR v_old.source_revision<>v_source->>'source_revision' THEN
                INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_item_id,'anthology','selected',v_actor); END IF;
        END LOOP;
        UPDATE public.class_agit_books SET paper_format=COALESCE(p_payload->>'paper_format',v_book.paper_format),design_id=COALESCE(p_payload->>'design_id',v_book.design_id),title=btrim(p_payload->>'title'),subtitle=COALESCE(p_payload->>'subtitle',''),introduction=COALESCE(p_payload->>'introduction',''),
            class_label=COALESCE(p_payload->>'class_label',''),term=COALESCE(p_payload->>'term',''),issue_date=(p_payload->>'issue_date')::DATE,
            grouping=COALESCE(p_payload->>'grouping','custom') WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action='finalize' THEN
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '문집 확정 동작을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        v_snapshot:=public.class_agit_book_draft_snapshot_v1(p_class_id,v_id);
        SELECT COALESCE(max(number),0)+1 INTO v_number FROM public.class_agit_book_editions WHERE class_id=p_class_id AND book_id=v_id;
        IF v_number>20 THEN RAISE EXCEPTION '확정판은 20판까지 보관합니다. 새 문집을 만들어 주세요.' USING ERRCODE='23514'; END IF;
        INSERT INTO public.class_agit_book_editions(class_id,book_id,number,snapshot)
        VALUES(p_class_id,v_id,v_number,v_snapshot);
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_id,'anthology','published',v_actor);
    ELSIF p_action IN('show','hide') THEN
        v_edition:=(p_payload->>'edition_id')::UUID;
        IF NOT EXISTS(SELECT 1 FROM public.class_agit_book_editions WHERE class_id=p_class_id AND book_id=v_id AND id=v_edition)
            THEN RAISE EXCEPTION '확정판을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        UPDATE public.class_agit_book_editions SET student_visible=FALSE WHERE class_id=p_class_id AND book_id=v_id;
        IF p_action='show' THEN UPDATE public.class_agit_book_editions SET student_visible=TRUE WHERE class_id=p_class_id AND book_id=v_id AND id=v_edition; END IF;
    ELSIF p_action='withdraw' THEN
        UPDATE public.class_agit_book_items SET revoked_at=COALESCE(revoked_at,now()) WHERE class_id=p_class_id AND book_id=v_id AND id=(p_payload->>'item_id')::UUID;
        IF NOT FOUND THEN RAISE EXCEPTION '수록 작품을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,(p_payload->>'item_id')::UUID,'anthology','withdrawn',v_actor);
    ELSIF p_action IN('archive','restore') THEN
        UPDATE public.class_agit_books SET archived=p_action='archive' WHERE class_id=p_class_id AND id=v_id;
        UPDATE public.class_agit_book_editions SET student_visible=FALSE WHERE class_id=p_class_id AND book_id=v_id;
    ELSE RAISE EXCEPTION '지원하지 않는 문집 동작입니다.' USING ERRCODE='22023'; END IF;
    UPDATE public.class_agit_books SET revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_id;
    RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id);
END; $$;
REVOKE ALL ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) TO authenticated;


CREATE OR REPLACE FUNCTION public.class_agit_refresh_catalog_v1(p_class_id UUID,p_exhibition_id UUID,p_scope TEXT)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF p_scope='external' THEN
        INSERT INTO public.class_agit_publication_catalog(class_id,exhibition_id,scope,publication_no,title,introduction,theme)
        SELECT s.class_id,s.exhibition_id,'external',s.publication_no,s.title,s.introduction,s.theme FROM public.class_agit_external_shares s
        WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id
        ON CONFLICT(class_id,exhibition_id,scope) DO NOTHING;
    END IF;
    -- Serialize only tiny layout writes, independently of source/exhibition/share locks.
    PERFORM 1 FROM public.class_agit_publication_catalog WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND scope=p_scope FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;
    DELETE FROM public.class_agit_publication_slots WHERE class_id=p_class_id AND exhibition_id=p_exhibition_id AND scope=p_scope;
    INSERT INTO public.class_agit_publication_slots(class_id,exhibition_id,scope,work_no,display_position,room_no,summary)
    SELECT p_class_id,p_exhibition_id,p_scope,work_no,n,((n-1)/12+1),summary||jsonb_build_object('id','published-'||work_no)
    FROM (
        SELECT work_no,summary,(row_number() OVER(ORDER BY work_no))::INTEGER AS n FROM (
            SELECT i.work_no,i.summary FROM public.class_agit_published_items i
                WHERE p_scope='class' AND i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.revoked_at IS NULL
            UNION ALL
            SELECT i.position,i.summary FROM public.class_agit_external_items i
                WHERE p_scope='external' AND i.class_id=p_class_id AND i.share_id=p_exhibition_id AND i.revoked_at IS NULL
        ) source ORDER BY work_no LIMIT public.class_agit_max_works_v1()
    ) numbered;
    UPDATE public.class_agit_publication_catalog c SET
        total_count=(SELECT count(*) FROM public.class_agit_publication_slots s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.scope=p_scope),
        rooms=COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.number) FROM (
            SELECT s.room_no AS number,count(*)::INTEGER AS count FROM public.class_agit_publication_slots s
            WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.scope=p_scope GROUP BY s.room_no) r),'[]'),
        original_count=CASE WHEN p_scope='class' THEN (SELECT count(*) FROM public.class_agit_published_items i WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id)
            ELSE (SELECT count(*) FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id) END,
        visibility_revision=visibility_revision+1
    WHERE c.class_id=p_class_id AND c.exhibition_id=p_exhibition_id AND c.scope=p_scope;
    IF p_scope='external' THEN
        UPDATE public.class_agit_publication_catalog c SET publication_no=s.publication_no,title=s.title,introduction=s.introduction,theme=s.theme
        FROM public.class_agit_external_shares s WHERE c.class_id=p_class_id AND c.exhibition_id=p_exhibition_id AND c.scope='external'
            AND s.class_id=c.class_id AND s.exhibition_id=c.exhibition_id;
    END IF;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_refresh_catalog_v1(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.class_agit_capture_publication_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
    IF NEW.published_snapshot IS NULL OR NEW.publication_no<1 THEN RETURN NEW; END IF;
    INSERT INTO public.class_agit_publication_catalog(class_id,exhibition_id,scope,publication_no,title,introduction,theme)
    VALUES(NEW.class_id,NEW.id,'class',NEW.publication_no,NEW.published_snapshot->>'title',NEW.published_snapshot->>'introduction',COALESCE(NEW.published_snapshot->>'theme','garden'))
    ON CONFLICT(class_id,exhibition_id,scope) DO UPDATE SET publication_no=EXCLUDED.publication_no,title=EXCLUDED.title,introduction=EXCLUDED.introduction,theme=EXCLUDED.theme;
    DELETE FROM public.class_agit_published_items WHERE class_id=NEW.class_id AND exhibition_id=NEW.id;
    INSERT INTO public.class_agit_published_items(class_id,exhibition_id,publication_no,work_no,item_id,consent_id,summary,blocks,revoked_at)
    SELECT NEW.class_id,NEW.id,NEW.publication_no,w.ordinality,(w.value->>'itemId')::UUID,(w.value->>'consentId')::UUID,
        jsonb_build_object('title',w.value->>'title','author',w.value->>'authorName','format',w.value->>'format',
            'kindLabel',w.value->>'kindLabel','excerpt',w.value->>'excerpt'),w.value->'blocks',
        CASE WHEN i.id IS NULL OR i.revoked_at IS NOT NULL OR i.consent_id IS DISTINCT FROM (w.value->>'consentId')::UUID THEN now() END
    FROM jsonb_array_elements(NEW.published_snapshot->'works') WITH ORDINALITY w
    LEFT JOIN public.class_agit_items i ON i.class_id=NEW.class_id AND i.exhibition_id=NEW.id AND i.id=(w.value->>'itemId')::UUID;
    PERFORM public.class_agit_refresh_catalog_v1(NEW.class_id,NEW.id,'class');
    RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.class_agit_capture_publication_v1() FROM PUBLIC,anon,authenticated,service_role;


CREATE OR REPLACE FUNCTION public.get_class_agit_share_workspace_v1(p_class_id UUID,p_exhibition_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_share JSONB; v_items JSONB; v_ex public.class_agit_exhibitions%ROWTYPE; v_selected JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_ex FROM public.class_agit_exhibitions WHERE class_id=p_class_id AND id=p_exhibition_id;
    IF NOT FOUND THEN RAISE EXCEPTION '전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT jsonb_build_object('revision',s.revision,'publication_no',s.publication_no,'title',s.title,'introduction',s.introduction,
        'starts_at',s.starts_at,'scheduled',s.starts_at>now(),'expires_at',s.expires_at,'revoked',s.revoked_at IS NOT NULL,'expired',s.expires_at<=now()) INTO v_share
        FROM public.class_agit_external_shares s WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id;
    SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position),'[]') INTO v_items FROM (
        SELECT i.position,i.snapshot||jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'sourceRevision',i.source_revision,'publicAlias',i.public_alias,
            'unavailable',cur.data IS NULL,'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision) AS data
        FROM public.class_agit_items i LEFT JOIN LATERAL(SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
        WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.removed_at IS NULL ORDER BY i.position LIMIT public.class_agit_max_works_v1()) q;
    SELECT COALESCE(jsonb_agg(jsonb_build_object('id',i.id,'title',i.snapshot->>'title','author',i.snapshot->>'author','revoked',i.revoked_at IS NOT NULL) ORDER BY i.position),'[]') INTO v_selected
        FROM public.class_agit_external_items i WHERE i.class_id=p_class_id AND i.share_id=p_exhibition_id;
    RETURN jsonb_build_object('version',1,'exhibition_revision',v_ex.revision,'exhibition_theme',v_ex.theme,'share',v_share,'candidates',v_items,'published_items',v_selected,
        'external_enabled',(SELECT external_enabled FROM public.class_agit_rollout WHERE singleton));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_share_workspace_v1(UUID,UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.run_class_agit_share_action_v1(p_class_id UUID,p_exhibition_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET lock_timeout='250ms' SET search_path=public AS $$
DECLARE v_actor UUID; v_ex public.class_agit_exhibitions%ROWTYPE; v_share public.class_agit_external_shares%ROWTYPE;
    v_item JSONB; v_source JSONB; v_n INTEGER:=0; v_token TEXT:=p_payload->>'token'; v_hash TEXT; v_start TIMESTAMPTZ; v_end TIMESTAMPTZ; v_external_item UUID;
BEGIN
    v_actor:=public.assert_class_agit_manager_v1(p_class_id);
    IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>public.class_agit_max_works_v1()*500 THEN RAISE EXCEPTION '공개 요청을 확인해 주세요.' USING ERRCODE='22023'; END IF;
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
        IF v_ex.state='archived' THEN RAISE EXCEPTION '보관한 전시를 먼저 복원해 주세요.' USING ERRCODE='22023'; END IF;
        IF (p_payload->>'exhibition_revision')::INTEGER IS DISTINCT FROM v_ex.revision THEN RAISE EXCEPTION '전시 작품이 바뀌었습니다. 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
        IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items') NOT BETWEEN 1 AND public.class_agit_max_works_v1()
            OR length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '공개 제목과 1~%편의 작품을 확인해 주세요.', public.class_agit_max_works_v1() USING ERRCODE='22023'; END IF;
        IF (SELECT count(DISTINCT x->>'itemId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items')
            THEN RAISE EXCEPTION '같은 작품을 중복 선택할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p JOIN public.class_agit_items i ON i.class_id=p.class_id AND i.post_id=p.id
            WHERE p.class_id=p_class_id AND i.exhibition_id=p_exhibition_id ORDER BY p.id FOR SHARE OF p NOWAIT;
        INSERT INTO public.class_agit_external_shares(id,class_id,exhibition_id,title,introduction,token_hash,starts_at,expires_at,theme)
        VALUES(p_exhibition_id,p_class_id,p_exhibition_id,btrim(p_payload->>'title'),COALESCE(p_payload->>'introduction',''),v_hash,v_start,v_end,v_ex.theme)
        ON CONFLICT(exhibition_id) DO UPDATE SET theme=EXCLUDED.theme,title=EXCLUDED.title,introduction=EXCLUDED.introduction,token_hash=v_hash,starts_at=EXCLUDED.starts_at,expires_at=EXCLUDED.expires_at,
            revoked_at=NULL,revision=class_agit_external_shares.revision+1,publication_no=class_agit_external_shares.publication_no+1,updated_at=now();
        DELETE FROM public.class_agit_external_items WHERE class_id=p_class_id AND share_id=p_exhibition_id;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) INTO v_source FROM public.class_agit_items i
                WHERE i.class_id=p_class_id AND i.exhibition_id=p_exhibition_id AND i.id=(v_item->>'itemId')::UUID AND i.removed_at IS NULL;
            IF v_source IS NULL THEN RAISE EXCEPTION '공개할 수 없는 원글이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_source->>'source_revision' IS DISTINCT FROM v_item->>'sourceRevision' THEN RAISE EXCEPTION '바뀐 원글을 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
            IF length(btrim(COALESCE(v_item->>'publicAlias',''))) NOT BETWEEN 1 AND 30
                THEN RAISE EXCEPTION '가림 이름을 1~30자로 적어 주세요.' USING ERRCODE='22023'; END IF;
            v_n:=v_n+1;
            INSERT INTO public.class_agit_external_items(class_id,share_id,post_id,student_id,position,snapshot)
            VALUES(p_class_id,p_exhibition_id,(v_source->>'id')::UUID,(v_source->>'student_id')::UUID,v_n,
                jsonb_build_object('title',v_source->>'title','author',btrim(v_item->>'publicAlias'),'format',v_source->>'format',
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
    RETURN public.get_class_agit_share_workspace_v1(p_class_id,p_exhibition_id);
EXCEPTION WHEN lock_not_available THEN
    RAISE EXCEPTION '원글이나 공개 설정을 변경하는 작업이 진행 중입니다. 잠시 뒤 다시 확인해 주세요.' USING ERRCODE='PT409';
END; $$;
REVOKE ALL ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_share_action_v1(UUID,UUID,TEXT,JSONB) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_my_class_agit_exhibitions_v1()
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class UUID; v_items JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY q.published_at DESC,q.id DESC),'[]') INTO v_items FROM (
        SELECT e.id,c.title,c.introduction,c.theme,e.publication_no,e.published_at FROM public.class_agit_exhibitions e
        JOIN public.class_agit_publication_catalog c ON c.class_id=e.class_id AND c.exhibition_id=e.id AND c.scope='class' AND c.publication_no=e.publication_no
        WHERE e.class_id=v_class AND e.state='published' ORDER BY e.published_at DESC,e.id DESC LIMIT 20
    ) q;
    RETURN jsonb_build_object('version',1,'exhibitions',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_exhibitions_v1() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_exhibitions_v1() TO authenticated;


CREATE OR REPLACE FUNCTION public.get_my_class_agit_room_v1(p_exhibition_id UUID,p_room INTEGER DEFAULT 0)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class UUID; v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_room IS NULL OR p_room NOT BETWEEN 0 AND ((public.class_agit_max_works_v1()+11)/12) THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c JOIN public.class_agit_exhibitions e
        ON e.class_id=c.class_id AND e.id=c.exhibition_id AND e.publication_no=c.publication_no
        WHERE c.class_id=v_class AND c.exhibition_id=p_exhibition_id AND c.scope='class' AND e.state='published';
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 전시를 볼 수 없어요.' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(jsonb_agg(q.summary ORDER BY q.display_position),'[]') INTO v_items FROM (
        SELECT s.summary,s.display_position FROM public.class_agit_publication_slots s
        WHERE s.class_id=v_class AND s.exhibition_id=p_exhibition_id AND s.scope='class' AND s.room_no=p_room
        ORDER BY s.display_position LIMIT 12) q;
    RETURN jsonb_build_object('version',1,'exhibition_id',p_exhibition_id,'publication_no',v_catalog.publication_no,
        'title',v_catalog.title,'introduction',v_catalog.introduction,'theme',v_catalog.theme,'room',p_room,'rooms',v_catalog.rooms,
        'total_count',v_catalog.total_count,'visibility_revision',v_catalog.visibility_revision,'items',v_items);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_room_v1(UUID,INTEGER) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_class_agit_publication_v1(p_class_id UUID,p_exhibition_id UUID,p_room INTEGER DEFAULT 1)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS(SELECT 1 FROM public.classes c WHERE c.id=p_class_id AND public.class_agit_class_is_open_v1(c.id)
        AND (c.teacher_id=auth.uid() OR EXISTS(SELECT 1 FROM public.students s WHERE s.class_id=c.id AND s.auth_id=auth.uid()
            AND s.deleted_at IS NULL AND s.is_active IS DISTINCT FROM FALSE))) THEN RAISE EXCEPTION '이 학급 전시를 볼 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF p_room IS NULL OR p_room NOT BETWEEN 1 AND ((public.class_agit_max_works_v1()+11)/12) THEN RAISE EXCEPTION '전시실 번호를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c JOIN public.class_agit_exhibitions e
        ON e.class_id=c.class_id AND e.id=c.exhibition_id AND e.publication_no=c.publication_no
        WHERE c.class_id=p_class_id AND c.exhibition_id=p_exhibition_id AND c.scope='class' AND e.state='published';
    IF NOT FOUND THEN RAISE EXCEPTION '공개 중인 전시를 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    SELECT COALESCE(jsonb_agg(q.work ORDER BY q.display_position),'[]') INTO v_items FROM (
        SELECT s.summary||jsonb_build_object('blocks',i.blocks) AS work,s.display_position FROM public.class_agit_publication_slots s
        JOIN public.class_agit_published_items i ON i.class_id=s.class_id AND i.exhibition_id=s.exhibition_id AND i.work_no=s.work_no
        WHERE s.class_id=p_class_id AND s.exhibition_id=p_exhibition_id AND s.scope='class' AND s.room_no=p_room
        ORDER BY s.display_position LIMIT 12) q;
    RETURN jsonb_build_object('version',1,'publication_no',v_catalog.publication_no,'room',p_room,'room_count',GREATEST(1,jsonb_array_length(v_catalog.rooms)),
        'total_count',v_catalog.total_count,'blocked_count',v_catalog.original_count-v_catalog.total_count,
        'exhibition',jsonb_build_object('title',v_catalog.title,'introduction',v_catalog.introduction,'theme',v_catalog.theme,'audience','class','works',v_items));
END; $$;
REVOKE ALL ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_publication_v1(UUID,UUID,INTEGER) TO authenticated;


CREATE OR REPLACE FUNCTION public.read_public_class_agit_v1(p_token TEXT,p_room INTEGER DEFAULT 0,p_work_id TEXT DEFAULT NULL,p_publication_no INTEGER DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET statement_timeout='3s' SET lock_timeout='1s' AS $$
DECLARE v_share RECORD; v_catalog public.class_agit_publication_catalog%ROWTYPE; v_items JSONB:='[]'; v_work JSONB;
BEGIN
    IF p_token IS NULL OR p_token !~ '^[a-f0-9]{64}$' OR p_room IS NULL OR p_room NOT BETWEEN 0 AND ((public.class_agit_max_works_v1()+11)/12)
        OR (p_work_id IS NOT NULL AND NOT public.class_agit_valid_work_id_v1(p_work_id)) THEN
        RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    SELECT s.id,s.class_id,s.publication_no,s.starts_at,s.expires_at INTO v_share FROM public.class_agit_external_shares s
        WHERE s.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') AND s.revoked_at IS NULL
        AND s.starts_at<=statement_timestamp() AND s.expires_at>statement_timestamp() AND public.class_agit_class_is_allowed_v1(s.class_id)
        AND EXISTS(SELECT 1 FROM public.class_agit_rollout WHERE singleton AND external_enabled);
    IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    SELECT c.* INTO v_catalog FROM public.class_agit_publication_catalog c WHERE c.class_id=v_share.class_id AND c.exhibition_id=v_share.id
        AND c.scope='external' AND c.publication_no=v_share.publication_no;
    IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    IF p_work_id IS NOT NULL AND p_publication_no IS DISTINCT FROM v_share.publication_no THEN RETURN jsonb_build_object('version',1,'error','changed'); END IF;
    IF p_work_id IS NULL THEN
        SELECT COALESCE(jsonb_agg(q.summary ORDER BY q.display_position),'[]') INTO v_items FROM (
            SELECT s.summary,s.display_position FROM public.class_agit_publication_slots s
            WHERE s.class_id=v_share.class_id AND s.exhibition_id=v_share.id AND s.scope='external' AND s.room_no=p_room
            ORDER BY s.display_position LIMIT 12) q;
    ELSE
        SELECT i.snapshot||jsonb_build_object('id',p_work_id) INTO v_work FROM public.class_agit_external_items i
            WHERE i.class_id=v_share.class_id AND i.share_id=v_share.id AND i.position=substring(p_work_id FROM 11)::INTEGER AND i.revoked_at IS NULL;
        IF NOT FOUND THEN RETURN jsonb_build_object('version',1,'error','unavailable'); END IF;
    END IF;
    RETURN jsonb_build_object('version',1,'title',v_catalog.title,'introduction',v_catalog.introduction,'theme',v_catalog.theme,'publication_no',v_share.publication_no,
        'room',p_room,'total_count',v_catalog.total_count,'rooms',v_catalog.rooms,'visibility_revision',v_catalog.visibility_revision,
        'starts_at',v_share.starts_at,'expires_at',v_share.expires_at,'server_now',statement_timestamp(),'items',v_items,'work',v_work);
END; $$;
REVOKE ALL ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER) TO service_role;


CREATE OR REPLACE FUNCTION public.get_my_class_agit_books_v1(p_edition_id UUID DEFAULT NULL,p_work_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class UUID; v_ed public.class_agit_book_editions%ROWTYPE; v_books JSONB; v_works JSONB; v_work JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_edition_id IS NULL THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY created_at DESC,id DESC),'[]') INTO v_books FROM (
            SELECT e.id,e.number,e.created_at,e.snapshot->>'title' AS title,e.snapshot->>'subtitle' AS subtitle,COALESCE(e.snapshot->'print'->>'design','botanical') AS design,COALESCE(e.snapshot->'print'->>'paper','A4') AS paper
            FROM public.class_agit_book_editions e JOIN public.class_agit_books b ON b.class_id=e.class_id AND b.id=e.book_id AND NOT b.archived
            WHERE e.class_id=v_class AND e.student_visible ORDER BY e.created_at DESC,e.id DESC LIMIT 20) q;
        RETURN jsonb_build_object('version',1,'books',v_books);
    END IF;
    SELECT e.* INTO v_ed FROM public.class_agit_book_editions e JOIN public.class_agit_books b ON b.class_id=e.class_id AND b.id=e.book_id AND NOT b.archived
        WHERE e.class_id=v_class AND e.id=p_edition_id AND e.student_visible;
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 문집을 읽을 수 없어요.' USING ERRCODE='42501'; END IF;
    IF p_work_id IS NOT NULL THEN
        SELECT snapshot||jsonb_build_object('id',work_id) INTO v_work FROM public.class_agit_book_visible_works_v1(v_class,p_edition_id) WHERE work_id=p_work_id;
        IF v_work IS NULL THEN RAISE EXCEPTION '이 작품은 지금 읽을 수 없어요.' USING ERRCODE='42501'; END IF;
    ELSE
        SELECT COALESCE(jsonb_agg(jsonb_build_object('id',work_id,'title',snapshot->>'title','author',snapshot->>'author','group',snapshot->>'group') ORDER BY sort_position),'[]')
            INTO v_works FROM public.class_agit_book_visible_works_v1(v_class,p_edition_id);
    END IF;
    RETURN jsonb_build_object('version',1,'id',v_ed.id,'number',v_ed.number,'book',(v_ed.snapshot-'works'-'print')||jsonb_build_object('design',COALESCE(v_ed.snapshot->'print'->>'design','botanical'),'paper',COALESCE(v_ed.snapshot->'print'->>'paper','A4')), 'works',v_works,'work',v_work);
END; $$;
REVOKE ALL ON FUNCTION public.get_my_class_agit_books_v1(UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_books_v1(UUID,TEXT) TO authenticated;


NOTIFY pgrst, 'reload schema';
COMMIT;

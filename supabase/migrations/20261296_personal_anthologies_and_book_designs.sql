-- 개인 문집을 학급 문집과 명시적으로 구분하고, 해당 학생에게만 공개한다.
-- 기존 행은 모두 class이며 학급 문집 20권 + 학생별 개인 문집 1권을 허용한다.
BEGIN;

ALTER TABLE public.class_agit_books
    ADD COLUMN IF NOT EXISTS book_type TEXT NOT NULL DEFAULT 'class',
    ADD COLUMN IF NOT EXISTS owner_student_id UUID;
ALTER TABLE public.class_agit_books DROP CONSTRAINT IF EXISTS class_agit_books_book_type_check;
ALTER TABLE public.class_agit_books ADD CONSTRAINT class_agit_books_book_type_check
    CHECK ((book_type='class' AND owner_student_id IS NULL) OR (book_type='personal' AND owner_student_id IS NOT NULL));
ALTER TABLE public.class_agit_books DROP CONSTRAINT IF EXISTS class_agit_books_owner_student_fkey;
ALTER TABLE public.class_agit_books ADD CONSTRAINT class_agit_books_owner_student_fkey
    FOREIGN KEY(class_id,owner_student_id) REFERENCES public.students(class_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS class_agit_books_one_personal_per_student
    ON public.class_agit_books(class_id,owner_student_id) WHERE book_type='personal';

ALTER TABLE public.class_agit_books DROP CONSTRAINT IF EXISTS class_agit_books_design_id_check;
ALTER TABLE public.class_agit_books ADD CONSTRAINT class_agit_books_design_id_check
    CHECK(design_id IN ('botanical','editorial','notebook','constellation','storybook','ocean','modern','hanji'));

CREATE OR REPLACE FUNCTION public.class_agit_book_draft_snapshot_v1(p_class_id UUID,p_book_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_book public.class_agit_books%ROWTYPE; v_old public.class_agit_book_items%ROWTYPE; v_source JSONB; v_items JSONB:='[]'; v_owner TEXT;
BEGIN
    SELECT * INTO v_book FROM public.class_agit_books WHERE class_id=p_class_id AND id=p_book_id FOR SHARE;
    IF NOT FOUND OR v_book.archived THEN RAISE EXCEPTION '문집 초안을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF v_book.book_type='personal' THEN
        SELECT left(name,30) INTO v_owner FROM public.students WHERE class_id=p_class_id AND id=v_book.owner_student_id;
        IF v_owner IS NULL THEN RAISE EXCEPTION '개인 문집의 학생을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    END IF;
    PERFORM p.id FROM public.student_posts p JOIN public.class_agit_book_items i ON i.class_id=p.class_id AND i.post_id=p.id
        WHERE p.class_id=p_class_id AND i.book_id=p_book_id AND i.removed_at IS NULL ORDER BY p.id FOR SHARE OF p;
    FOR v_old IN SELECT * FROM public.class_agit_book_items WHERE class_id=p_class_id AND book_id=p_book_id AND removed_at IS NULL ORDER BY position,id LOOP
        v_source:=public.class_agit_current_source_v1(p_class_id,v_old.post_id);
        IF v_source IS NULL OR v_old.revoked_at IS NOT NULL THEN RAISE EXCEPTION '수록할 수 없는 작품이 있습니다.' USING ERRCODE='42501'; END IF;
        IF v_book.book_type='personal' AND (v_source->>'student_id')::UUID IS DISTINCT FROM v_book.owner_student_id THEN
            RAISE EXCEPTION '개인 문집에는 선택한 학생의 글만 담을 수 있습니다.' USING ERRCODE='42501'; END IF;
        IF v_old.source_revision IS DISTINCT FROM v_source->>'source_revision' THEN RAISE EXCEPTION '원글 전문을 다시 확인하고 저장해 주세요.' USING ERRCODE='PT409'; END IF;
        v_items:=v_items||jsonb_build_array(v_old.snapshot||jsonb_build_object('itemId',v_old.id,'sourceId',v_old.post_id,'consentId',v_old.consent_id));
    END LOOP;
    IF jsonb_array_length(v_items) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION '문집에는 1~300편의 작품이 필요합니다.' USING ERRCODE='23514'; END IF;
    RETURN jsonb_build_object('title',v_book.title,'subtitle',v_book.subtitle,'introduction',v_book.introduction,
        'class_label',v_book.class_label,'issue_date',v_book.issue_date,'grouping',v_book.grouping,'page_breaks',v_book.page_breaks,
        'book_type',v_book.book_type,'owner_student_id',v_book.owner_student_id,'owner_student_name',v_owner,
        'print',jsonb_build_object('paper',v_book.paper_format,'design',v_book.design_id,'layout',v_book.page_layout,'body_pt',12,'poem_pt',14,'version',2),'works',v_items);
END; $$;

CREATE OR REPLACE FUNCTION public.get_class_agit_book_workspace_v1(p_class_id UUID,p_book_id UUID DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_books JSONB; v_students JSONB; v_book JSONB; v_items JSONB; v_editions JSONB;
BEGIN
    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY updated_at DESC,id DESC),'[]') INTO v_books FROM (
        SELECT b.id,b.title,b.archived,b.revision,b.updated_at,b.book_type,b.owner_student_id,left(s.name,30) AS owner_student_name
        FROM public.class_agit_books b LEFT JOIN public.students s ON s.class_id=b.class_id AND s.id=b.owner_student_id
        WHERE b.class_id=p_class_id ORDER BY b.updated_at DESC,b.id DESC LIMIT 120) q;
    SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY name,id),'[]') INTO v_students FROM (
        SELECT id,left(name,30) AS name FROM public.students WHERE class_id=p_class_id AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE ORDER BY name,id LIMIT 100) q;
    IF p_book_id IS NOT NULL THEN
        SELECT to_jsonb(b)||jsonb_build_object('owner_student_name',left(s.name,30)) INTO v_book
        FROM public.class_agit_books b LEFT JOIN public.students s ON s.class_id=b.class_id AND s.id=b.owner_student_id
        WHERE b.class_id=p_class_id AND b.id=p_book_id;
        IF v_book IS NULL THEN RAISE EXCEPTION '문집을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        SELECT COALESCE(jsonb_agg(q.data ORDER BY q.position,q.id),'[]') INTO v_items FROM (
            SELECT i.id,i.position,i.snapshot||jsonb_build_object('itemId',i.id,'sourceId',i.post_id,'studentId',i.student_id,
                'missionId',post.mission_id,'sourceRevision',i.source_revision,'revoked',i.revoked_at IS NOT NULL,'unavailable',cur.data IS NULL,
                'sourceChanged',cur.data->>'source_revision' IS DISTINCT FROM i.source_revision) AS data
            FROM public.class_agit_book_items i LEFT JOIN public.student_posts post ON post.id=i.post_id AND post.class_id=i.class_id
            LEFT JOIN LATERAL (SELECT public.class_agit_current_source_v1(p_class_id,i.post_id) AS data) cur ON TRUE
            WHERE i.class_id=p_class_id AND i.book_id=p_book_id AND i.removed_at IS NULL ORDER BY i.position,i.id LIMIT 300) q;
        SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY number DESC),'[]') INTO v_editions FROM (
            SELECT id,number,created_at,student_visible,snapshot->>'title' AS title,snapshot->'print' AS print FROM public.class_agit_book_editions
            WHERE class_id=p_class_id AND book_id=p_book_id ORDER BY number DESC LIMIT 20) q;
        v_book:=v_book||jsonb_build_object('items',v_items,'editions',v_editions);
    END IF;
    RETURN jsonb_build_object('version',1,'class_id',p_class_id,'books',v_books,'students',v_students,'book',v_book);
END; $$;

CREATE OR REPLACE FUNCTION public.run_class_agit_book_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_actor UUID; v_id UUID:=(p_payload->>'book_id')::UUID; v_book public.class_agit_books%ROWTYPE; v_type TEXT; v_owner UUID;
    v_item JSONB; v_source JSONB; v_item_id UUID; v_post UUID; v_n INTEGER:=0; v_number INTEGER; v_old public.class_agit_book_items%ROWTYPE; v_snapshot JSONB; v_edition UUID; v_owner_name TEXT;
BEGIN
    v_actor:=public.assert_class_agit_manager_v1(p_class_id);
    IF v_id IS NULL OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::TEXT)>150000 THEN RAISE EXCEPTION '문집 요청을 확인해 주세요.' USING ERRCODE='22023'; END IF;
    PERFORM id FROM public.classes WHERE id=p_class_id FOR UPDATE;
    SELECT * INTO v_book FROM public.class_agit_books WHERE class_id=p_class_id AND id=v_id FOR UPDATE;
    IF p_action='create' THEN
        IF FOUND THEN RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id); END IF;
        v_type:=COALESCE(p_payload->>'book_type','class'); v_owner:=(p_payload->>'owner_student_id')::UUID;
        IF v_type NOT IN ('class','personal') OR (v_type='class' AND v_owner IS NOT NULL) OR (v_type='personal' AND v_owner IS NULL) THEN RAISE EXCEPTION '문집 종류와 학생을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF v_type='class' AND (SELECT count(*) FROM public.class_agit_books WHERE class_id=p_class_id AND book_type='class')>=20 THEN RAISE EXCEPTION '학급 문집은 20권까지 보관합니다.' USING ERRCODE='23514'; END IF;
        IF v_type='personal' THEN
            SELECT left(name,30) INTO v_owner_name FROM public.students WHERE class_id=p_class_id AND id=v_owner AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE;
            IF v_owner_name IS NULL THEN RAISE EXCEPTION '개인 문집을 만들 학생을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
            IF EXISTS(SELECT 1 FROM public.class_agit_books WHERE class_id=p_class_id AND owner_student_id=v_owner AND book_type='personal') THEN RAISE EXCEPTION '이 학생의 개인 문집이 이미 있습니다.' USING ERRCODE='23505'; END IF;
            INSERT INTO public.class_agit_books(id,class_id,book_type,owner_student_id,title,subtitle) VALUES(v_id,p_class_id,v_type,v_owner,v_owner_name||'의 글 모음','한 편 한 편 자라난 나의 이야기');
        ELSE INSERT INTO public.class_agit_books(id,class_id,book_type) VALUES(v_id,p_class_id,v_type); END IF;
        RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id);
    END IF;
    IF NOT FOUND THEN RAISE EXCEPTION '문집을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
    IF (p_payload->>'expected_revision')::INTEGER IS DISTINCT FROM v_book.revision THEN RAISE EXCEPTION '문집이 다른 화면에서 변경되었습니다. 입력을 확인한 뒤 다시 불러와 주세요.' USING ERRCODE='PT409'; END IF;
    IF p_action='delete' THEN
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '문집 삭제 동작을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        DELETE FROM public.class_agit_books WHERE class_id=p_class_id AND id=v_id; RETURN public.get_class_agit_book_workspace_v1(p_class_id,NULL);
    END IF;
    IF v_book.archived AND p_action NOT IN('restore','hide','withdraw') THEN RAISE EXCEPTION '보관한 문집을 먼저 복원해 주세요.' USING ERRCODE='22023'; END IF;
    IF p_action='save' THEN
        IF COALESCE(p_payload->>'paper_format',v_book.paper_format) NOT IN ('A4','A5','B5') OR COALESCE(p_payload->>'page_layout',v_book.page_layout) NOT IN ('work-per-page','continuous')
            OR jsonb_typeof(COALESCE(p_payload->'page_breaks',v_book.page_breaks))<>'array' OR jsonb_array_length(COALESCE(p_payload->'page_breaks',v_book.page_breaks))>300
            OR COALESCE(p_payload->>'design_id',v_book.design_id) NOT IN ('botanical','editorial','notebook','constellation','storybook','ocean','modern','hanji') THEN RAISE EXCEPTION '문집 판형과 디자인을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF COALESCE(p_payload->>'book_type','class') IS DISTINCT FROM v_book.book_type OR NULLIF(p_payload->>'owner_student_id','')::UUID IS DISTINCT FROM v_book.owner_student_id THEN RAISE EXCEPTION '문집 종류와 학생은 만든 뒤 바꿀 수 없습니다.' USING ERRCODE='22023'; END IF;
        IF jsonb_typeof(p_payload->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(p_payload->'items')>300 OR length(btrim(COALESCE(p_payload->>'title',''))) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION '문집 제목과 작품 수(최대 300편)를 확인해 주세요.' USING ERRCODE='22023'; END IF;
        IF (SELECT count(DISTINCT x->>'sourceId') FROM jsonb_array_elements(p_payload->'items') x)<>jsonb_array_length(p_payload->'items') THEN RAISE EXCEPTION '같은 작품을 중복 수록할 수 없습니다.' USING ERRCODE='22023'; END IF;
        PERFORM p.id FROM public.student_posts p WHERE p.class_id=p_class_id AND p.id IN(SELECT (x->>'sourceId')::UUID FROM jsonb_array_elements(p_payload->'items') x) ORDER BY p.id FOR SHARE;
        UPDATE public.class_agit_book_items SET removed_at=now() WHERE class_id=p_class_id AND book_id=v_id AND removed_at IS NULL;
        FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items') LOOP
            v_post:=(v_item->>'sourceId')::UUID; v_source:=public.class_agit_current_source_v1(p_class_id,v_post);
            IF v_source IS NULL OR (v_book.book_type='personal' AND (v_source->>'student_id')::UUID IS DISTINCT FROM v_book.owner_student_id) THEN RAISE EXCEPTION '이 문집에 수록할 수 없는 원글이 있습니다.' USING ERRCODE='42501'; END IF;
            IF v_item->>'sourceRevision' IS DISTINCT FROM v_source->>'source_revision' THEN RAISE EXCEPTION '바뀐 원글의 전문을 다시 확인해 주세요.' USING ERRCODE='PT409'; END IF;
            v_n:=v_n+1; SELECT * INTO v_old FROM public.class_agit_book_items WHERE class_id=p_class_id AND book_id=v_id AND post_id=v_post;
            v_snapshot:=jsonb_build_object('title',v_source->>'title','author',v_source->>'student_name','format',v_source->>'format','kindLabel',v_source->>'kindLabel','blocks',v_source->'blocks','excerpt',v_source->>'excerpt','group',v_source->>'group_title');
            INSERT INTO public.class_agit_book_items(class_id,book_id,post_id,student_id,position,source_revision,snapshot) VALUES(p_class_id,v_id,v_post,(v_source->>'student_id')::UUID,v_n,v_source->>'source_revision',v_snapshot)
            ON CONFLICT(book_id,post_id) DO UPDATE SET position=EXCLUDED.position,source_revision=EXCLUDED.source_revision,snapshot=EXCLUDED.snapshot,consent_id=CASE WHEN class_agit_book_items.revoked_at IS NOT NULL THEN gen_random_uuid() ELSE class_agit_book_items.consent_id END,revoked_at=NULL,removed_at=NULL RETURNING id INTO v_item_id;
            IF v_old.id IS NULL OR v_old.revoked_at IS NOT NULL OR v_old.source_revision<>v_source->>'source_revision' THEN INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_item_id,'anthology','selected',v_actor); END IF;
        END LOOP;
        UPDATE public.class_agit_books SET paper_format=COALESCE(p_payload->>'paper_format',v_book.paper_format),page_layout=COALESCE(p_payload->>'page_layout',v_book.page_layout),page_breaks=COALESCE(p_payload->'page_breaks',v_book.page_breaks),design_id=COALESCE(p_payload->>'design_id',v_book.design_id),title=btrim(p_payload->>'title'),subtitle=COALESCE(p_payload->>'subtitle',''),introduction=COALESCE(p_payload->>'introduction',''),class_label=COALESCE(p_payload->>'class_label',''),issue_date=(p_payload->>'issue_date')::DATE,grouping=COALESCE(p_payload->>'grouping','custom') WHERE class_id=p_class_id AND id=v_id;
    ELSIF p_action='finalize' THEN
        IF p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB THEN RAISE EXCEPTION '문집 확정 동작을 확인해 주세요.' USING ERRCODE='22023'; END IF;
        v_snapshot:=public.class_agit_book_draft_snapshot_v1(p_class_id,v_id); SELECT COALESCE(max(number),0)+1 INTO v_number FROM public.class_agit_book_editions WHERE class_id=p_class_id AND book_id=v_id;
        IF v_number>20 THEN RAISE EXCEPTION '확정판은 20판까지 보관합니다. 새 문집을 만들어 주세요.' USING ERRCODE='23514'; END IF;
        INSERT INTO public.class_agit_book_editions(class_id,book_id,number,snapshot) VALUES(p_class_id,v_id,v_number,v_snapshot); INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,v_id,'anthology','published',v_actor);
    ELSIF p_action IN('show','hide') THEN
        v_edition:=(p_payload->>'edition_id')::UUID; IF NOT EXISTS(SELECT 1 FROM public.class_agit_book_editions WHERE class_id=p_class_id AND book_id=v_id AND id=v_edition) THEN RAISE EXCEPTION '확정판을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        UPDATE public.class_agit_book_editions SET student_visible=FALSE WHERE class_id=p_class_id AND book_id=v_id; IF p_action='show' THEN UPDATE public.class_agit_book_editions SET student_visible=TRUE WHERE class_id=p_class_id AND book_id=v_id AND id=v_edition; END IF;
    ELSIF p_action='withdraw' THEN
        UPDATE public.class_agit_book_items SET revoked_at=COALESCE(revoked_at,now()) WHERE class_id=p_class_id AND book_id=v_id AND id=(p_payload->>'item_id')::UUID; IF NOT FOUND THEN RAISE EXCEPTION '수록 작품을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        INSERT INTO public.class_agit_release_events(class_id,subject_id,scope,action,actor_id) VALUES(p_class_id,(p_payload->>'item_id')::UUID,'anthology','withdrawn',v_actor);
    ELSIF p_action IN('archive','restore') THEN UPDATE public.class_agit_books SET archived=p_action='archive' WHERE class_id=p_class_id AND id=v_id; UPDATE public.class_agit_book_editions SET student_visible=FALSE WHERE class_id=p_class_id AND book_id=v_id;
    ELSE RAISE EXCEPTION '지원하지 않는 문집 동작입니다.' USING ERRCODE='22023'; END IF;
    UPDATE public.class_agit_books SET revision=revision+1,updated_at=now() WHERE class_id=p_class_id AND id=v_id; RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id);
END; $$;

CREATE OR REPLACE FUNCTION public.get_my_class_agit_books_v1(p_edition_id UUID DEFAULT NULL,p_work_id TEXT DEFAULT NULL)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_class UUID; v_student UUID:=public.auth_student_id(); v_ed public.class_agit_book_editions%ROWTYPE; v_books JSONB; v_works JSONB; v_work JSONB;
BEGIN
    v_class:=public.class_agit_reader_class_v1();
    IF p_edition_id IS NULL THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(q) ORDER BY created_at DESC,id DESC),'[]') INTO v_books FROM (
            SELECT e.id,e.number,e.created_at,e.snapshot->>'title' AS title,e.snapshot->>'subtitle' AS subtitle,COALESCE(e.snapshot->'print'->>'design','botanical') AS design,COALESCE(e.snapshot->'print'->>'paper','A4') AS paper,e.snapshot->>'book_type' AS book_type
            FROM public.class_agit_book_editions e JOIN public.class_agit_books b ON b.class_id=e.class_id AND b.id=e.book_id AND NOT b.archived
            WHERE e.class_id=v_class AND e.student_visible AND (b.book_type='class' OR b.owner_student_id=v_student) ORDER BY e.created_at DESC,e.id DESC LIMIT 120) q;
        RETURN jsonb_build_object('version',1,'books',v_books);
    END IF;
    SELECT e.* INTO v_ed FROM public.class_agit_book_editions e JOIN public.class_agit_books b ON b.class_id=e.class_id AND b.id=e.book_id AND NOT b.archived
        WHERE e.class_id=v_class AND e.id=p_edition_id AND e.student_visible AND (b.book_type='class' OR b.owner_student_id=v_student);
    IF NOT FOUND THEN RAISE EXCEPTION '지금은 이 문집을 읽을 수 없어요.' USING ERRCODE='42501'; END IF;
    IF p_work_id IS NOT NULL THEN SELECT snapshot||jsonb_build_object('id',work_id) INTO v_work FROM public.class_agit_book_visible_works_v1(v_class,p_edition_id) WHERE work_id=p_work_id; IF v_work IS NULL THEN RAISE EXCEPTION '이 작품은 지금 읽을 수 없어요.' USING ERRCODE='42501'; END IF;
    ELSE SELECT COALESCE(jsonb_agg(jsonb_build_object('id',work_id,'title',snapshot->>'title','author',snapshot->>'author','group',snapshot->>'group') ORDER BY sort_position),'[]') INTO v_works FROM public.class_agit_book_visible_works_v1(v_class,p_edition_id); END IF;
    RETURN jsonb_build_object('version',1,'id',v_ed.id,'number',v_ed.number,'book',(v_ed.snapshot-'works'-'print')||jsonb_build_object('design',COALESCE(v_ed.snapshot->'print'->>'design','botanical'),'paper',COALESCE(v_ed.snapshot->'print'->>'paper','A4')),'works',v_works,'work',v_work);
END; $$;

REVOKE ALL ON FUNCTION public.class_agit_book_draft_snapshot_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.get_class_agit_book_workspace_v1(UUID,UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_book_workspace_v1(UUID,UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) TO authenticated;
REVOKE ALL ON FUNCTION public.get_my_class_agit_books_v1(UUID,TEXT) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_my_class_agit_books_v1(UUID,TEXT) TO authenticated;
-- 61295에서 PUBLIC만 회수한 뒤 과거 anon 직접 grant가 남은 운영 DB도 함께 닫는다.
REVOKE ALL ON FUNCTION public.get_class_agit_students_v1(UUID) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_class_agit_students_v1(UUID) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

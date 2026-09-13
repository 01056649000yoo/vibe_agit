-- ============================================================================
-- 📖 문집 쪽 배치: 작품별 새 쪽 / 이어붙이기
-- 작성일: 2026-09-13
--
-- 왜: 지금은 작품마다 새 쪽에서 시작해, 앞 작품이 반 쪽만 쓰면 **아래가 통째로 빈다.**
--     작품마다 제목과 지은이가 붙어 있으므로 이어 붙여도 어디서 끊기는지 알 수 있다.
--     종이를 아끼고 책처럼 촘촘하게 엮고 싶은 교사가 고를 수 있게 한다(사용자 요청).
--
-- 기본값은 `work-per-page` — **지금까지 만든 문집의 모양이 바뀌면 안 된다.** 확정판은
--   되돌릴 수 없으므로, 설정을 건드리지 않으면 예전과 똑같이 나온다.
--
-- 이어붙이기일 때는 주제가 바뀌는 자리에 간지 한 쪽이 들어간다(주제 이름만).
--   그 배치는 화면 코드가 한다 — `src/modules/class-agit/anthology/pagination.js`.
-- ============================================================================

BEGIN;

ALTER TABLE public.class_agit_books
    ADD COLUMN IF NOT EXISTS page_layout TEXT NOT NULL DEFAULT 'work-per-page';

ALTER TABLE public.class_agit_books
    DROP CONSTRAINT IF EXISTS class_agit_books_page_layout_check;

ALTER TABLE public.class_agit_books
    ADD CONSTRAINT class_agit_books_page_layout_check
    CHECK (page_layout IN ('work-per-page', 'continuous'));

CREATE OR REPLACE FUNCTION public.run_class_agit_book_action_v1(p_class_id uuid, p_action text, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            OR COALESCE(p_payload->>'page_layout',v_book.page_layout) NOT IN ('work-per-page','continuous')
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
        UPDATE public.class_agit_books SET paper_format=COALESCE(p_payload->>'paper_format',v_book.paper_format),page_layout=COALESCE(p_payload->>'page_layout',v_book.page_layout),design_id=COALESCE(p_payload->>'design_id',v_book.design_id),title=btrim(p_payload->>'title'),subtitle=COALESCE(p_payload->>'subtitle',''),introduction=COALESCE(p_payload->>'introduction',''),
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
END; $function$;

CREATE OR REPLACE FUNCTION public.class_agit_book_draft_snapshot_v1(p_class_id uuid, p_book_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
            'class_label',v_book.class_label,'term',v_book.term,'issue_date',v_book.issue_date,'grouping',v_book.grouping,'print',jsonb_build_object('paper',v_book.paper_format,'design',v_book.design_id,'layout',v_book.page_layout,'body_pt',12,'poem_pt',14,'version',2),'works',v_items);
END; $function$;

COMMIT;

NOTIFY pgrst, 'reload schema';

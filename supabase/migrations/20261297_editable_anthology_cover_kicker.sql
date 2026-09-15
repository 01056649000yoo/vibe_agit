-- 문집 표지의 고정 윗문구를 교사가 수정하거나 숨길 수 있게 한다.
-- 기존 문집과 옛 확정판은 각각 학급/개인 기본 문구를 그대로 유지한다.
BEGIN;

ALTER TABLE public.class_agit_books
    ADD COLUMN IF NOT EXISTS cover_kicker TEXT NOT NULL DEFAULT '우리 반의 이야기';

UPDATE public.class_agit_books
SET cover_kicker = '나의 글 모음'
WHERE book_type = 'personal' AND cover_kicker = '우리 반의 이야기';

ALTER TABLE public.class_agit_books DROP CONSTRAINT IF EXISTS class_agit_books_cover_kicker_length;
ALTER TABLE public.class_agit_books ADD CONSTRAINT class_agit_books_cover_kicker_length
    CHECK (char_length(cover_kicker) <= 60);

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
    RETURN jsonb_build_object('title',v_book.title,'subtitle',v_book.subtitle,'cover_kicker',v_book.cover_kicker,'introduction',v_book.introduction,
        'class_label',v_book.class_label,'issue_date',v_book.issue_date,'grouping',v_book.grouping,'page_breaks',v_book.page_breaks,
        'book_type',v_book.book_type,'owner_student_id',v_book.owner_student_id,'owner_student_name',v_owner,
        'print',jsonb_build_object('paper',v_book.paper_format,'design',v_book.design_id,'layout',v_book.page_layout,'body_pt',12,'poem_pt',14,'version',2),'works',v_items);
END; $$;

-- 기존의 검증·원자적 저장 본문은 닫힌 내부 함수로 유지하고, 같은 공개 RPC가 표지 문구까지 저장한다.
DO $$
BEGIN
    IF to_regprocedure('public.run_class_agit_book_action_core(uuid,text,jsonb)') IS NULL THEN
        ALTER FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) RENAME TO run_class_agit_book_action_core;
    END IF;
END $$;

REVOKE ALL ON FUNCTION public.run_class_agit_book_action_core(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.run_class_agit_book_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_result JSONB; v_id UUID := NULLIF(p_payload->>'book_id','')::UUID; v_kicker TEXT;
BEGIN
    IF p_action='save' THEN
        v_kicker:=p_payload->>'cover_kicker';
        IF v_kicker IS NOT NULL AND char_length(v_kicker)>60 THEN RAISE EXCEPTION '표지 윗문구는 60자까지 적을 수 있습니다.' USING ERRCODE='22023'; END IF;
    END IF;

    v_result:=public.run_class_agit_book_action_core(p_class_id,p_action,p_payload);

    IF p_action='create' AND COALESCE(p_payload->>'book_type','class')='personal' THEN
        UPDATE public.class_agit_books SET cover_kicker='나의 글 모음'
        WHERE class_id=p_class_id AND id=v_id AND cover_kicker='우리 반의 이야기';
        RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id);
    ELSIF p_action='save' THEN
        -- 배포 전에 열어 둔 옛 화면은 이 키를 보내지 않는다. 그 저장이 기존 문구를 지우면 안 된다.
        UPDATE public.class_agit_books SET cover_kicker=COALESCE(v_kicker,cover_kicker) WHERE class_id=p_class_id AND id=v_id;
        RETURN public.get_class_agit_book_workspace_v1(p_class_id,v_id);
    END IF;
    RETURN v_result;
END; $$;

REVOKE ALL ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

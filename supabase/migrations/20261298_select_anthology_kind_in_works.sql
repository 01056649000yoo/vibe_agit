-- 작품 담기 단계에서 아직 확정판이 없는 초안의 학급/개인 문집 종류와 학생을 고를 수 있게 한다.
BEGIN;

DO $$
BEGIN
    IF to_regprocedure('public.run_class_agit_book_cover_core(uuid,text,jsonb)') IS NULL THEN
        ALTER FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) RENAME TO run_class_agit_book_cover_core;
    END IF;
END $$;

REVOKE ALL ON FUNCTION public.run_class_agit_book_cover_core(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.run_class_agit_book_action_v1(p_class_id UUID,p_action TEXT,p_payload JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
    v_book public.class_agit_books%ROWTYPE;
    v_type TEXT;
    v_owner UUID;
BEGIN
    IF p_action <> 'save' THEN
        RETURN public.run_class_agit_book_cover_core(p_class_id,p_action,p_payload);
    END IF;

    PERFORM public.assert_class_agit_manager_v1(p_class_id);
    SELECT * INTO v_book FROM public.class_agit_books
    WHERE class_id=p_class_id AND id=NULLIF(p_payload->>'book_id','')::UUID FOR UPDATE;
    IF NOT FOUND OR v_book.archived THEN RAISE EXCEPTION '문집 초안을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;

    v_type:=COALESCE(NULLIF(p_payload->>'book_type',''),v_book.book_type);
    v_owner:=NULLIF(p_payload->>'owner_student_id','')::UUID;
    IF v_type NOT IN ('class','personal') THEN RAISE EXCEPTION '문집 종류를 확인해 주세요.' USING ERRCODE='22023'; END IF;
    IF v_type='class' THEN v_owner:=NULL; END IF;
    IF v_type='personal' AND v_owner IS NULL THEN RAISE EXCEPTION '개인 문집에 담을 학생을 선택해 주세요.' USING ERRCODE='23514'; END IF;

    IF v_type IS DISTINCT FROM v_book.book_type OR v_owner IS DISTINCT FROM v_book.owner_student_id THEN
        IF EXISTS (SELECT 1 FROM public.class_agit_book_editions WHERE class_id=p_class_id AND book_id=v_book.id) THEN
            RAISE EXCEPTION '확정판이 있는 문집은 종류를 바꿀 수 없습니다.' USING ERRCODE='23514';
        END IF;
        IF v_type='personal' AND NOT EXISTS (
            SELECT 1 FROM public.students WHERE id=v_owner AND class_id=p_class_id AND deleted_at IS NULL AND is_active IS DISTINCT FROM FALSE
        ) THEN RAISE EXCEPTION '개인 문집에 담을 학생을 찾을 수 없습니다.' USING ERRCODE='42501'; END IF;
        IF v_type='personal' AND EXISTS (
            SELECT 1 FROM public.class_agit_books WHERE class_id=p_class_id AND book_type='personal' AND owner_student_id=v_owner AND id<>v_book.id
        ) THEN RAISE EXCEPTION '이 학생의 개인 문집이 이미 있습니다.' USING ERRCODE='23505'; END IF;
        IF v_type='personal' AND EXISTS (
            SELECT 1 FROM public.class_agit_book_items i
            JOIN public.student_posts p ON p.id=i.post_id AND p.class_id=i.class_id
            WHERE i.class_id=p_class_id AND i.book_id=v_book.id AND i.removed_at IS NULL AND p.student_id IS DISTINCT FROM v_owner
        ) THEN RAISE EXCEPTION '개인 문집에는 선택한 학생의 글만 담을 수 있습니다.' USING ERRCODE='23514'; END IF;

        UPDATE public.class_agit_books SET
            book_type=v_type,
            owner_student_id=v_owner,
            cover_kicker=CASE
                WHEN v_type='personal' AND cover_kicker='우리 반의 이야기' THEN '나의 글 모음'
                WHEN v_type='class' AND cover_kicker='나의 글 모음' THEN '우리 반의 이야기'
                ELSE cover_kicker
            END
        WHERE class_id=p_class_id AND id=v_book.id;
    END IF;

    RETURN public.run_class_agit_book_cover_core(p_class_id,p_action,p_payload);
END; $$;

REVOKE ALL ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.run_class_agit_book_action_v1(UUID,TEXT,JSONB) TO authenticated;

COMMIT;
NOTIFY pgrst, 'reload schema';

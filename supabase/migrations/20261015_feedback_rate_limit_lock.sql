BEGIN;

-- 동시에 여러 요청을 보내도 한 시간 3회 제한을 우회하지 못하도록 사용자별 직렬화한다.
CREATE OR REPLACE FUNCTION public.submit_teacher_feedback_v1(p_title TEXT, p_content TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_title TEXT := btrim(COALESCE(p_title, ''));
    v_content TEXT := btrim(COALESCE(p_content, ''));
    v_feedback_id UUID;
BEGIN
    IF public.auth_user_role() NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '승인된 교사만 의견을 보낼 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF char_length(v_title) NOT BETWEEN 2 AND 120 THEN
        RAISE EXCEPTION '제목은 2~120자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_content) NOT BETWEEN 5 AND 5000 THEN
        RAISE EXCEPTION '내용은 5~5000자로 작성해주세요.' USING ERRCODE = '22023';
    END IF;

    PERFORM pg_advisory_xact_lock(hashtextextended('feedback:' || v_user_id::TEXT, 0));
    IF (SELECT count(*) FROM public.feedback_reports
        WHERE teacher_id = v_user_id AND created_at > NOW() - INTERVAL '1 hour') >= 3 THEN
        RAISE EXCEPTION '의견은 한 시간에 3번까지 보낼 수 있습니다.' USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.feedback_reports(teacher_id, title, content, status)
    VALUES(v_user_id, v_title, v_content, 'open') RETURNING id INTO v_feedback_id;
    RETURN jsonb_build_object('version', 1, 'feedback_id', v_feedback_id);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_teacher_feedback_v1(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.submit_teacher_feedback_v1(TEXT, TEXT) TO authenticated, service_role;

-- SECURITY DEFINER RPC는 테이블 권한 없이도 동작한다. 직접 REST INSERT 표면은 닫는다.
REVOKE INSERT ON TABLE public.feedback_reports, public.profiles FROM anon, authenticated;

COMMIT;

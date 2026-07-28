-- ============================================================================
-- 학생 탭 상단 요약 띠
--
-- 학생 명단·최근 활동·학급 분석을 한 화면에 모으면서, 맨 위에 학급 상태를 한 줄로
-- 보여 준다. 숫자 네 개를 받으려고 목록을 통째로 내려받지 않도록 집계는 DB에서 한다.
--
-- WORKLOG "학급 글 조회 기준" 을 따른다:
--   · 학급은 student_posts.class_id 로 직접 좁힌다 (students 경유 금지)
--   · idx_student_posts_class_created_at (class_id, created_at DESC) 를 탄다
--   · 교사 권한 검사 후 SECURITY DEFINER, anon 실행 회수
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_class_student_summary(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_admin BOOLEAN := false;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    IF NOT v_is_admin AND NOT EXISTS (
        SELECT 1 FROM public.classes c
        WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'students', (
            SELECT count(*)::INTEGER FROM public.students s
            WHERE s.class_id = p_class_id
              AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
        ),
        'today_posts', (
            SELECT count(*)::INTEGER FROM public.student_posts p
            WHERE p.class_id = p_class_id AND p.is_submitted = true
              AND p.created_at >= date_trunc('day', NOW())
        ),
        'week_posts', (
            SELECT count(*)::INTEGER FROM public.student_posts p
            WHERE p.class_id = p_class_id AND p.is_submitted = true
              AND p.created_at >= NOW() - INTERVAL '7 days'
        ),
        'avg_chars', (
            SELECT COALESCE(round(avg(NULLIF(p.char_count, 0)))::INTEGER, 0)
            FROM public.student_posts p
            WHERE p.class_id = p_class_id AND p.is_submitted = true
        )
    )
    INTO v_result;

    RETURN COALESCE(v_result, jsonb_build_object(
        'students', 0, 'today_posts', 0, 'week_posts', 0, 'avg_chars', 0
    ));
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_student_summary(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_student_summary(UUID) TO authenticated, service_role;

COMMIT;

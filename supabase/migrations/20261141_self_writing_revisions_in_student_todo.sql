-- 교사가 보완 요청한 독서록·일기도 학생 홈 `다시 쓸 글`에 합친다.
-- 홈 호출은 기존 bootstrap 한 번을 유지하고, 바로가기는 과제·독서록·일기 중
-- 가장 최근에 보완 요청된 글 한 편만 전용 RPC로 반환한다.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_reading_log_reviews_student_revision
    ON public.reading_log_teacher_reviews (class_id, student_id, reviewed_at DESC, post_id)
    WHERE review_status = 'revision_requested';

-- 20261137의 메달 확장 wrapper를 보존하고, 그 결과의 home.returned_count만 확장한다.
-- 이렇게 하면 학생 홈 본체·독서마라톤 계산을 복사하지 않고 기능별 wrapper를 유지할 수 있다.
DO $$
BEGIN
    IF to_regprocedure('public.get_student_home_bootstrap_core_20261137()') IS NULL THEN
        ALTER FUNCTION public.get_student_home_bootstrap_v1()
            RENAME TO get_student_home_bootstrap_core_20261137;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_home_bootstrap_core_20261137()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_home_bootstrap_core_20261137() TO service_role;

CREATE OR REPLACE FUNCTION public.get_student_home_bootstrap_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_student_id UUID;
    v_class_id UUID;
    v_assignment_revision_count INTEGER := 0;
    v_self_writing_revision_count INTEGER := 0;
BEGIN
    v_base := public.get_student_home_bootstrap_core_20261137();
    v_student_id := NULLIF(v_base #>> '{student,id}', '')::UUID;
    v_class_id := NULLIF(v_base #>> '{student,class_id}', '')::UUID;
    v_assignment_revision_count := COALESCE((v_base #>> '{home,returned_count}')::INTEGER, 0);

    SELECT COUNT(*)::INTEGER INTO v_self_writing_revision_count
    FROM public.reading_log_teacher_reviews review
    JOIN public.student_posts post
      ON post.id = review.post_id
     AND post.class_id = review.class_id
     AND post.student_id = review.student_id
    WHERE review.class_id = v_class_id
      AND review.student_id = v_student_id
      AND review.review_status = 'revision_requested'
      AND post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE;

    RETURN jsonb_set(
        v_base,
        '{home,returned_count}',
        to_jsonb(v_assignment_revision_count + COALESCE(v_self_writing_revision_count, 0)),
        TRUE
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_home_bootstrap_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_home_bootstrap_v1() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_latest_rewrite_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH candidates AS (
        SELECT
            'assignment'::TEXT AS kind,
            post.id,
            post.mission_id,
            NULL::TEXT AS writing_type,
            NULL::TEXT AS source_key,
            post.updated_at AS requested_at
        FROM public.student_posts post
        JOIN public.writing_missions mission
          ON mission.id = post.mission_id
         AND mission.class_id = post.class_id
        WHERE post.class_id = v_student.class_id
          AND post.student_id = v_student.id
          AND mission.is_archived IS FALSE
          AND post.is_returned IS TRUE
          AND post.is_submitted IS FALSE
          AND post.is_confirmed IS FALSE
          AND post.recalled_at IS NULL

        UNION ALL

        SELECT
            post.self_writing_type AS kind,
            post.id,
            NULL::UUID AS mission_id,
            post.self_writing_type AS writing_type,
            CASE
                WHEN post.self_writing_type = 'diary'
                THEN COALESCE(
                    NULLIF(post.structured_content ->> 'diaryDate', ''),
                    (post.created_at AT TIME ZONE 'Asia/Seoul')::DATE::TEXT
                )
                ELSE NULL
            END AS source_key,
            review.reviewed_at AS requested_at
        FROM public.reading_log_teacher_reviews review
        JOIN public.student_posts post
          ON post.id = review.post_id
         AND post.class_id = review.class_id
         AND post.student_id = review.student_id
        WHERE review.class_id = v_student.class_id
          AND review.student_id = v_student.id
          AND review.review_status = 'revision_requested'
          AND post.writing_context = 'self'
          AND post.self_writing_type IN ('reading_log', 'diary')
          AND post.is_submitted IS TRUE
    )
    SELECT jsonb_build_object(
        'version', 1,
        'kind', candidate.kind,
        'id', candidate.id,
        'mission_id', candidate.mission_id,
        'writing_type', candidate.writing_type,
        'source_key', candidate.source_key
    )
    INTO v_result
    FROM candidates candidate
    ORDER BY candidate.requested_at DESC, candidate.id DESC
    LIMIT 1;

    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_my_latest_rewrite_v1() IS
    '현재 학생의 과제·독서록·일기 중 가장 최근 보완 요청 글 한 건을 학생 홈 바로가기용으로 반환한다.';

REVOKE ALL ON FUNCTION public.get_my_latest_rewrite_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_latest_rewrite_v1() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 강제 회수 흔적은 교사가 글을 보관하고 있는 동안에만 유지한다.
-- 다시쓰기 요청이나 학생 재제출 뒤에도 recalled_at/recalled_by가 남으면
-- 학생 상단 알림 조회가 현재 글을 강제 회수 상태로 판단해 반려 신호를 제외한다.

BEGIN;

-- 이미 모순 상태가 된 글을 현재 업무 상태에 맞게 복구한다. 다시쓰기 중인 글은
-- recalled_at 해제가 20261169의 상태 알림 트리거를 통과하므로 누락됐던 알림도 남는다.
UPDATE public.student_posts
SET recalled_at = NULL,
    recalled_by = NULL
WHERE recalled_at IS NOT NULL
  AND NOT (
      is_submitted IS TRUE
      AND is_returned IS FALSE
      AND is_confirmed IS FALSE
  );

UPDATE public.student_posts
SET recalled_by = NULL
WHERE recalled_at IS NULL
  AND recalled_by IS NOT NULL;

CREATE OR REPLACE FUNCTION public.request_assignment_rewrite_v1(
    p_post_id UUID,
    p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post public.student_posts%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_feedback IS NOT NULL AND char_length(p_feedback) > 4000 THEN
        RAISE EXCEPTION '다시쓰기 안내는 4,000자 이하여야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT post.* INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id
    FOR UPDATE;
    IF NOT FOUND OR v_post.writing_context <> 'assignment' OR v_post.mission_id IS NULL THEN
        RAISE EXCEPTION '다시쓰기를 요청할 과제 글을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF public.auth_user_role() <> 'ADMIN'
      AND NOT EXISTS (
          SELECT 1 FROM public.classes class
          WHERE class.id = v_post.class_id
            AND class.teacher_id = auth.uid()
            AND class.deleted_at IS NULL
      ) THEN
        RAISE EXCEPTION '이 글에 다시쓰기를 요청할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF v_post.is_confirmed IS TRUE THEN
        RAISE EXCEPTION '승인한 글은 먼저 승인을 취소한 뒤 다시쓰기를 요청해주세요.' USING ERRCODE = '22023';
    END IF;
    IF v_post.is_submitted IS NOT TRUE OR v_post.is_returned IS TRUE THEN
        RETURN jsonb_build_object('status', 'already_requested', 'post_id', v_post.id);
    END IF;

    UPDATE public.student_posts
    SET is_submitted = FALSE,
        is_returned = TRUE,
        is_confirmed = FALSE,
        recalled_at = NULL,
        recalled_by = NULL,
        ai_feedback = COALESCE(p_feedback, ai_feedback)
    WHERE id = v_post.id;

    RETURN jsonb_build_object('status', 'requested', 'post_id', v_post.id);
END;
$$;

REVOKE ALL ON FUNCTION public.request_assignment_rewrite_v1(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_assignment_rewrite_v1(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.writing_engine_submit_assignment(
    p_student_id UUID,
    p_mission_id UUID,
    p_title TEXT,
    p_content TEXT,
    p_student_answers JSONB DEFAULT '[]'::JSONB,
    p_structured_content JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_mission public.writing_missions%ROWTYPE;
    v_existing public.student_posts%ROWTYPE;
    v_post_id UUID;
    v_is_first_time BOOLEAN;
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
    v_status TEXT;
BEGIN
    IF p_student_id IS NULL OR p_mission_id IS NULL OR btrim(COALESCE(p_title, '')) = '' THEN
        RAISE EXCEPTION '학생·과제·제목이 필요합니다.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(p_student_answers, '[]'::JSONB)) <> 'array' THEN
        RAISE EXCEPTION '학생 답변 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.id = p_student_id
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    FOR UPDATE;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '활성 학생을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT mission.* INTO v_mission
    FROM public.writing_missions mission
    WHERE mission.id = p_mission_id
      AND mission.class_id = v_student.class_id
    FOR SHARE;
    IF v_mission.id IS NULL THEN
        RAISE EXCEPTION '이 학급의 과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_mission.is_archived IS TRUE THEN
        RAISE EXCEPTION '보관된 과제는 제출할 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT post.* INTO v_existing
    FROM public.student_posts post
    WHERE post.class_id = v_student.class_id
      AND post.student_id = p_student_id
      AND post.mission_id = p_mission_id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL
       AND (v_existing.is_confirmed IS TRUE OR (v_existing.is_submitted IS TRUE AND v_existing.is_returned IS FALSE)) THEN
        RAISE EXCEPTION '이미 제출되어 확인 중인 글입니다.' USING ERRCODE = '23505';
    END IF;

    v_char_count := public.writing_content_char_count(p_content);
    v_paragraph_count := public.writing_content_paragraph_count(p_content);
    IF v_char_count < GREATEST(0, COALESCE(v_mission.min_chars, 0)) THEN
        RAISE EXCEPTION '최소 글자 수를 채우지 못했습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_paragraph_count < GREATEST(0, COALESCE(v_mission.min_paragraphs, 0)) THEN
        RAISE EXCEPTION '최소 문단 수를 채우지 못했습니다.' USING ERRCODE = '22023';
    END IF;

    v_is_first_time := v_existing.id IS NULL OR NULLIF(v_existing.original_content, '') IS NULL;
    v_status := CASE WHEN v_mission.mission_type = 'meeting' THEN '제안중'
                     ELSE COALESCE(v_existing.status, 'submitted') END;

    INSERT INTO public.student_posts (
        student_id, mission_id, class_id, title, content, char_count, paragraph_count,
        awarded_base_reward, awarded_bonus_reward, awarded_bonus_threshold,
        is_submitted, is_returned, is_confirmed, is_teacher_edited,
        teacher_edited_title, teacher_edited_content, teacher_edited_at, teacher_edited_by,
        student_answers, structured_content, status, writing_context,
        original_title, original_content, first_submitted_at, recalled_at, recalled_by, updated_at
    ) VALUES (
        p_student_id, p_mission_id, v_student.class_id, btrim(p_title), COALESCE(p_content, ''),
        v_char_count, v_paragraph_count,
        v_mission.base_reward, v_mission.bonus_reward, v_mission.bonus_threshold,
        true, false, false, false,
        NULL, NULL, NULL, NULL,
        COALESCE(p_student_answers, '[]'::JSONB), p_structured_content, v_status, 'assignment',
        CASE WHEN v_is_first_time THEN btrim(p_title) ELSE v_existing.original_title END,
        CASE WHEN v_is_first_time THEN COALESCE(p_content, '') ELSE v_existing.original_content END,
        CASE WHEN v_is_first_time THEN NOW() ELSE v_existing.first_submitted_at END,
        NULL, NULL, NOW()
    )
    ON CONFLICT (student_id, mission_id) DO UPDATE SET
        class_id = EXCLUDED.class_id,
        title = EXCLUDED.title,
        content = EXCLUDED.content,
        char_count = EXCLUDED.char_count,
        paragraph_count = EXCLUDED.paragraph_count,
        awarded_base_reward = EXCLUDED.awarded_base_reward,
        awarded_bonus_reward = EXCLUDED.awarded_bonus_reward,
        awarded_bonus_threshold = EXCLUDED.awarded_bonus_threshold,
        is_submitted = true,
        is_returned = false,
        is_confirmed = false,
        recalled_at = NULL,
        recalled_by = NULL,
        is_teacher_edited = false,
        teacher_edited_title = NULL,
        teacher_edited_content = NULL,
        teacher_edited_at = NULL,
        teacher_edited_by = NULL,
        student_answers = EXCLUDED.student_answers,
        structured_content = EXCLUDED.structured_content,
        status = EXCLUDED.status,
        writing_context = 'assignment',
        original_title = CASE WHEN v_is_first_time THEN EXCLUDED.original_title ELSE public.student_posts.original_title END,
        original_content = CASE WHEN v_is_first_time THEN EXCLUDED.original_content ELSE public.student_posts.original_content END,
        first_submitted_at = CASE WHEN v_is_first_time THEN EXCLUDED.first_submitted_at ELSE public.student_posts.first_submitted_at END,
        updated_at = NOW()
    RETURNING id INTO v_post_id;

    RETURN jsonb_build_object(
        'success', true,
        'post_id', v_post_id,
        'student_id', p_student_id,
        'class_id', v_student.class_id,
        'mission_id', p_mission_id,
        'mission_type', v_mission.mission_type,
        'is_first_time', v_is_first_time,
        'char_count', v_char_count,
        'paragraph_count', v_paragraph_count,
        'base_reward', COALESCE(v_mission.base_reward, 0),
        'mission_title', v_mission.title
    );
END;
$$;

REVOKE ALL ON FUNCTION public.writing_engine_submit_assignment(UUID, UUID, TEXT, TEXT, JSONB, JSONB)
FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

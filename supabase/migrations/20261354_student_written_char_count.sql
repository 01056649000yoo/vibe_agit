-- 글자 수를 "학생이 쓴 글자"만 세게 고친다 (2026-09-28 제보: 몇 자 안 썼는데 900자로 보임).
--
-- 1) 보고서·편지·시처럼 칸이 나뉜 글은 본문(content)을 칸끼리 이어 붙여 만든다. 보고서는 이때 선생님이 정한
--    칸 제목까지 붙이는데, 그동안 그 본문 전체를 글자 수로 셌다. 칸 제목이 질문 문장이면 학생이 한 글자도
--    안 써도 수백 자가 됐고, 최소 글자 수·추가 분량 보너스도 그 수로 판정됐다.
--    → public.writing_post_char_count(content, structured_content) 가 학생이 쓴 칸만 센다.
--      칸으로 센 값은 본문으로 센 값을 넘을 수 없게 둘 중 작은 값을 쓴다(칸 값만 부풀려 보내도 늘지 않음).
-- 2) 줄바꿈도 한 글자로 셌다. 엔터를 누르고 있으면 몇 초 만에 수백 자가 된다.
--    → 줄바꿈은 세지 않고, 띄어쓰기는 몇 칸이든 한 칸으로, 글 앞뒤 빈칸은 세지 않는다.
--
-- 규칙의 원본은 src/lib/textMetrics.js(countContentChars)와 src/modules/writing/mission-types/registry.js
-- (countWrittenChars)다. tests/charCountParity.test.mjs 가 이 파일과 같은 규칙인지 본다.
--
-- 이미 저장된 글의 char_count 는 다시 세지 않는다(이미 준 보상과 맞춰 둔다). 다음에 고쳐 저장할 때 새 규칙으로 세진다.
--
-- ⚠️ 순서: 앱을 **먼저 배포**한 뒤 적용한다. 서버가 먼저 바뀌면 옛 화면은 "채웠다"고 보여 주는데
--    서버는 "최소 글자 수를 채우지 못했습니다"로 거절한다. 반대 순서면 화면이 더 엄격할 뿐이다.

BEGIN;

-- 1) 한 덩어리 글을 센다. 모든 글쓰기(일기·독서록·자유 글·과제)가 이 함수를 쓴다.
CREATE OR REPLACE FUNCTION public.writing_content_char_count(p_content TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
    SELECT char_length(
        btrim(
            regexp_replace(
                regexp_replace(
                    regexp_replace(COALESCE(p_content, ''), '[\x200B-\x200D\x2060\xFEFF]', '', 'g'),
                    '[\r\n\x2028\x2029]+', '', 'g'),
                '[ \t\f\v\x00A0\x2000-\x200A\x202F\x205F\x3000]+', ' ', 'g'),
            ' ')
    )::INTEGER;
$$;

-- 2) 칸이 나뉜 글은 학생이 쓴 칸만 센다.
CREATE OR REPLACE FUNCTION public.writing_post_char_count(p_content TEXT, p_structured JSONB)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
    SELECT LEAST(
        public.writing_content_char_count(p_content),
        COALESCE(
            CASE
                WHEN p_structured ->> 'template' = 'report'
                     AND jsonb_typeof(p_structured -> 'sections') = 'array' THEN (
                    SELECT COALESCE(sum(public.writing_content_char_count(
                        COALESCE(NULLIF(section ->> 'body', ''), section #>> '{image,caption}', ''))), 0)
                    FROM jsonb_array_elements(p_structured -> 'sections') AS section
                )
                WHEN p_structured ->> 'template' = 'letter' THEN
                    public.writing_content_char_count(p_structured ->> 'recipient')
                    + public.writing_content_char_count(p_structured ->> 'greeting')
                    + public.writing_content_char_count(p_structured ->> 'body')
                    + public.writing_content_char_count(p_structured ->> 'closing')
                WHEN p_structured ->> 'template' = 'poem'
                     AND jsonb_typeof(p_structured -> 'stanzas') = 'array' THEN (
                    SELECT COALESCE(sum(public.writing_content_char_count(stanza)), 0)
                    FROM jsonb_array_elements_text(p_structured -> 'stanzas') AS stanza
                )
            END::INTEGER,
            public.writing_content_char_count(p_content)
        )
    )::INTEGER;
$$;

REVOKE ALL ON FUNCTION public.writing_post_char_count(TEXT, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.writing_post_char_count(TEXT, JSONB) TO authenticated;

-- 3) 저장 때 서버가 다시 세는 트리거 (20261230 그대로 + 마지막 글자 수 줄만 바꿈)
CREATE OR REPLACE FUNCTION public.guard_student_post_server_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
    IF public.auth_user_role() IS DISTINCT FROM 'STUDENT' THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.awarded_base_reward := NULL;
        NEW.awarded_bonus_reward := NULL;
        NEW.awarded_bonus_threshold := NULL;
        NEW.awarded_min_chars := NULL;
        NEW.awarded_repeat_bonus_enabled := NULL;
        NEW.awarded_repeat_bonus_threshold := NULL;
        NEW.awarded_repeat_bonus_reward := NULL;
        NEW.awarded_repeat_bonus_max_count := NULL;
        NEW.is_submitted := FALSE;
        NEW.is_returned := FALSE;
        NEW.is_confirmed := FALSE;
        NEW.spell_check_used_at := NULL;
        NEW.spell_check_result := NULL;
    ELSE
        NEW.awarded_base_reward := OLD.awarded_base_reward;
        NEW.awarded_bonus_reward := OLD.awarded_bonus_reward;
        NEW.awarded_bonus_threshold := OLD.awarded_bonus_threshold;
        NEW.awarded_min_chars := OLD.awarded_min_chars;
        NEW.awarded_repeat_bonus_enabled := OLD.awarded_repeat_bonus_enabled;
        NEW.awarded_repeat_bonus_threshold := OLD.awarded_repeat_bonus_threshold;
        NEW.awarded_repeat_bonus_reward := OLD.awarded_repeat_bonus_reward;
        NEW.awarded_repeat_bonus_max_count := OLD.awarded_repeat_bonus_max_count;
        NEW.is_submitted := OLD.is_submitted;
        NEW.is_returned := OLD.is_returned;
        NEW.is_confirmed := OLD.is_confirmed;
        NEW.spell_check_used_at := OLD.spell_check_used_at;
        NEW.spell_check_result := OLD.spell_check_result;
    END IF;

    NEW.char_count := public.writing_post_char_count(COALESCE(NEW.content, ''), NEW.structured_content);
    RETURN NEW;
END;
$$;

-- 4) 과제 제출 (20261170 그대로 + 최소 글자 수 판정 줄만 바꿈)
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

    v_char_count := public.writing_post_char_count(p_content, p_structured_content);
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

-- 과제 글쓰기 임시저장을 테이블 직접 쓰기에서 전용 RPC로 옮긴다.
--
-- 왜 옮기나: 독서록·일기는 이미 전용 RPC(upsert_my_diary·upsert_my_reading_log*)로 저장하는데
-- 과제 글쓰기만 클라이언트가 student_posts 에 직접 upsert 하는 옛 방식이 남아 있었다. 그래서
-- 임시저장 요청에 awarded_base_reward·char_count·is_submitted 같은 **서버가 정해야 할 값이
-- 클라이언트에서 실려 왔고**, 그게 2026-08-17 포인트 조작 취약점의 뿌리였다.
-- 20261117 가드가 그 값들을 되돌려 막고 있지만, 애초에 보내지 않는 구조로 바꾸는 것이 정본이다.
-- (성능 계약 "저장·제출·구매 같은 한 번의 행동은 전용 RPC 한 번에서 끝낸다"와도 맞춘다.)
--
-- 이 RPC 가 지키는 것 — 제출 RPC(writing_engine_submit_assignment)와 같은 기준을 쓴다:
--   · 학생 본인 인증, 활성 학생, 학급이 일치하는 과제
--   · 보관된 과제 거부
--   · 이미 제출·확인 중인 글 거부(다시쓰기 요청을 받은 글은 허용)
--   · char_count·paragraph_count 를 서버에서 다시 계산
--   · awarded_*·is_submitted·is_returned·is_confirmed 는 **아예 건드리지 않는다**
--     (제출·승인 RPC 만 쓰는 값이다. 임시저장은 상태를 바꾸는 행동이 아니다.)

BEGIN;

CREATE OR REPLACE FUNCTION public.save_my_assignment_draft_v1(
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
    v_student_id UUID := public.auth_student_id();
    v_student public.students%ROWTYPE;
    v_mission public.writing_missions%ROWTYPE;
    v_existing public.student_posts%ROWTYPE;
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
    v_post_id UUID;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_mission_id IS NULL THEN
        RAISE EXCEPTION '과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(COALESCE(p_student_answers, '[]'::JSONB)) <> 'array' THEN
        RAISE EXCEPTION '학생 답변 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_structured_content IS NOT NULL AND jsonb_typeof(p_structured_content) NOT IN ('object', 'array') THEN
        RAISE EXCEPTION '글 구성 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    -- 임시저장은 자주 불리므로 본문 상한을 서버에서도 확인한다(계약: 행동당 쓰기 RPC 1회).
    IF char_length(COALESCE(p_content, '')) > 100000 OR char_length(COALESCE(p_title, '')) > 200 THEN
        RAISE EXCEPTION '글이 저장 가능한 길이를 넘었습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '활성 학생을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT mission.* INTO v_mission
    FROM public.writing_missions mission
    WHERE mission.id = p_mission_id
      AND mission.class_id = v_student.class_id;
    IF v_mission.id IS NULL THEN
        RAISE EXCEPTION '이 학급의 과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF v_mission.is_archived IS TRUE THEN
        RAISE EXCEPTION '보관된 과제는 수정할 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT post.* INTO v_existing
    FROM public.student_posts post
    WHERE post.class_id = v_student.class_id
      AND post.student_id = v_student_id
      AND post.mission_id = p_mission_id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL
       AND (v_existing.is_confirmed IS TRUE
            OR (v_existing.is_submitted IS TRUE AND v_existing.is_returned IS FALSE)) THEN
        RAISE EXCEPTION '이미 제출된 글은 수정할 수 없습니다.' USING ERRCODE = '23505';
    END IF;

    v_char_count := public.writing_content_char_count(COALESCE(p_content, ''));
    v_paragraph_count := public.writing_content_paragraph_count(COALESCE(p_content, ''));

    IF v_existing.id IS NULL THEN
        -- 새 초안. 상태 컬럼은 기본값(미제출)으로 두고 보상은 비운다. 제출 RPC 가 미션 값으로 채운다.
        INSERT INTO public.student_posts (
            student_id, mission_id, class_id, title, content,
            char_count, paragraph_count, student_answers, structured_content,
            is_submitted, is_returned, is_confirmed, writing_context, updated_at
        ) VALUES (
            v_student_id, p_mission_id, v_student.class_id,
            btrim(COALESCE(p_title, '')), COALESCE(p_content, ''),
            v_char_count, v_paragraph_count,
            COALESCE(p_student_answers, '[]'::JSONB), p_structured_content,
            false, false, false, 'assignment', NOW()
        )
        RETURNING id INTO v_post_id;
    ELSE
        -- 기존 초안. 학생이 쓰는 값만 갱신한다. 상태·보상 컬럼은 목록에 없다 = 건드리지 않는다.
        -- 교사가 고쳐 준 글을 학생이 이어서 쓰면 그 글은 다시 학생의 것이 되므로 교사 수정 표시를
        -- 여기서 서버가 정리한다(예전에는 클라이언트가 이 값을 직접 지워 보냈다).
        UPDATE public.student_posts SET
            title = btrim(COALESCE(p_title, '')),
            content = COALESCE(p_content, ''),
            char_count = v_char_count,
            paragraph_count = v_paragraph_count,
            student_answers = COALESCE(p_student_answers, '[]'::JSONB),
            structured_content = p_structured_content,
            is_teacher_edited = false,
            teacher_edited_title = NULL,
            teacher_edited_content = NULL,
            teacher_edited_at = NULL,
            teacher_edited_by = NULL,
            updated_at = NOW()
        WHERE id = v_existing.id
        RETURNING id INTO v_post_id;
    END IF;

    RETURN jsonb_build_object(
        'version', 1,
        'post_id', v_post_id,
        'char_count', v_char_count,
        'paragraph_count', v_paragraph_count,
        'updated_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_assignment_draft_v1(UUID, TEXT, TEXT, JSONB, JSONB)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_assignment_draft_v1(UUID, TEXT, TEXT, JSONB, JSONB)
    TO authenticated, service_role;

COMMIT;

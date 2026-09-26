-- 교사 수정본 보관(teacher_revision_content)을 뺀다(2026-09-26, 20261352 의 일부를 되돌림).
--
-- 형광펜에서 "선생님이 고쳐 준 곳" 을 교사 수정본과 어절이 같은지로 갈랐는데, 학생이 선생님 수정을 조금만 다듬어도
-- 틀리게 판정됐다. 누가 고쳤는지는 어절 비교로 가를 수 없다고 보고(선생님 판단) 처음 글 ↔ 최종 글 비교만 남긴다.
-- 쓰지 않는 학생 글 사본을 쌓아 두지 않도록 칸도 지운다. 고친 자리 수(revision_change_count)와 그 보호는 그대로다.
--
-- ⚠️ 순서: 앱이 이 칸을 읽지 않게 **먼저 배포**한 뒤 적용한다(칸을 먼저 지우면 그 사이 열린 화면의 목록 요청이 400).

BEGIN;

-- 1) 트리거: 교사 수정본 부분만 뺀다.
CREATE OR REPLACE FUNCTION public.guard_student_post_revision_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_writer BOOLEAN := COALESCE(current_setting('agit.revision_writer', true), '') = 'on';
BEGIN
    -- 고친 자리 수: 전용 함수(record_post_revision_counts_v1)만 쓴다. 학생도 RLS 상 자기 글 행을 고칠 수 있다.
    IF NEW.revision_change_count IS DISTINCT FROM OLD.revision_change_count AND NOT v_writer THEN
        NEW.revision_change_count := OLD.revision_change_count;
    END IF;

    -- 글이 바뀌거나 승인이 풀리면 센 수는 더 이상 맞지 않는다.
    IF NEW.content IS DISTINCT FROM OLD.content
       OR NEW.original_content IS DISTINCT FROM OLD.original_content
       OR NOT COALESCE(NEW.is_confirmed, false) THEN
        NEW.revision_change_count := NULL;
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_student_post_revision_fields() FROM PUBLIC, anon, authenticated;

-- 2) 학생 글쓰기 작업공간: 20261231 정의로 되돌린다(교사 수정본 칸을 돌려주지 않는다).
CREATE OR REPLACE FUNCTION public.get_student_assignment_workspace_v1(p_mission_id uuid, p_post_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student public.students%ROWTYPE;
    v_mission JSONB;
    v_post JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.*
    INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT to_jsonb(mission_row)
    INTO v_mission
    FROM (
        SELECT
            mission.id, mission.title, mission.guide, mission.genre,
            mission.mission_type, mission.input_template, mission.template_config,
            mission.min_chars, mission.min_paragraphs, mission.guide_questions,
            mission.is_archived, mission.base_reward, mission.bonus_threshold,
            mission.bonus_reward,
            mission.repeat_bonus_enabled, mission.repeat_bonus_threshold,
            mission.repeat_bonus_reward, mission.repeat_bonus_max_count
        FROM public.writing_missions mission
        WHERE mission.id = p_mission_id
          AND mission.class_id = v_student.class_id
        LIMIT 1
    ) mission_row;

    IF v_mission IS NULL THEN
        RAISE EXCEPTION '이 학급의 과제를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT to_jsonb(post_row)
    INTO v_post
    FROM (
        SELECT
            post.id, post.title, post.content, post.structured_content,
            post.is_returned, post.is_confirmed, post.is_submitted, post.ai_feedback,
            post.original_title, post.original_content, post.show_original,
            post.teacher_edited_title, post.teacher_edited_content,
            post.teacher_edited_at, post.is_teacher_edited, post.student_answers,
            post.student_id, post.mission_id, post.updated_at
        FROM public.student_posts post
        WHERE post.class_id = v_student.class_id
          AND post.student_id = v_student.id
          AND post.mission_id = p_mission_id
          AND (p_post_id IS NULL OR post.id = p_post_id)
        ORDER BY post.updated_at DESC
        LIMIT 1
    ) post_row;

    RETURN jsonb_build_object(
        'version', 1,
        'mission', v_mission,
        'post', v_post
    );
END;
$function$;

-- 3) 칸 지우기
ALTER TABLE public.student_posts DROP COLUMN IF EXISTS teacher_revision_content;

COMMIT;

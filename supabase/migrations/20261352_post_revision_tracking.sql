-- 승인된 글의 고친 자리 수(목록 카드 `🖍️ N군데 고침`)와 교사 수정본 보관(형광펜에서 선생님이 고쳐 준 곳 가르기).
-- 2026-09-26.
--
-- 1) revision_change_count
--    처음 글 → 최종 글의 바뀐 자리 수. 계산 규칙(어절 단위 비교)은 화면의 `writingDiff.js` 하나뿐이라,
--    교사가 승인한 직후 화면이 세어 `record_post_revision_counts_v1` 로 저장한다. SQL 에 같은 규칙을 한 번 더 두면
--    두 곳이 어긋난다. 글 내용이 바뀌거나 승인이 풀리면 트리거가 비운다(낡은 수를 보여 주지 않는다).
-- 2) teacher_revision_content
--    `teacher_edit_student_post` 는 최종 글(content)을 교사 수정본으로 덮어쓰고 글을 학생에게 돌려준다. 학생이 다시 내면
--    `teacher_edited_content` 가 비워져, 나중에는 "선생님이 고친 곳" 을 알 길이 없었다. 교사가 고칠 때마다 그 글을
--    여기에 옮겨 담고 학생이 다시 내도 남긴다. 기존 함수는 건드리지 않고 트리거로만 채운다.
--
-- 두 칸 모두 학생 글 표의 기존 권한(RLS)으로 읽힌다. 쓰기는 이 파일의 트리거·함수만 한다 — 표 권한상 학생도
-- 자기 글 행을 고칠 수 있는 길이 있어, 그 길로 수를 바꾸지 못하게 트리거가 되돌린다.

BEGIN;

ALTER TABLE public.student_posts
    ADD COLUMN IF NOT EXISTS revision_change_count SMALLINT,
    ADD COLUMN IF NOT EXISTS teacher_revision_content TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'student_posts_revision_change_count_range'
          AND conrelid = 'public.student_posts'::regclass
    ) THEN
        ALTER TABLE public.student_posts
            ADD CONSTRAINT student_posts_revision_change_count_range
            CHECK (revision_change_count IS NULL OR revision_change_count BETWEEN 0 AND 999);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.guard_student_post_revision_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_writer BOOLEAN := COALESCE(current_setting('agit.revision_writer', true), '') = 'on';
BEGIN
    -- 교사 수정본: 교사가 고쳐 teacher_edited_content 가 새로 채워질 때만 옮겨 담는다.
    IF NEW.teacher_edited_content IS NOT NULL
       AND NEW.teacher_edited_content IS DISTINCT FROM OLD.teacher_edited_content THEN
        NEW.teacher_revision_content := NEW.teacher_edited_content;
    ELSIF NEW.teacher_revision_content IS DISTINCT FROM OLD.teacher_revision_content AND NOT v_writer THEN
        NEW.teacher_revision_content := OLD.teacher_revision_content;
    END IF;

    -- 고친 자리 수: 전용 함수(record_post_revision_counts_v1)만 쓴다.
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

DROP TRIGGER IF EXISTS trg_student_posts_revision_fields ON public.student_posts;
CREATE TRIGGER trg_student_posts_revision_fields
    BEFORE UPDATE ON public.student_posts
    FOR EACH ROW
    EXECUTE FUNCTION public.guard_student_post_revision_fields();

-- 교사가 승인한 뒤 화면이 센 수를 저장한다. 한 번에 최대 200편(여러 편 한꺼번에 승인).
-- 권한: 그 글의 학급 담임 또는 관리자, 그리고 승인된 글만. 권한이 없거나 승인 전인 글은 조용히 건너뛴다.
CREATE OR REPLACE FUNCTION public.record_post_revision_counts_v1(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller UUID := auth.uid();
    v_is_admin BOOLEAN;
    v_item JSONB;
    v_post_id UUID;
    v_count INTEGER;
    v_updated INTEGER := 0;
BEGIN
    IF v_caller IS NULL THEN
        RAISE EXCEPTION '[보안] 고친 자리 수를 저장할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 200 THEN
        RAISE EXCEPTION '저장할 글 목록이 올바르지 않습니다(최대 200편).' USING ERRCODE = '22023';
    END IF;

    v_is_admin := public.auth_user_role() = 'ADMIN';
    PERFORM set_config('agit.revision_writer', 'on', true);

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        IF jsonb_typeof(v_item) <> 'object'
           OR COALESCE(v_item->>'post_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           OR COALESCE(v_item->>'count', '') !~ '^[0-9]{1,4}$' THEN
            CONTINUE;
        END IF;
        v_post_id := (v_item->>'post_id')::UUID;
        v_count := LEAST((v_item->>'count')::INTEGER, 999);

        UPDATE public.student_posts post
        SET revision_change_count = v_count
        WHERE post.id = v_post_id
          AND post.is_confirmed IS TRUE
          AND (
              v_is_admin
              OR EXISTS (
                  SELECT 1 FROM public.classes class
                  WHERE class.id = post.class_id AND class.teacher_id = v_caller
              )
          );
        IF FOUND THEN
            v_updated := v_updated + 1;
        END IF;
    END LOOP;

    PERFORM set_config('agit.revision_writer', '', true);
    RETURN jsonb_build_object('updated', v_updated);
END;
$$;

REVOKE ALL ON FUNCTION public.record_post_revision_counts_v1(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_post_revision_counts_v1(JSONB) TO authenticated;

-- 지금 교사 수정본이 남아 있는 글(학생이 아직 다시 내지 않은 글)은 그 수정본을 보관 칸으로 옮긴다.
-- 이미 다시 낸 글의 옛 교사 수정본은 남아 있지 않아 되살릴 수 없다.
SELECT set_config('agit.revision_writer', 'on', true);
UPDATE public.student_posts
SET teacher_revision_content = teacher_edited_content
WHERE teacher_edited_content IS NOT NULL
  AND teacher_revision_content IS NULL;
SELECT set_config('agit.revision_writer', '', true);


-- 학생 글쓰기 화면도 교사 수정본을 받아 형광펜에서 선생님이 고쳐 준 곳을 가른다.
-- 20261231 의 정의를 그대로 옮기고 post.teacher_revision_content 한 칸만 더했다(권한은 CREATE OR REPLACE 가 유지).
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
            post.teacher_edited_at, post.is_teacher_edited, post.teacher_revision_content, post.student_answers,
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

COMMIT;

-- 선생님 교정 회차 기록(2026-09-27 요청, 빨간 펜 교정지·회차별 보기).
--
-- `teacher_edit_student_post`(직접 고쳐 주기)는 최종 글을 교사 수정본으로 **덮어쓰고** 글을 학생에게 돌려준다. 그래서
-- "선생님이 고치기 전 학생 글" 은 저장하는 순간 사라지고, 학생이 다시 내면 교사 수정본도 지워졌다(is_teacher_edited=false,
-- teacher_edited_content=NULL — 20261354). 교정지를 보여 주려면 두 판이 모두 있어야 해서, 저장할 때마다 **고치기 전 글과
-- 고친 글을 한 쌍으로** 회차에 남긴다. 누가 어느 어절을 썼는지 추측하지 않는다(20261353 에서 뺀 방식과 다르다) — 실제 두 판을 견준다.
--
-- - 학생이 다시 내기 전에 교사가 또 고치면 새 회차를 만들지 않고 **그 회차의 고친 글만** 바꾼다. 아니면 "선생님 글 → 선생님 글" 이
--   한 회차로 끼어든다.
-- - `student_posts.teacher_edit_rounds` 에 회차 수를 둔다 — 목록은 이 수만 읽고, 기록 본문은 교정지를 열 때만 읽는다.
--   학생도 RLS 상 자기 글 행을 고칠 수 있어, 이 수도 전용 경로 밖에서는 트리거가 되돌린다(20261352 와 같은 방식).
-- - 이 업데이트 뒤에 고쳐 준 글부터 쌓인다. 옛 글은 고치기 전 글이 남아 있지 않아 되살리지 않는다.

BEGIN;

ALTER TABLE public.student_posts
    ADD COLUMN IF NOT EXISTS teacher_edit_rounds SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'student_posts_teacher_edit_rounds_range' AND conrelid = 'public.student_posts'::regclass
    ) THEN
        ALTER TABLE public.student_posts
            ADD CONSTRAINT student_posts_teacher_edit_rounds_range CHECK (teacher_edit_rounds BETWEEN 0 AND 999);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.student_post_teacher_edits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    post_id UUID NOT NULL REFERENCES public.student_posts(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id UUID,
    round SMALLINT NOT NULL CHECK (round BETWEEN 1 AND 999),
    base_title TEXT NOT NULL DEFAULT '',
    base_content TEXT NOT NULL DEFAULT '',
    edited_title TEXT NOT NULL DEFAULT '',
    edited_content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, round)
);
CREATE INDEX IF NOT EXISTS idx_student_post_teacher_edits_class ON public.student_post_teacher_edits (class_id);

ALTER TABLE public.student_post_teacher_edits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_post_teacher_edits FROM PUBLIC, anon, authenticated;

-- 트리거: 회차 수도 전용 경로(agit.revision_writer)만 바꾼다. 나머지는 20261353 그대로.
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
    -- 선생님 교정 회차 수: 직접 고쳐 주기(teacher_edit_student_post)만 쓴다.
    IF NEW.teacher_edit_rounds IS DISTINCT FROM OLD.teacher_edit_rounds AND NOT v_writer THEN
        NEW.teacher_edit_rounds := OLD.teacher_edit_rounds;
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

-- 직접 고쳐 주기: 20260330 정의 그대로 + 고치기 전 글·고친 글을 회차에 남긴다.
CREATE OR REPLACE FUNCTION public.teacher_edit_student_post(p_post_id uuid, p_title text, p_content text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_teacher_id UUID := auth.uid();
    v_post RECORD;
    v_char_count INTEGER;
    v_paragraph_count INTEGER;
    v_last public.student_post_teacher_edits%ROWTYPE;
BEGIN
    IF v_teacher_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    IF p_post_id IS NULL THEN
        RAISE EXCEPTION 'Post id is required';
    END IF;

    IF COALESCE(BTRIM(p_title), '') = '' THEN
        RAISE EXCEPTION 'Title is required';
    END IF;

    IF COALESCE(BTRIM(p_content), '') = '' THEN
        RAISE EXCEPTION 'Content is required';
    END IF;

    SELECT
        sp.id,
        sp.student_id,
        sp.mission_id,
        sp.class_id,
        sp.title,
        sp.content,
        c.teacher_id
    INTO v_post
    FROM public.student_posts sp
    JOIN public.classes c
      ON c.id = sp.class_id
    WHERE sp.id = p_post_id
    FOR UPDATE OF sp;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Post not found';
    END IF;

    IF v_post.teacher_id <> v_teacher_id AND public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only the class teacher can edit this post';
    END IF;

    v_char_count := char_length(p_content);
    v_paragraph_count := COALESCE(array_length(regexp_split_to_array(p_content, E'\\n+'), 1), 0);

    -- 교정 회차 남기기. 마지막 회차 뒤로 학생이 글을 바꾸지 않았으면(지금 글 = 그 회차의 고친 글) 같은 회차를 고친다.
    SELECT * INTO v_last FROM public.student_post_teacher_edits
    WHERE post_id = p_post_id ORDER BY round DESC LIMIT 1;
    PERFORM set_config('agit.revision_writer', 'on', true);
    IF v_last.id IS NOT NULL AND v_last.edited_content = COALESCE(v_post.content, '') THEN
        UPDATE public.student_post_teacher_edits
        SET edited_title = BTRIM(p_title), edited_content = p_content, teacher_id = v_teacher_id, updated_at = NOW()
        WHERE id = v_last.id;
    ELSE
        INSERT INTO public.student_post_teacher_edits
            (post_id, class_id, teacher_id, round, base_title, base_content, edited_title, edited_content)
        VALUES
            (p_post_id, v_post.class_id, v_teacher_id, COALESCE(v_last.round, 0) + 1,
             COALESCE(v_post.title, ''), COALESCE(v_post.content, ''), BTRIM(p_title), p_content);
    END IF;

    UPDATE public.student_posts
    SET
        title = BTRIM(p_title),
        content = p_content,
        char_count = v_char_count,
        paragraph_count = v_paragraph_count,
        teacher_edited_title = BTRIM(p_title),
        teacher_edited_content = p_content,
        teacher_edited_at = NOW(),
        teacher_edited_by = v_teacher_id,
        is_teacher_edited = true,
        is_returned = true,
        is_submitted = false,
        is_confirmed = false,
        teacher_edit_rounds = (SELECT count(*) FROM public.student_post_teacher_edits WHERE post_id = p_post_id)
    WHERE id = p_post_id;
    PERFORM set_config('agit.revision_writer', '', true);

    RETURN json_build_object(
        'success', true,
        'post_id', p_post_id
    );
END;
$function$;

REVOKE ALL ON FUNCTION public.teacher_edit_student_post(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_edit_student_post(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 교정지 읽기(열 때만). 회차마다 고치기 전·고친 글과 **그 다음에 학생이 낸 글**(다음 회차의 고치기 전 글, 마지막 회차는
-- 다시 냈으면 지금 글, 아직이면 NULL)을 돌려준다. 학생은 자기 글, 교사는 담당 학급 글, 관리자는 모두.
CREATE OR REPLACE FUNCTION public.get_post_teacher_edits_v1(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT;
    v_post RECORD;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '[보안] 로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT post.id, post.class_id, post.student_id, post.content, post.is_submitted, class.teacher_id
    INTO v_post
    FROM public.student_posts post
    JOIN public.classes class ON class.id = post.class_id
    WHERE post.id = p_post_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '글을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_role := public.auth_user_role();
    IF v_role = 'STUDENT' THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.students student
            WHERE student.auth_id = auth.uid() AND student.id = v_post.student_id AND student.class_id = v_post.class_id
        ) THEN
            RAISE EXCEPTION '[보안] 내 글만 볼 수 있습니다.' USING ERRCODE = '42501';
        END IF;
    ELSIF v_role = 'TEACHER' THEN
        IF v_post.teacher_id IS DISTINCT FROM auth.uid() THEN
            RAISE EXCEPTION '[보안] 담당 학급의 글이 아닙니다.' USING ERRCODE = '42501';
        END IF;
    ELSIF v_role <> 'ADMIN' THEN
        RAISE EXCEPTION '[보안] 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN jsonb_build_object('rounds', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
            'round', edit.round,
            'edited_at', edit.updated_at,
            'base_title', edit.base_title,
            'base_content', edit.base_content,
            'edited_title', edit.edited_title,
            'edited_content', edit.edited_content,
            'next_content', COALESCE(
                (SELECT later.base_content FROM public.student_post_teacher_edits later
                 WHERE later.post_id = edit.post_id AND later.round = edit.round + 1),
                CASE WHEN v_post.is_submitted THEN v_post.content END
            )
        ) ORDER BY edit.round)
        FROM (
            SELECT * FROM public.student_post_teacher_edits
            WHERE post_id = p_post_id ORDER BY round LIMIT 30
        ) edit
    ), '[]'::JSONB));
END;
$$;

REVOKE ALL ON FUNCTION public.get_post_teacher_edits_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_post_teacher_edits_v1(UUID) TO authenticated;

-- 학생 글쓰기 작업공간: 20261353 정의 그대로 + post.teacher_edit_rounds(교정지 칸을 보일지 정한다).
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
            post.teacher_edited_at, post.is_teacher_edited, post.teacher_edit_rounds, post.student_answers,
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

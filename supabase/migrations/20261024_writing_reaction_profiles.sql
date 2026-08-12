BEGIN;

CREATE TABLE IF NOT EXISTS public.writing_reaction_profile_types (
    profile_id TEXT NOT NULL CHECK (profile_id ~ '^[a-z][a-z0-9_]{1,63}$'),
    reaction_type TEXT NOT NULL CHECK (reaction_type ~ '^[a-z][a-z0-9_]{1,63}$'),
    sort_order SMALLINT NOT NULL CHECK (sort_order BETWEEN 1 AND 100),
    PRIMARY KEY (profile_id, reaction_type),
    UNIQUE (reaction_type)
);

ALTER TABLE public.writing_reaction_profile_types ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.writing_reaction_profile_types FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.writing_reaction_profile_types TO service_role;

INSERT INTO public.writing_reaction_profile_types (profile_id, reaction_type, sort_order)
VALUES
    ('standard', 'heart', 1),
    ('standard', 'laugh', 2),
    ('standard', 'wow', 3),
    ('standard', 'bulb', 4),
    ('standard', 'star', 5),
    ('report', 'report_detail', 1),
    ('report', 'report_clear', 2),
    ('report', 'report_new', 3),
    ('meeting', 'agree', 1),
    ('meeting', 'supplement', 2),
    ('meeting', 'disagree', 3)
ON CONFLICT (profile_id, reaction_type) DO UPDATE
SET sort_order = EXCLUDED.sort_order;

COMMENT ON TABLE public.writing_reaction_profile_types IS
    '글 장르별 허용 반응 유형. 브라우저는 매니페스트를 사용하고 쓰기 RPC만 이 내부 카탈로그를 조회한다.';

-- 반응 쓰기는 권한·학급·공개 상태·장르 유형을 검증하는 RPC 한 곳으로 제한한다.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.post_reactions
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.toggle_my_post_reaction_v1(
    p_post_id UUID,
    p_reaction_type TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_post_id UUID;
    v_existing public.post_reactions%ROWTYPE;
    v_template_id TEXT;
    v_profile_id TEXT;
    v_selected BOOLEAN := TRUE;
BEGIN
    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT post.id, COALESCE(NULLIF(mission.input_template, ''), NULLIF(mission.mission_type, ''))
    INTO v_post_id, v_template_id
    FROM public.student_posts post
    LEFT JOIN public.writing_missions mission
      ON mission.id = post.mission_id AND mission.class_id = post.class_id
    WHERE post.id = p_post_id
      AND post.class_id = v_student.class_id
      AND post.is_submitted IS TRUE
      AND post.visibility = 'class';
    IF v_post_id IS NULL THEN
        RAISE EXCEPTION '반응할 수 있는 글을 찾지 못했습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1
            FROM public.writing_reaction_profile_types profile
            WHERE profile.profile_id = v_template_id
        ) THEN v_template_id
        ELSE 'standard'
    END
    INTO v_profile_id;

    IF NOT EXISTS (
        SELECT 1
        FROM public.writing_reaction_profile_types profile
        WHERE profile.profile_id = v_profile_id
          AND profile.reaction_type = p_reaction_type
    ) THEN
        RAISE EXCEPTION '% 글에서는 사용할 수 없는 반응입니다.', v_profile_id USING ERRCODE = '22023';
    END IF;

    SELECT reaction.* INTO v_existing
    FROM public.post_reactions reaction
    WHERE reaction.post_id = p_post_id
      AND reaction.student_id = v_student.id
    FOR UPDATE;

    IF v_existing.id IS NOT NULL AND v_existing.reaction_type = p_reaction_type THEN
        DELETE FROM public.post_reactions WHERE id = v_existing.id;
        v_selected := FALSE;
    ELSE
        INSERT INTO public.post_reactions (post_id, student_id, class_id, reaction_type)
        VALUES (p_post_id, v_student.id, v_student.class_id, p_reaction_type)
        ON CONFLICT (post_id, student_id) DO UPDATE
        SET reaction_type = EXCLUDED.reaction_type;
    END IF;

    RETURN jsonb_build_object(
        'version', 1,
        'selected', v_selected,
        'reaction_type', p_reaction_type,
        'reaction_profile', v_profile_id,
        'student_id', v_student.id,
        'total_count', (
            SELECT count(*) FROM public.post_reactions reaction WHERE reaction.post_id = p_post_id
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.toggle_my_post_reaction_v1(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.toggle_my_post_reaction_v1(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_mission_engagement_v1(p_mission_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_template_id TEXT;
    v_profile_id TEXT;
    v_result JSONB;
BEGIN
    SELECT mission.class_id,
           COALESCE(NULLIF(mission.input_template, ''), NULLIF(mission.mission_type, ''))
    INTO v_class_id, v_template_id
    FROM public.writing_missions mission
    JOIN public.classes class ON class.id = mission.class_id
    WHERE mission.id = p_mission_id
      AND class.deleted_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN');
    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '이 과제의 학생 반응을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT CASE
        WHEN EXISTS (
            SELECT 1 FROM public.writing_reaction_profile_types profile
            WHERE profile.profile_id = v_template_id
        ) THEN v_template_id
        ELSE 'standard'
    END
    INTO v_profile_id;

    WITH post_page AS MATERIALIZED (
        SELECT post.id, post.title, post.created_at, student.name AS student_name
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id AND student.class_id = post.class_id
        WHERE post.class_id = v_class_id
          AND post.mission_id = p_mission_id
          AND student.deleted_at IS NULL
        ORDER BY post.created_at DESC, post.id DESC
        LIMIT 100
    )
    SELECT jsonb_build_object(
        'version', 1,
        'reaction_profile', v_profile_id,
        'max_rows', 100,
        'items', COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', post.id,
                'title', post.title,
                'student_name', post.student_name,
                'reactions', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', reaction.id,
                        'reaction_type', reaction.reaction_type
                    ) ORDER BY reaction.created_at)
                    FROM public.post_reactions reaction
                    WHERE reaction.class_id = v_class_id
                      AND reaction.post_id = post.id
                ), '[]'::JSONB),
                'comments', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object(
                        'id', recent_comment.id,
                        'content', recent_comment.content,
                        'teacher_id', recent_comment.teacher_id,
                        'student_name', recent_comment.student_name
                    ) ORDER BY recent_comment.created_at DESC)
                    FROM (
                        SELECT comment.id, comment.content, comment.teacher_id, comment.created_at,
                               commenter.name AS student_name
                        FROM public.post_comments comment
                        LEFT JOIN public.students commenter
                          ON commenter.id = comment.student_id AND commenter.class_id = comment.class_id
                        WHERE comment.class_id = v_class_id
                          AND comment.post_id = post.id
                        ORDER BY comment.created_at DESC, comment.id DESC
                        LIMIT 3
                    ) recent_comment
                ), '[]'::JSONB),
                'comment_count', (
                    SELECT count(*)::INTEGER
                    FROM public.post_comments comment
                    WHERE comment.class_id = v_class_id
                      AND comment.post_id = post.id
                )
            ) ORDER BY post.created_at DESC, post.id DESC
        ), '[]'::JSONB)
    )
    INTO v_result
    FROM post_page post;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_mission_engagement_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_mission_engagement_v1(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

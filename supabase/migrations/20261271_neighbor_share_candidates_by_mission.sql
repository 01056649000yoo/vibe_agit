BEGIN;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_share_candidates_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100);
    v_items JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT COALESCE(jsonb_agg(row_data.item ORDER BY row_data.updated_at DESC, row_data.post_id DESC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT post.id AS post_id, post.updated_at,
            jsonb_build_object(
                'post_id', post.id,
                'student_name', left(btrim(student.name), 30),
                'title', post.title,
                'excerpt', left(regexp_replace(COALESCE(post.content, ''), E'[\s\n\r]+', ' ', 'g'), 180),
                'updated_at', post.updated_at,
                'mission_id', post.mission_id,
                'mission_title', COALESCE(mission.title, '자율 글'),
                'shared_post_id', shared.id,
                'share_status', shared.status,
                'review_note', shared.review_note
            ) AS item
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id AND student.class_id = post.class_id
         AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
        LEFT JOIN public.writing_missions mission
          ON mission.id = post.mission_id AND mission.class_id = post.class_id
        LEFT JOIN public.neighbor_shared_posts shared
          ON shared.space_id = p_space_id AND shared.post_id = post.id
         AND shared.class_id = post.class_id AND shared.student_id = post.student_id
        WHERE post.class_id = p_actor_class_id
          AND public.neighbor_source_is_shareable_v1(post)
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id
          )
        ORDER BY post.updated_at DESC, post.id DESC
        LIMIT v_limit
    ) row_data;
    RETURN jsonb_build_object('version', 1, 'max_rows', 100, 'items', v_items);
END;
$$;

COMMIT;

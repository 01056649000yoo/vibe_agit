-- 글 모으기 후보 상한을 100→500 편으로 올린다(2026-09-19).
--
-- 왜: 글 모으기를 주제별/학생별 폴더로 묶어 보게 바꿨는데, 후보 RPC가 "가장 최근 100편"만
-- 돌려주어서, 자율 글처럼 편수가 많은 주제가 최근 100편을 거의 다 차지하면 다른 주제가
-- 목록에서 사라졌다(예: 진남초 4학년 1반은 공유 가능한 글이 25개 주제·280여 편인데 4개 주제만 떴다).
-- 한 학급의 한 학기 제출 글을 모두 담도록 상한을 500으로 올린다(정렬·필터·본문 발췌는 그대로).
-- max_rows 도 500 으로 맞춰 화면(teacherApi)의 응답 검증과 어긋나지 않게 한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_share_candidates_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_limit INTEGER DEFAULT 500
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 500), 1), 500);
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
    RETURN jsonb_build_object('version', 1, 'max_rows', 500, 'items', v_items);
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

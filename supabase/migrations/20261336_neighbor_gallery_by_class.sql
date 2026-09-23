-- 모두의 아지트: 글 나눔 공간을 반별로 (2026-09-23, 선생님 결정)
--
-- 글이 30편을 넘으면 최신순 카드 한 줄로는 찾기 어렵다. 학생은 "어느 반 글을 볼까요?" 에서 반을 고르고
-- 그 반 글을 **주제별 묶음**으로 본다. 교사 "③ 댓글·반응" 도 같은 반별 구조로 본다.
--
--   · 반은 원본 학급 id 대신 참여 행 id(neighbor_space_classes.id)를 열쇠로 쓴다 — 원본 학생·학급·글 id 는
--     브라우저에 내보내지 않는다는 규칙 그대로.
--   · "새 글" 은 **지난 방문 뒤** 올라온 글. 피드를 열 때마다 last_seen_at 이 바뀌므로, 바뀌기 직전 값을
--     previous_seen_at 에 남겨 둔다(트리거). 첫 방문은 새 글 0 으로 본다(모두가 새 글이라 표시가 의미 없다).
--   · 한 반 글은 한 번에 최대 300편(요약만, 전문은 상세에서). 교사 쪽은 공간 전체 500편까지.
--     작업 공간의 public_posts 는 50편 상한이라 반별로 모아 보기에는 모자라 따로 읽는다.

BEGIN;

ALTER TABLE public.neighbor_feed_visits ADD COLUMN IF NOT EXISTS previous_seen_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.keep_neighbor_previous_visit_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.last_seen_at IS DISTINCT FROM OLD.last_seen_at THEN
        NEW.previous_seen_at := OLD.last_seen_at;
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.keep_neighbor_previous_visit_v1() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS trg_keep_neighbor_previous_visit ON public.neighbor_feed_visits;
CREATE TRIGGER trg_keep_neighbor_previous_visit
    BEFORE UPDATE ON public.neighbor_feed_visits
    FOR EACH ROW EXECUTE FUNCTION public.keep_neighbor_previous_visit_v1();

-- 학생: 반별 글 수·새 글 수(우리 반 먼저).
CREATE OR REPLACE FUNCTION public.get_neighbor_gallery_classes_v1(p_space_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_since TIMESTAMPTZ;
    v_classes JSONB;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    SELECT visit.previous_seen_at INTO v_since
    FROM public.neighbor_feed_visits visit
    WHERE visit.space_id = p_space_id AND visit.student_id = v_student_id;

    SELECT COALESCE(jsonb_agg(row_item ORDER BY is_own DESC, class_name), '[]'::JSONB) INTO v_classes
    FROM (
        SELECT membership.class_id = v_class_id AS is_own, membership.public_class_name AS class_name,
            jsonb_build_object(
                'class_key', membership.id,
                'class_name', membership.public_class_name,
                'is_own_class', membership.class_id = v_class_id,
                'post_count', count(shared.id),
                'new_count', CASE WHEN v_since IS NULL THEN 0
                    ELSE count(shared.id) FILTER (WHERE shared.published_at > v_since) END
            ) AS row_item
        FROM public.neighbor_space_classes membership
        LEFT JOIN public.neighbor_shared_posts shared
          ON shared.space_id = membership.space_id AND shared.class_id = membership.class_id
         AND shared.activity_id IS NULL AND shared.status = 'published'
         AND EXISTS (
            SELECT 1 FROM public.student_posts post
            WHERE post.id = shared.post_id AND post.class_id = shared.class_id AND post.student_id = shared.student_id
              AND public.neighbor_source_is_shareable_v1(post)
         )
        WHERE membership.space_id = p_space_id AND membership.status = 'active'
        GROUP BY membership.id, membership.class_id, membership.public_class_name
    ) classes;
    RETURN jsonb_build_object('version', 1, 'classes', v_classes);
END;
$$;

-- 학생: 한 반의 글 나눔 글(요약, 주제 이름 포함). 화면이 주제별로 묶는다.
CREATE OR REPLACE FUNCTION public.get_neighbor_class_gallery_v1(p_space_id UUID, p_class_key UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_membership public.neighbor_space_classes%ROWTYPE;
    v_items JSONB;
    v_total INTEGER;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    SELECT membership.* INTO v_membership FROM public.neighbor_space_classes membership
    WHERE membership.id = p_class_key AND membership.space_id = p_space_id AND membership.status = 'active';
    IF v_membership.id IS NULL THEN
        RAISE EXCEPTION '지금 참여 중인 반이 아니에요.' USING ERRCODE = '42501';
    END IF;

    WITH posts AS MATERIALIZED (
        SELECT shared.id, shared.published_at, shared.public_author_name, post.title,
            left(regexp_replace(COALESCE(post.content, ''), E'[\\s\\n\\r]+', ' ', 'g'), 180) AS excerpt,
            COALESCE(mission.title, '자율 글') AS topic,
            shared.student_id = v_student_id AS is_mine
        FROM public.neighbor_shared_posts shared
        JOIN public.student_posts post
          ON post.id = shared.post_id AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id AND public.neighbor_source_is_shareable_v1(post)
        LEFT JOIN public.writing_missions mission ON mission.id = post.mission_id AND mission.class_id = post.class_id
        WHERE shared.space_id = p_space_id AND shared.class_id = v_membership.class_id
          AND shared.activity_id IS NULL AND shared.status = 'published'
    )
    SELECT (SELECT count(*)::INTEGER FROM posts),
        COALESCE(jsonb_agg(jsonb_build_object(
            'shared_post_id', page.id, 'title', page.title, 'excerpt', page.excerpt,
            'author_name', page.public_author_name, 'class_name', v_membership.public_class_name,
            'topic', page.topic, 'published_at', page.published_at, 'is_mine', page.is_mine,
            'comment_count', (SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                WHERE comment.shared_post_id = page.id AND comment.status = 'visible'),
            'reaction_count', (SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                WHERE reaction.shared_post_id = page.id)
        ) ORDER BY page.published_at DESC, page.id DESC), '[]'::JSONB)
    INTO v_total, v_items
    FROM (SELECT * FROM posts ORDER BY published_at DESC, id DESC LIMIT 300) page;

    RETURN jsonb_build_object('version', 1, 'class_key', v_membership.id, 'class_name', v_membership.public_class_name,
        'is_own_class', v_membership.class_id = v_class_id, 'total', COALESCE(v_total, 0), 'max_rows', 300,
        'items', v_items);
END;
$$;

-- 교사: 공간의 공개 글을 반별로(글 나눔 = gallery, 함께 쓰는 주제 = topic). 댓글·공감 수와 주제 이름 포함.
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_engagement_v1(p_space_id UUID, p_actor_class_id UUID, p_kind TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_classes JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF p_kind NOT IN ('gallery', 'topic') THEN
        RAISE EXCEPTION '보기 종류가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    WITH posts AS MATERIALIZED (
        SELECT shared.id, shared.class_id, shared.published_at, shared.public_author_name, post.title,
            COALESCE(activity.title, mission.title, '자율 글') AS topic
        FROM public.neighbor_shared_posts shared
        JOIN public.student_posts post
          ON post.id = shared.post_id AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id AND public.neighbor_source_is_shareable_v1(post)
        LEFT JOIN public.writing_missions mission ON mission.id = post.mission_id AND mission.class_id = post.class_id
        LEFT JOIN public.neighbor_activities activity ON activity.id = shared.activity_id
        WHERE shared.space_id = p_space_id AND shared.status = 'published'
          AND ((p_kind = 'gallery' AND shared.activity_id IS NULL) OR (p_kind = 'topic' AND shared.activity_id IS NOT NULL))
        ORDER BY shared.published_at DESC, shared.id DESC
        LIMIT 500
    ), counted AS (
        SELECT posts.*,
            (SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                WHERE comment.shared_post_id = posts.id AND comment.status = 'visible') AS comment_count,
            (SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                WHERE reaction.shared_post_id = posts.id) AS reaction_count
        FROM posts
    )
    SELECT COALESCE(jsonb_agg(class_row ORDER BY is_own DESC, class_name), '[]'::JSONB) INTO v_classes
    FROM (
        SELECT membership.class_id = p_actor_class_id AS is_own, membership.public_class_name AS class_name,
            jsonb_build_object(
                'class_key', membership.id,
                'class_name', membership.public_class_name,
                'is_own_class', membership.class_id = p_actor_class_id,
                'post_count', count(counted.id),
                'comment_total', COALESCE(sum(counted.comment_count), 0),
                'reaction_total', COALESCE(sum(counted.reaction_count), 0),
                'posts', COALESCE(jsonb_agg(jsonb_build_object(
                    'shared_post_id', counted.id, 'title', counted.title, 'author_name', counted.public_author_name,
                    'class_name', membership.public_class_name, 'topic', counted.topic, 'published_at', counted.published_at,
                    'comment_count', counted.comment_count, 'reaction_count', counted.reaction_count
                ) ORDER BY counted.published_at DESC) FILTER (WHERE counted.id IS NOT NULL), '[]'::JSONB)
            ) AS class_row
        FROM public.neighbor_space_classes membership
        LEFT JOIN counted ON counted.class_id = membership.class_id
        WHERE membership.space_id = p_space_id AND membership.status = 'active'
        GROUP BY membership.id, membership.class_id, membership.public_class_name
    ) classes;
    RETURN jsonb_build_object('version', 1, 'kind', p_kind, 'classes', v_classes);
END;
$$;

REVOKE ALL ON FUNCTION public.get_neighbor_gallery_classes_v1(UUID) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_class_gallery_v1(UUID, UUID) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_engagement_v1(UUID, UUID, TEXT) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_neighbor_gallery_classes_v1(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_class_gallery_v1(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_engagement_v1(UUID, UUID, TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 이웃 글 공개 원본 검증·검토 전문·대기열·호스트 글짝 조건 보완.
-- 적용된 SQL은 다시 쓰지 않으며 모든 보정은 동일 트랜잭션에서 수행한다.
-- Business revision/source conflicts use PT409. PostgREST 14 retries 40001 indefinitely.
BEGIN;

CREATE OR REPLACE FUNCTION public.neighbor_source_is_shareable_v1(p_post public.student_posts)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT p_post.is_submitted IS TRUE AND p_post.recalled_at IS NULL
      AND (p_post.writing_context IS DISTINCT FROM 'self' OR p_post.visibility = 'class');
$$;
REVOKE ALL ON FUNCTION public.neighbor_source_is_shareable_v1(public.student_posts) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.neighbor_source_revision_v1(p_post public.student_posts)
RETURNS TEXT LANGUAGE sql IMMUTABLE SET search_path = public AS $$
    SELECT encode(extensions.digest(jsonb_build_array(
        p_post.id, p_post.updated_at, p_post.title, p_post.content, p_post.structured_content,
        p_post.teacher_edited_title, p_post.teacher_edited_content, p_post.show_original,
        p_post.visibility, p_post.writing_context, p_post.is_submitted, p_post.recalled_at
    )::TEXT, 'sha256'), 'hex');
$$;
REVOKE ALL ON FUNCTION public.neighbor_source_revision_v1(public.student_posts) FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.guard_neighbor_shared_post_source_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'pending' AND NOT EXISTS (
        SELECT 1 FROM public.student_posts post WHERE post.id = NEW.post_id
          AND post.class_id = NEW.class_id AND post.student_id = NEW.student_id
          AND public.neighbor_source_is_shareable_v1(post)
    ) THEN
        RAISE EXCEPTION '비공개 또는 제출 취소한 글은 이웃에게 공유할 수 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'published' AND NOT EXISTS (
        SELECT 1
        FROM public.student_posts post
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = NEW.space_id
         AND membership.class_id = NEW.class_id
         AND membership.status = 'active'
        JOIN public.neighbor_spaces space
          ON space.id = membership.space_id
         AND space.status = 'active'
        WHERE post.id = NEW.post_id
          AND post.class_id = NEW.class_id
          AND post.student_id = NEW.student_id
          AND public.neighbor_source_is_shareable_v1(post)
    ) THEN
        RAISE EXCEPTION 'Only a current submitted source post can be published' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_neighbor_shared_post_source_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF public.neighbor_source_is_shareable_v1(NEW) IS NOT TRUE THEN
        UPDATE public.neighbor_shared_posts shared
        SET status = 'recalled',
            reviewed_at = NULL,
            reviewed_by = NULL,
            review_note = '',
            published_at = NULL,
            hidden_at = NULL,
            hidden_by = NULL,
            hidden_by_class_id = NULL,
            hidden_reason = ''
        WHERE shared.post_id = NEW.id
          AND shared.class_id = NEW.class_id
          AND shared.student_id = NEW.student_id
          AND shared.status <> 'recalled';
    ELSIF OLD.title IS DISTINCT FROM NEW.title
       OR OLD.content IS DISTINCT FROM NEW.content
       OR OLD.structured_content IS DISTINCT FROM NEW.structured_content
       OR OLD.teacher_edited_title IS DISTINCT FROM NEW.teacher_edited_title
       OR OLD.teacher_edited_content IS DISTINCT FROM NEW.teacher_edited_content
       OR OLD.show_original IS DISTINCT FROM NEW.show_original THEN
        UPDATE public.neighbor_shared_posts shared
        SET status = 'pending',
            requested_at = NOW(),
            reviewed_at = NULL,
            reviewed_by = NULL,
            review_note = '',
            published_at = NULL,
            hidden_at = NULL,
            hidden_by = NULL,
            hidden_by_class_id = NULL,
            hidden_reason = ''
        WHERE shared.post_id = NEW.id
          AND shared.class_id = NEW.class_id
          AND shared.student_id = NEW.student_id
          AND shared.status IN ('published', 'hidden');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS neighbor_shared_posts_source_sync ON public.student_posts;
CREATE TRIGGER neighbor_shared_posts_source_sync
AFTER UPDATE OF is_submitted, recalled_at, title, content, structured_content,
    teacher_edited_title, teacher_edited_content, show_original, visibility, writing_context
ON public.student_posts FOR EACH ROW EXECUTE FUNCTION public.sync_neighbor_shared_post_source_v1();

UPDATE public.neighbor_shared_posts shared SET status = 'recalled', reviewed_at = NULL,
    reviewed_by = NULL, review_note = '', published_at = NULL, hidden_at = NULL,
    hidden_by = NULL, hidden_by_class_id = NULL, hidden_reason = ''
FROM public.student_posts post WHERE post.id = shared.post_id AND post.class_id = shared.class_id
    AND post.student_id = shared.student_id AND shared.status <> 'recalled'
    AND public.neighbor_source_is_shareable_v1(post) IS NOT TRUE;


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
                'excerpt', left(regexp_replace(COALESCE(post.content, ''), E'[\\s\\n\\r]+', ' ', 'g'), 180),
                'updated_at', post.updated_at,
                'shared_post_id', shared.id,
                'share_status', shared.status,
                'review_note', shared.review_note
            ) AS item
        FROM public.student_posts post
        JOIN public.students student
          ON student.id = post.student_id AND student.class_id = post.class_id
         AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
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

CREATE OR REPLACE FUNCTION public.publish_neighbor_class_post_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_student_id UUID;
    v_student_name TEXT;
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    v_actor := public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT post.student_id, left(btrim(student.name), 30)
    INTO v_student_id, v_student_name
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id AND student.class_id = post.class_id
     AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
    WHERE post.id = p_post_id
      AND post.class_id = p_actor_class_id
      AND public.neighbor_source_is_shareable_v1(post)
      AND NOT EXISTS (
          SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id
      );
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '글 나눔 공간에 올릴 수 있는 자기 학급 제출 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    WHERE shared.space_id = p_space_id AND shared.post_id = p_post_id
    FOR UPDATE;
    IF FOUND AND v_shared.status = 'hidden' THEN
        RAISE EXCEPTION '숨김 처리된 글은 복원한 뒤 다시 공유할 수 있습니다.' USING ERRCODE = '55000';
    ELSIF FOUND AND v_shared.status = 'published' THEN
        RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
    ELSIF FOUND THEN
        UPDATE public.neighbor_shared_posts
        SET activity_id = NULL, public_author_name = v_student_name, status = 'published',
            requested_at = NOW(), reviewed_at = NOW(), reviewed_by = v_user_id,
            review_note = '', published_at = NOW(), hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_shared.id RETURNING * INTO v_shared;
    ELSE
        INSERT INTO public.neighbor_shared_posts (
            space_id, class_id, post_id, student_id, public_author_name, activity_id,
            status, reviewed_at, reviewed_by, published_at
        ) VALUES (
            p_space_id, p_actor_class_id, p_post_id, v_student_id, v_student_name, NULL,
            'published', NOW(), v_user_id, NOW()
        ) RETURNING * INTO v_shared;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, p_actor_class_id, v_user_id, v_actor,
        'post_published_by_teacher', 'post', v_shared.id
    );
    RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.request_neighbor_post_share_v1(
    p_space_id UUID,
    p_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_student_id UUID;
    v_class_id UUID;
    v_student_name TEXT;
    v_shared public.neighbor_shared_posts%ROWTYPE;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT left(btrim(student.name), 30) INTO v_student_name
    FROM public.student_posts post
    JOIN public.students student ON student.id = post.student_id AND student.class_id = post.class_id
    WHERE post.id = p_post_id
      AND post.student_id = v_student_id
      AND post.class_id = v_class_id
      AND public.neighbor_source_is_shareable_v1(post)
      AND NOT EXISTS (
          SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id
      );
    IF v_student_name IS NULL THEN
        RAISE EXCEPTION '전시할 수 있는 본인 제출 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    WHERE shared.space_id = p_space_id AND shared.post_id = p_post_id
    FOR UPDATE;
    IF FOUND AND v_shared.status = 'hidden' THEN
        RAISE EXCEPTION '숨김 처리된 글은 교사 확인 전 다시 신청할 수 없습니다.' USING ERRCODE = '55000';
    ELSIF FOUND AND v_shared.status IN ('pending', 'published') THEN
        RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
    ELSIF FOUND THEN
        UPDATE public.neighbor_shared_posts
        SET activity_id = NULL, public_author_name = v_student_name, status = 'pending',
            requested_at = NOW(), reviewed_at = NULL, reviewed_by = NULL, review_note = '',
            published_at = NULL, hidden_at = NULL, hidden_by = NULL,
            hidden_by_class_id = NULL, hidden_reason = ''
        WHERE id = v_shared.id RETURNING * INTO v_shared;
    ELSE
        INSERT INTO public.neighbor_shared_posts (
            space_id, class_id, post_id, student_id, public_author_name, activity_id
        ) VALUES (p_space_id, v_class_id, p_post_id, v_student_id, v_student_name, NULL)
        RETURNING * INTO v_shared;
    END IF;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (p_space_id, v_class_id, v_user_id, 'student', 'post_requested', 'post', v_shared.id);
    RETURN jsonb_build_object('success', TRUE, 'shared_post_id', v_shared.id, 'status', v_shared.status);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_my_share_candidates_v1(
    p_space_id UUID,
    p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50);
    v_items JSONB := '[]'::JSONB;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    SELECT COALESCE(jsonb_agg(post_row.item ORDER BY post_row.updated_at DESC, post_row.post_id DESC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT post.id AS post_id, post.updated_at,
            jsonb_build_object(
                'post_id', post.id, 'title', post.title, 'updated_at', post.updated_at,
                'shared_post_id', shared.id, 'share_status', shared.status, 'review_note', shared.review_note
            ) AS item
        FROM public.student_posts post
        LEFT JOIN public.neighbor_shared_posts shared
          ON shared.space_id = p_space_id AND shared.post_id = post.id
         AND shared.class_id = post.class_id AND shared.student_id = post.student_id
        WHERE post.class_id = v_class_id
          AND post.student_id = v_student_id
          AND public.neighbor_source_is_shareable_v1(post)
          AND NOT EXISTS (
              SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id
          )
        ORDER BY post.updated_at DESC, post.id DESC
        LIMIT v_limit
    ) post_row;
    RETURN jsonb_build_object('version', 1, 'max_rows', 50, 'items', v_items);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_space_feed_v1(
    p_space_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_cursor_at TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_items JSONB := '[]'::JSONB;
    v_activities JSONB := '[]'::JSONB;
    v_has_more BOOLEAN := FALSE;
    v_next_at TIMESTAMPTZ;
    v_next_id UUID;
    v_space_name TEXT;
    v_active_class_count INTEGER;
BEGIN
    IF (p_cursor_at IS NULL) IS DISTINCT FROM (p_cursor_id IS NULL) THEN
        RAISE EXCEPTION '페이지 커서는 시각과 글 ID를 함께 보내야 합니다.' USING ERRCODE = '22023';
    END IF;
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    SELECT space.name, count(membership.id)::INTEGER
    INTO v_space_name, v_active_class_count
    FROM public.neighbor_spaces space
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = space.id AND membership.status = 'active'
    WHERE space.id = p_space_id AND space.status = 'active'
    GROUP BY space.id, space.name;

    WITH candidates AS MATERIALIZED (
        SELECT shared.id, shared.published_at, shared.public_author_name,
            membership.public_class_name, post.title,
            left(regexp_replace(COALESCE(post.content, ''), E'[\\s\\n\\r]+', ' ', 'g'), 180) AS excerpt,
            post.writing_context, post.self_writing_type,
            shared.student_id = v_student_id AS is_mine,
            (SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                WHERE comment.shared_post_id = shared.id AND comment.status = 'visible') AS comment_count,
            (SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                WHERE reaction.shared_post_id = shared.id) AS reaction_count,
            EXISTS (SELECT 1 FROM public.neighbor_reactions mine
                WHERE mine.shared_post_id = shared.id AND mine.student_id = v_student_id) AS my_reaction,
            EXISTS (SELECT 1 FROM public.neighbor_saves saved
                WHERE saved.shared_post_id = shared.id AND saved.student_id = v_student_id) AS my_saved
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id
         AND membership.class_id = shared.class_id AND membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id AND public.neighbor_source_is_shareable_v1(post)
        WHERE shared.space_id = p_space_id
          AND shared.activity_id IS NULL
          AND shared.status = 'published'
          AND (p_cursor_at IS NULL OR (shared.published_at, shared.id) < (p_cursor_at, p_cursor_id))
        ORDER BY shared.published_at DESC, shared.id DESC
        LIMIT v_limit + 1
    ), page AS (
        SELECT * FROM candidates ORDER BY published_at DESC, id DESC LIMIT v_limit
    ), serialized AS (
        SELECT page.published_at, page.id, jsonb_build_object(
            'shared_post_id', page.id, 'title', page.title, 'excerpt', page.excerpt,
            'author_name', page.public_author_name, 'class_name', page.public_class_name,
            'published_at', page.published_at, 'writing_context', page.writing_context,
            'self_writing_type', page.self_writing_type, 'is_mine', page.is_mine,
            'comment_count', page.comment_count, 'reaction_count', page.reaction_count,
            'my_reaction', page.my_reaction, 'my_saved', page.my_saved
        ) AS item FROM page
    )
    SELECT COALESCE(jsonb_agg(serialized.item ORDER BY serialized.published_at DESC, serialized.id DESC), '[]'::JSONB),
        (SELECT count(*) > v_limit FROM candidates),
        (SELECT page.published_at FROM page ORDER BY page.published_at, page.id LIMIT 1),
        (SELECT page.id FROM page ORDER BY page.published_at, page.id LIMIT 1)
    INTO v_items, v_has_more, v_next_at, v_next_id FROM serialized;

    v_activities := public.get_neighbor_student_activities_v1(p_space_id, v_student_id, v_class_id);
    INSERT INTO public.neighbor_feed_visits (space_id, class_id, student_id, last_seen_at)
    VALUES (p_space_id, v_class_id, v_student_id, NOW())
    ON CONFLICT (space_id, student_id) DO UPDATE
    SET class_id = EXCLUDED.class_id, last_seen_at = EXCLUDED.last_seen_at;

    RETURN jsonb_build_object(
        'version', 1,
        'space', jsonb_build_object('id', p_space_id, 'name', v_space_name,
            'active_class_count', COALESCE(v_active_class_count, 0)),
        'activities', v_activities,
        'items', COALESCE(v_items, '[]'::JSONB),
        'has_more', COALESCE(v_has_more, FALSE),
        'next_cursor_at', CASE WHEN v_has_more THEN v_next_at ELSE NULL END,
        'next_cursor_id', CASE WHEN v_has_more THEN v_next_id ELSE NULL END,
        'max_rows', 50
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_activity_feed_v1(
    p_space_id UUID,
    p_activity_id UUID,
    p_limit INTEGER DEFAULT 20,
    p_cursor_at TIMESTAMPTZ DEFAULT NULL,
    p_cursor_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_activity public.neighbor_activities%ROWTYPE;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
    v_items JSONB := '[]'::JSONB;
    v_has_more BOOLEAN := FALSE;
    v_next_at TIMESTAMPTZ;
    v_next_id UUID;
BEGIN
    IF (p_cursor_at IS NULL) IS DISTINCT FROM (p_cursor_id IS NULL) THEN
        RAISE EXCEPTION '페이지 커서는 시각과 글 ID를 함께 보내야 합니다.' USING ERRCODE = '22023';
    END IF;
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;
    SELECT activity.* INTO v_activity
    FROM public.neighbor_activities activity
    JOIN public.neighbor_activity_classes link
      ON link.activity_id = activity.id AND link.class_id = v_class_id
    WHERE activity.id = p_activity_id AND activity.space_id = p_space_id;
    IF v_activity.id IS NULL THEN
        RAISE EXCEPTION '참여 중인 이웃 활동이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_activity_approvals approval
        WHERE approval.activity_id = p_activity_id AND approval.status <> 'approved'
    ) THEN
        RAISE EXCEPTION '교사 승인이 끝난 뒤 학생에게 공개됩니다.' USING ERRCODE = '42501';
    END IF;
    IF v_activity.activity_type = 'exchange'
       AND (v_activity.status NOT IN ('matched', 'closed')
         OR v_activity.matched_at IS NULL
         OR NOT EXISTS (
           SELECT 1 FROM public.neighbor_exchange_matches match
           WHERE match.activity_id = p_activity_id AND match.student_id = v_student_id
       )) THEN
        RAISE EXCEPTION '글짝 매칭 승인이 끝난 뒤 학생에게 공개됩니다.' USING ERRCODE = '42501';
    END IF;

    WITH candidates AS MATERIALIZED (
        SELECT shared.id, shared.published_at, shared.public_author_name,
            membership.public_class_name, post.title,
            left(regexp_replace(COALESCE(post.content, ''), E'[\\s\\n\\r]+', ' ', 'g'), 180) AS excerpt,
            post.writing_context, post.self_writing_type,
            shared.student_id = v_student_id AS is_mine,
            (SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                WHERE comment.shared_post_id = shared.id AND comment.status = 'visible') AS comment_count,
            (SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                WHERE reaction.shared_post_id = shared.id) AS reaction_count,
            EXISTS (SELECT 1 FROM public.neighbor_reactions mine
                WHERE mine.shared_post_id = shared.id AND mine.student_id = v_student_id) AS my_reaction,
            EXISTS (SELECT 1 FROM public.neighbor_saves saved
                WHERE saved.shared_post_id = shared.id AND saved.student_id = v_student_id) AS my_saved
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id
         AND membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id AND public.neighbor_source_is_shareable_v1(post)
        WHERE shared.space_id = p_space_id
          AND shared.activity_id = p_activity_id
          AND shared.status = 'published'
          AND (
              v_activity.activity_type = 'topic'
              OR v_activity.exchange_share_scope = 'space'
              OR shared.student_id = v_student_id
              OR EXISTS (
                  SELECT 1 FROM public.neighbor_exchange_matches match
                  WHERE match.activity_id = p_activity_id
                    AND match.student_id = v_student_id
                    AND match.partner_student_id = shared.student_id
              )
          )
          AND (p_cursor_at IS NULL OR (shared.published_at, shared.id) < (p_cursor_at, p_cursor_id))
        ORDER BY shared.published_at DESC, shared.id DESC
        LIMIT v_limit + 1
    ), page AS (
        SELECT * FROM candidates ORDER BY published_at DESC, id DESC LIMIT v_limit
    ), serialized AS (
        SELECT page.published_at, page.id, jsonb_build_object(
            'shared_post_id', page.id, 'activity_id', p_activity_id,
            'title', page.title, 'excerpt', page.excerpt,
            'author_name', page.public_author_name, 'class_name', page.public_class_name,
            'published_at', page.published_at, 'writing_context', page.writing_context,
            'self_writing_type', page.self_writing_type, 'is_mine', page.is_mine,
            'comment_count', page.comment_count, 'reaction_count', page.reaction_count,
            'my_reaction', page.my_reaction, 'my_saved', page.my_saved
        ) AS item FROM page
    )
    SELECT COALESCE(jsonb_agg(serialized.item ORDER BY serialized.published_at DESC, serialized.id DESC), '[]'::JSONB),
        (SELECT count(*) > v_limit FROM candidates),
        (SELECT page.published_at FROM page ORDER BY page.published_at, page.id LIMIT 1),
        (SELECT page.id FROM page ORDER BY page.published_at, page.id LIMIT 1)
    INTO v_items, v_has_more, v_next_at, v_next_id FROM serialized;

    RETURN jsonb_build_object(
        'version', 1,
        'activity', jsonb_build_object(
            'id', v_activity.id, 'type', v_activity.activity_type,
            'title', v_activity.title, 'prompt', v_activity.prompt,
            'status', v_activity.status, 'exchange_share_scope', v_activity.exchange_share_scope
        ),
        'items', v_items, 'has_more', COALESCE(v_has_more, FALSE),
        'next_cursor_at', CASE WHEN v_has_more THEN v_next_at ELSE NULL END,
        'next_cursor_id', CASE WHEN v_has_more THEN v_next_id ELSE NULL END,
        'max_rows', 50
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.assert_neighbor_student_post_access_v1(
    p_space_id UUID,
    p_shared_post_id UUID
)
RETURNS TABLE(requester_student_id UUID, requester_class_id UUID, owner_student_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_activity_type TEXT;
    v_share_scope TEXT;
BEGIN
    SELECT access.student_id, access.class_id INTO v_student_id, v_class_id
    FROM public.assert_neighbor_student_access_v1(p_space_id) access;

    SELECT shared.* INTO v_shared
    FROM public.neighbor_shared_posts shared
    JOIN public.student_posts post
      ON post.id = shared.post_id
     AND post.class_id = shared.class_id
     AND post.student_id = shared.student_id
     AND public.neighbor_source_is_shareable_v1(post)
    WHERE shared.id = p_shared_post_id
      AND shared.space_id = p_space_id
      AND shared.status = 'published';
    IF v_shared.id IS NULL THEN
        RAISE EXCEPTION '현재 공개 중인 이웃 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    SELECT activity.activity_type, activity.exchange_share_scope
    INTO v_activity_type, v_share_scope
    FROM public.neighbor_activities activity
    WHERE activity.id = v_shared.activity_id AND activity.space_id = p_space_id;

    IF v_shared.activity_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.neighbor_activity_classes link
        WHERE link.activity_id = v_shared.activity_id AND link.class_id = v_class_id
    ) THEN
        RAISE EXCEPTION '이 활동에 참여한 학급의 글이 아닙니다.' USING ERRCODE = '42501';
    ELSIF v_shared.activity_id IS NOT NULL AND v_activity_type = 'exchange'
      AND (
          NOT EXISTS (
              SELECT 1 FROM public.neighbor_activities activity
              WHERE activity.id = v_shared.activity_id
                AND activity.status IN ('matched', 'closed')
                AND activity.matched_at IS NOT NULL
          )
          OR (
              v_share_scope <> 'space'
              AND v_shared.student_id <> v_student_id
              AND NOT EXISTS (
                  SELECT 1 FROM public.neighbor_exchange_matches match
                  WHERE match.activity_id = v_shared.activity_id
                    AND match.student_id = v_student_id
                    AND match.partner_student_id = v_shared.student_id
              )
          )
      ) THEN
        RAISE EXCEPTION '승인된 글짝 활동에서 볼 수 있는 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY SELECT v_student_id, v_class_id, v_shared.student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_shared_post_v1(
    p_space_id UUID,
    p_shared_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_owner_student_id UUID;
    v_result JSONB;
    v_comments JSONB := '[]'::JSONB;
    v_comment_count INTEGER := 0;
    v_reaction_count INTEGER := 0;
    v_my_reaction BOOLEAN := FALSE;
    v_my_saved BOOLEAN := FALSE;
BEGIN
    SELECT access.requester_student_id, access.requester_class_id, access.owner_student_id
    INTO v_student_id, v_class_id, v_owner_student_id
    FROM public.assert_neighbor_student_post_access_v1(p_space_id, p_shared_post_id) access;

    SELECT jsonb_build_object(
        'version', 1, 'shared_post_id', shared.id, 'activity_id', shared.activity_id,
        'title', post.title, 'content', post.content, 'structured_content', post.structured_content,
        'writing_context', post.writing_context, 'self_writing_type', post.self_writing_type,
        'author_name', shared.public_author_name, 'class_name', membership.public_class_name,
        'published_at', shared.published_at, 'is_mine', shared.student_id = v_student_id
    ) INTO v_result
    FROM public.neighbor_shared_posts shared
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id
     AND membership.status = 'active'
    JOIN public.student_posts post
      ON post.id = shared.post_id AND post.class_id = shared.class_id
     AND post.student_id = shared.student_id AND public.neighbor_source_is_shareable_v1(post)
    WHERE shared.id = p_shared_post_id AND shared.space_id = p_space_id AND shared.status = 'published';
    IF v_result IS NULL THEN
        RAISE EXCEPTION '현재 공개 중인 이웃 글을 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*)::INTEGER INTO v_comment_count
    FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible';

    SELECT COALESCE(jsonb_agg(comment_row.item ORDER BY comment_row.created_at, comment_row.id), '[]'::JSONB)
    INTO v_comments
    FROM (
        SELECT comment.created_at, comment.id,
            jsonb_build_object(
                'comment_id', comment.id, 'content', comment.content,
                'author_name', left(btrim(comment_student.name), 30),
                'class_name', membership.public_class_name,
                'created_at', comment.created_at, 'updated_at', comment.updated_at,
                'is_mine', comment.student_id = v_student_id
            ) AS item
        FROM public.neighbor_comments comment
        JOIN public.students comment_student
          ON comment_student.id = comment.student_id AND comment_student.class_id = comment.class_id
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = comment.space_id AND membership.class_id = comment.class_id
         AND membership.status = 'active'
        WHERE comment.shared_post_id = p_shared_post_id AND comment.status = 'visible'
        ORDER BY comment.created_at DESC, comment.id DESC LIMIT 100
    ) comment_row;

    SELECT count(*)::INTEGER INTO v_reaction_count
    FROM public.neighbor_reactions reaction WHERE reaction.shared_post_id = p_shared_post_id;
    SELECT EXISTS (SELECT 1 FROM public.neighbor_reactions reaction
        WHERE reaction.shared_post_id = p_shared_post_id AND reaction.student_id = v_student_id),
        EXISTS (SELECT 1 FROM public.neighbor_saves saved
        WHERE saved.shared_post_id = p_shared_post_id AND saved.student_id = v_student_id)
    INTO v_my_reaction, v_my_saved;

    RETURN v_result || jsonb_build_object(
        'comments', v_comments, 'comment_count', v_comment_count,
        'comments_truncated', v_comment_count > 100, 'reaction_count', v_reaction_count,
        'my_reaction', v_my_reaction, 'my_saved', v_my_saved
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_workspace_core_20261237(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mode TEXT;
    v_class_name TEXT;
    v_module_enabled BOOLEAN := FALSE;
    v_membership public.neighbor_space_classes%ROWTYPE;
    v_space public.neighbor_spaces%ROWTYPE;
    v_memberships JSONB := '[]'::JSONB;
    v_review_posts JSONB := '[]'::JSONB;
    v_public_posts JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    SELECT rollout.mode INTO v_mode
    FROM public.neighbor_rollout_state rollout WHERE rollout.singleton;
    SELECT class.name,
           'neighbor-agit' = ANY(COALESCE(class.enabled_modules, ARRAY[]::TEXT[]))
    INTO v_class_name, v_module_enabled
    FROM public.classes class WHERE class.id = p_class_id;

    SELECT membership.* INTO v_membership
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.class_id = p_class_id
      AND membership.status IN ('pending', 'active')
      AND space.status IN ('active', 'paused')
    ORDER BY (membership.status = 'active') DESC, membership.updated_at DESC
    LIMIT 1;

    IF v_membership.id IS NULL THEN
        RETURN jsonb_build_object(
            'version', 1,
            'rollout_mode', v_mode,
            'class', jsonb_build_object(
                'id', p_class_id, 'name', v_class_name, 'module_enabled', v_module_enabled
            ),
            'space', NULL,
            'memberships', '[]'::JSONB,
            'review_posts', '[]'::JSONB,
            'public_posts', '[]'::JSONB
        );
    END IF;

    SELECT space.* INTO v_space
    FROM public.neighbor_spaces space WHERE space.id = v_membership.space_id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'class_id', membership.class_id,
        'class_name', membership.public_class_name,
        'role', membership.role,
        'status', membership.status,
        'student_access_enabled', membership.student_access_enabled,
        'requested_at', membership.requested_at,
        'joined_at', membership.joined_at,
        'matchable_student_count', (SELECT count(*) FROM public.students student
            WHERE student.class_id = membership.class_id AND student.auth_id IS NOT NULL
              AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL)
    ) ORDER BY membership.role, membership.requested_at, membership.class_id), '[]'::JSONB)
    INTO v_memberships
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = v_space.id
      AND membership.status IN ('pending', 'active');

    SELECT COALESCE(jsonb_agg(post_row.item ORDER BY post_row.requested_at ASC, post_row.shared_post_id ASC), '[]'::JSONB)
    INTO v_review_posts
    FROM (
        SELECT shared.id AS shared_post_id, shared.requested_at,
            jsonb_build_object(
                'shared_post_id', shared.id,
                'title', post.title,
                'excerpt', left(regexp_replace(COALESCE(post.content, ''), '[[:space:]]+', ' ', 'g'), 180),
                'student_name', student.name,
                'status', shared.status,
                'requested_at', shared.requested_at,
                'review_note', shared.review_note,
                'published_at', shared.published_at,
                'comment_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                    WHERE comment.shared_post_id = shared.id AND comment.status = 'visible'
                ),
                'reaction_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                    WHERE reaction.shared_post_id = shared.id
                )
            ) AS item
        FROM public.neighbor_shared_posts shared
        JOIN public.student_posts post
          ON post.id = shared.post_id
         AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id
        JOIN public.students student
          ON student.id = shared.student_id
         AND student.class_id = shared.class_id
        WHERE shared.space_id = v_space.id
          AND shared.class_id = p_class_id
          AND shared.status = 'pending' AND public.neighbor_source_is_shareable_v1(post)
        ORDER BY shared.requested_at ASC, shared.id ASC
        LIMIT 100
    ) post_row;

    SELECT COALESCE(jsonb_agg(post_row.item ORDER BY post_row.published_at DESC, post_row.shared_post_id DESC), '[]'::JSONB)
    INTO v_public_posts
    FROM (
        SELECT shared.id AS shared_post_id, shared.published_at,
            jsonb_build_object(
                'shared_post_id', shared.id,
                'title', post.title,
                'excerpt', left(regexp_replace(COALESCE(post.content, ''), '[[:space:]]+', ' ', 'g'), 180),
                'author_name', shared.public_author_name,
                'class_name', membership.public_class_name,
                'status', shared.status,
                'is_own_class', shared.class_id = p_class_id,
                'published_at', shared.published_at,
                'comment_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_comments comment
                    WHERE comment.shared_post_id = shared.id AND comment.status = 'visible'
                ),
                'reaction_count', (
                    SELECT count(*)::INTEGER FROM public.neighbor_reactions reaction
                    WHERE reaction.shared_post_id = shared.id
                )
            ) AS item
        FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = shared.space_id
         AND membership.class_id = shared.class_id
         AND membership.status = 'active'
        JOIN public.student_posts post
          ON post.id = shared.post_id
         AND post.class_id = shared.class_id
         AND post.student_id = shared.student_id
        WHERE shared.space_id = v_space.id
          AND shared.status IN ('published', 'hidden') AND public.neighbor_source_is_shareable_v1(post)
        ORDER BY shared.published_at DESC NULLS LAST, shared.id DESC
        LIMIT 50
    ) post_row;

    RETURN jsonb_build_object(
        'version', 1,
        'rollout_mode', v_mode,
        'class', jsonb_build_object(
            'id', p_class_id, 'name', v_class_name, 'module_enabled', v_module_enabled
        ),
        'space', jsonb_build_object(
            'id', v_space.id,
            'name', v_space.name,
            'description', v_space.public_description,
            'status', v_space.status,
            'host_class_id', v_space.host_class_id,
            'my_role', v_membership.role,
            'my_status', v_membership.status,
            'student_access_enabled', v_membership.student_access_enabled
        ),
        'memberships', v_memberships,
        'review_posts', v_review_posts,
        'review_total', (SELECT count(*) FROM public.neighbor_shared_posts shared
            JOIN public.student_posts post ON post.id = shared.post_id AND post.class_id = shared.class_id
            WHERE shared.space_id = v_space.id AND shared.class_id = p_class_id
              AND shared.status = 'pending' AND public.neighbor_source_is_shareable_v1(post)),
        'public_posts', v_public_posts
    );
END;
$$;

CREATE INDEX IF NOT EXISTS neighbor_shared_posts_pending_queue_idx
ON public.neighbor_shared_posts (class_id, space_id, requested_at, id) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_source_post_v1(
    p_space_id UUID, p_actor_class_id UUID, p_post_id UUID
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_result JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT jsonb_build_object('version', 1, 'post_id', post.id, 'title', post.title,
        'content', post.content, 'student_name', left(btrim(student.name), 30),
        'source_revision', public.neighbor_source_revision_v1(post)) INTO v_result
    FROM public.student_posts post JOIN public.students student
      ON student.id = post.student_id AND student.class_id = post.class_id
     AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
    WHERE post.id = p_post_id AND post.class_id = p_actor_class_id
      AND public.neighbor_source_is_shareable_v1(post)
      AND NOT EXISTS (SELECT 1 FROM public.neighbor_activity_classes link WHERE link.mission_id = post.mission_id);
    IF v_result IS NULL THEN
        RAISE EXCEPTION '공유할 수 있는 우리 학급 제출 글이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_source_post_v1(UUID, UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_source_post_v1(UUID, UUID, UUID) TO authenticated;


CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_post_detail_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_shared_post_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_result JSONB;
    v_comments JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT shared.* INTO v_shared FROM public.neighbor_shared_posts shared
    WHERE shared.id = p_shared_post_id AND shared.space_id = p_space_id
      AND (shared.status IN ('published', 'hidden') OR (shared.class_id = p_actor_class_id AND shared.status = 'pending'));
    IF v_shared.id IS NULL THEN
        RAISE EXCEPTION '확인할 수 있는 이웃 글이 아닙니다.' USING ERRCODE = '22023';
    END IF;
    SELECT jsonb_build_object(
        'version', 1, 'shared_post_id', shared.id, 'activity_id', shared.activity_id,
        'source_revision', public.neighbor_source_revision_v1(post), 'title', post.title, 'content', post.content, 'author_name', shared.public_author_name,
        'class_name', membership.public_class_name, 'status', shared.status,
        'is_own_class', shared.class_id = p_actor_class_id, 'published_at', shared.published_at
    ) INTO v_result
    FROM public.neighbor_shared_posts shared
    JOIN public.neighbor_space_classes membership
      ON membership.space_id = shared.space_id AND membership.class_id = shared.class_id
    JOIN public.student_posts post
      ON post.id = shared.post_id AND post.class_id = shared.class_id AND post.student_id = shared.student_id
    WHERE shared.id = p_shared_post_id AND public.neighbor_source_is_shareable_v1(post)
      AND membership.status = 'active'
      AND (shared.status IN ('published', 'hidden')
           OR (shared.class_id = p_actor_class_id AND shared.status = 'pending'));
    IF v_result IS NULL THEN RAISE EXCEPTION '공유할 수 없는 원글입니다.' USING ERRCODE = '42501'; END IF;

    SELECT COALESCE(jsonb_agg(comment_row.item ORDER BY comment_row.created_at, comment_row.comment_id), '[]'::JSONB)
    INTO v_comments
    FROM (
        SELECT comment.id AS comment_id, comment.created_at,
            jsonb_build_object(
                'comment_id', comment.id, 'content', comment.content, 'status', comment.status,
                'author_name', left(btrim(comment_student.name), 30),
                'class_name', membership.public_class_name,
                'is_own_class', comment.class_id = p_actor_class_id,
                'created_at', comment.created_at
            ) AS item
        FROM public.neighbor_comments comment
        JOIN public.students comment_student
          ON comment_student.id = comment.student_id AND comment_student.class_id = comment.class_id
        JOIN public.neighbor_space_classes membership
          ON membership.space_id = comment.space_id AND membership.class_id = comment.class_id
        WHERE comment.shared_post_id = p_shared_post_id
          AND (comment.status = 'visible' OR (comment.status = 'hidden' AND comment.class_id = p_actor_class_id))
        ORDER BY comment.created_at, comment.id LIMIT 100
    ) comment_row;
    RETURN v_result || jsonb_build_object('comments', v_comments);
END;
$$;

CREATE OR REPLACE FUNCTION public.run_neighbor_teacher_action_v1(
    p_class_id UUID,
    p_action TEXT,
    p_payload JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
    v_source public.student_posts%ROWTYPE;
    v_space_id UUID := NULLIF(p_payload->>'space_id', '')::UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    IF p_action IN ('publish_gallery_post', 'review_post') THEN
        PERFORM public.assert_neighbor_participating_teacher_v1(v_space_id, p_class_id);
        -- 원글 -> 공유 행 순서로 잠가 전문 확인 이후 수정과 공개를 직렬화한다.
        SELECT post.* INTO v_source FROM public.student_posts post
        WHERE post.class_id = p_class_id AND (
            (p_action = 'publish_gallery_post' AND post.id = NULLIF(p_payload->>'post_id', '')::UUID)
            OR (p_action = 'review_post' AND EXISTS (
                SELECT 1 FROM public.neighbor_shared_posts shared WHERE shared.post_id = post.id
                  AND shared.class_id = p_class_id AND shared.space_id = v_space_id
                  AND shared.id = NULLIF(p_payload->>'shared_post_id', '')::UUID
            ))
        ) FOR UPDATE;
        IF v_source.id IS NULL OR public.neighbor_source_is_shareable_v1(v_source) IS NOT TRUE THEN
            RAISE EXCEPTION '공유할 수 있는 우리 학급 제출 글이 아닙니다.' USING ERRCODE = '42501';
        END IF;
        IF p_payload->>'source_revision' IS DISTINCT FROM public.neighbor_source_revision_v1(v_source) THEN
            RAISE EXCEPTION '글이 변경되었습니다. 전문을 다시 열어 확인해 주세요.' USING ERRCODE = 'PT409';
        END IF;
        IF p_action = 'review_post' AND p_payload->>'decision' = 'return'
          AND char_length(btrim(COALESCE(p_payload->>'review_note', ''))) NOT BETWEEN 1 AND 240 THEN
            RAISE EXCEPTION '돌려보내는 이유를 1~240자로 적어 주세요.' USING ERRCODE = '22023';
        END IF;
    END IF;
    IF p_action = 'create_activity' THEN
        v_result := public.create_neighbor_activity_v1(
            v_space_id, p_class_id, p_payload->>'type', p_payload->>'title', p_payload->>'prompt',
            CASE WHEN jsonb_typeof(p_payload->'exchange_class_ids') = 'array' THEN
                ARRAY(SELECT jsonb_array_elements_text(p_payload->'exchange_class_ids')::UUID)
            ELSE NULL END,
            CASE WHEN p_payload->>'type' = 'exchange'
                THEN COALESCE(NULLIF(p_payload->>'exchange_share_scope', ''), 'partners')
                ELSE NULL END
        );
    ELSIF p_action = 'review_activity' THEN
        v_result := public.review_neighbor_activity_v1(
            v_space_id, p_class_id,
            NULLIF(p_payload->>'activity_id', '')::UUID,
            COALESCE((p_payload->>'approve')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'publish_gallery_post' THEN
        v_result := public.publish_neighbor_class_post_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'post_id', '')::UUID
        );
    ELSIF p_action = 'review_post' THEN
        v_result := public.review_neighbor_shared_post_v1(v_space_id,
            NULLIF(p_payload->>'shared_post_id', '')::UUID, p_payload->>'decision',
            COALESCE(p_payload->>'review_note', ''));
    ELSIF p_action = 'propose_exchange_matches' THEN
        v_result := public.propose_neighbor_exchange_matches_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'activity_id', '')::UUID,
            COALESCE(p_payload->'pairs', '[]'::JSONB)
        );
    ELSIF p_action = 'review_exchange_matches' THEN
        v_result := public.review_neighbor_exchange_matches_v1(
            v_space_id, p_class_id, NULLIF(p_payload->>'activity_id', '')::UUID,
            COALESCE((p_payload->>'approve')::BOOLEAN, FALSE)
        );
    ELSIF p_action = 'match_exchange' THEN
        RAISE EXCEPTION '학생별 매칭안을 만든 뒤 상대 교사의 승인을 받아 주세요.' USING ERRCODE = '55000';
    ELSE
        RETURN public.run_neighbor_teacher_action_core_20261238(p_class_id, p_action, p_payload);
    END IF;

    RETURN jsonb_build_object(
        'success', TRUE,
        'action_result', v_result,
        'workspace', public.get_neighbor_teacher_workspace_v1(p_class_id)
    );
END;
$$;

-- 검토는 위 단일 진입점에서 원글 버전을 확인한다. 기존 함수는 내부 호출만 유지한다.
REVOKE ALL ON FUNCTION public.review_neighbor_shared_post_v1(UUID, UUID, TEXT, TEXT)
FROM PUBLIC, anon, authenticated, service_role;


CREATE OR REPLACE FUNCTION public.create_neighbor_activity_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_type TEXT,
    p_title TEXT,
    p_prompt TEXT,
    p_exchange_class_ids UUID[] DEFAULT NULL,
    p_exchange_share_scope TEXT DEFAULT 'partners'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_activity public.neighbor_activities%ROWTYPE;
    v_class_id UUID;
    v_mission_id UUID;
    v_class_ids UUID[];
    v_min_students INTEGER;
    v_max_students INTEGER;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_spaces space
        WHERE space.id = p_space_id AND space.status = 'active'
    ) THEN
        RAISE EXCEPTION '현재 활동을 제안할 수 있는 이웃 공간이 아닙니다.' USING ERRCODE = '55000';
    END IF;
    IF p_activity_type NOT IN ('topic', 'exchange') THEN
        RAISE EXCEPTION '지원하지 않는 이웃 활동입니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 80
       OR char_length(btrim(COALESCE(p_prompt, ''))) NOT BETWEEN 1 AND 1000 THEN
        RAISE EXCEPTION '활동 제목과 글쓰기 안내를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    IF p_activity_type = 'exchange' THEN
        IF p_exchange_share_scope NOT IN ('partners', 'space') THEN
            RAISE EXCEPTION '글짝 글 공개 범위를 확인해 주세요.' USING ERRCODE = '22023';
        END IF;
        IF COALESCE(cardinality(p_exchange_class_ids), 0) <> 2
           OR array_position(p_exchange_class_ids, NULL) IS NOT NULL
           OR p_exchange_class_ids[1] = p_exchange_class_ids[2]
           OR NOT (p_actor_class_id = ANY(p_exchange_class_ids)) THEN
            RAISE EXCEPTION '글짝 교환 활동은 우리 학급을 포함한 서로 다른 두 학급을 골라야 합니다.' USING ERRCODE = '22023';
        END IF;
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id
          AND membership.status = 'active'
          AND membership.class_id = ANY(p_exchange_class_ids);
        IF COALESCE(cardinality(v_class_ids), 0) <> 2 THEN
            RAISE EXCEPTION '현재 참여 중인 두 학급만 글짝 교환 활동에 넣을 수 있습니다.' USING ERRCODE = '42501';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM public.neighbor_spaces space
            WHERE space.id = p_space_id AND space.host_class_id = ANY(v_class_ids)) THEN
            RAISE EXCEPTION '글짝 교환 활동에는 호스트 학급이 포함되어야 합니다.' USING ERRCODE = '22023';
        END IF;
        SELECT min(student_count), max(student_count) INTO v_min_students, v_max_students
        FROM (SELECT count(student.id)::INTEGER student_count FROM unnest(v_class_ids) selected(class_id)
            LEFT JOIN public.students student ON student.class_id = selected.class_id
              AND student.auth_id IS NOT NULL AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
            GROUP BY selected.class_id) counts;
        IF v_min_students < 1 OR v_max_students > 100 OR v_max_students > v_min_students * 2 THEN
            RAISE EXCEPTION '두 학급 모두 로그인 가능한 학생이 1~100명이고 인원 차이가 두 배 이내여야 합니다.' USING ERRCODE = '22023';
        END IF;
    ELSE
        p_exchange_share_scope := NULL;
        SELECT array_agg(membership.class_id ORDER BY membership.class_id)
        INTO v_class_ids
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = p_space_id AND membership.status = 'active';
        IF COALESCE(cardinality(v_class_ids), 0) < 2 THEN
            RAISE EXCEPTION '두 학급 이상 참여한 뒤 함께 쓰는 주제를 제안할 수 있습니다.' USING ERRCODE = '55000';
        END IF;
    END IF;

    INSERT INTO public.neighbor_activities (
        space_id, activity_type, title, prompt, status, created_by, exchange_share_scope
    ) VALUES (
        p_space_id, p_activity_type, btrim(p_title), btrim(p_prompt),
        'pending_approval', v_user_id, p_exchange_share_scope
    ) RETURNING * INTO v_activity;

    FOREACH v_class_id IN ARRAY v_class_ids LOOP
        INSERT INTO public.writing_missions (
            class_id, teacher_id, title, guide, genre, mission_type,
            min_chars, min_paragraphs, base_reward, bonus_threshold,
            bonus_reward, allow_comments, guide_questions, tags, is_archived
        )
        SELECT
            class.id, class.teacher_id, btrim(p_title), btrim(p_prompt), '글쓰기', '글쓰기',
            50, 1, 0, 0, 0, FALSE, '[]'::JSONB,
            jsonb_build_array('이웃 아지트', CASE WHEN p_activity_type = 'topic' THEN '함께 쓰는 주제' ELSE '글짝 교환 활동' END),
            TRUE
        FROM public.classes class
        WHERE class.id = v_class_id AND class.deleted_at IS NULL
        RETURNING id INTO v_mission_id;

        IF v_mission_id IS NULL THEN
            RAISE EXCEPTION '참여 학급 글쓰기 과제를 만들 수 없습니다.' USING ERRCODE = '55000';
        END IF;
        INSERT INTO public.neighbor_activity_classes (activity_id, space_id, class_id, mission_id)
        VALUES (v_activity.id, p_space_id, v_class_id, v_mission_id);
        INSERT INTO public.neighbor_activity_approvals (
            activity_id, space_id, class_id, status, is_proposer, decided_by, decided_at
        ) VALUES (
            v_activity.id, p_space_id, v_class_id,
            CASE WHEN v_class_id = p_actor_class_id THEN 'approved' ELSE 'pending' END,
            v_class_id = p_actor_class_id,
            CASE WHEN v_class_id = p_actor_class_id THEN v_user_id ELSE NULL END,
            CASE WHEN v_class_id = p_actor_class_id THEN NOW() ELSE NULL END
        );
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE, 'activity_id', v_activity.id,
        'activity_type', v_activity.activity_type, 'status', v_activity.status,
        'exchange_share_scope', v_activity.exchange_share_scope,
        'class_count', cardinality(v_class_ids),
        'pending_approval_count', cardinality(v_class_ids) - 1
    );
EXCEPTION
    WHEN unique_violation THEN
        RAISE EXCEPTION '같은 종류의 제안 또는 진행 중인 활동을 먼저 마쳐 주세요.' USING ERRCODE = '55000';
END;
$$;

-- 일반 과제 관리에서 승인/매칭 전 과제를 열거나 공동 안내를 단독 변경하지 못한다.
CREATE OR REPLACE FUNCTION public.guard_neighbor_activity_mission_v1()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_activity public.neighbor_activities%ROWTYPE; v_class_id UUID; v_should_archive BOOLEAN;
BEGIN
    SELECT activity.* INTO v_activity FROM public.neighbor_activities activity
    JOIN public.neighbor_activity_classes link ON link.activity_id = activity.id
    WHERE link.mission_id = OLD.id;
    IF v_activity.id IS NULL THEN RETURN NEW; END IF;
    SELECT link.class_id INTO v_class_id FROM public.neighbor_activity_classes link WHERE link.mission_id = OLD.id;
    v_should_archive := NOT ((v_activity.activity_type = 'topic' AND v_activity.status = 'open')
        OR (v_activity.activity_type = 'exchange' AND v_activity.status = 'matched'));
    IF NEW.class_id IS DISTINCT FROM v_class_id OR NEW.title IS DISTINCT FROM v_activity.title
       OR NEW.guide IS DISTINCT FROM v_activity.prompt OR NEW.is_archived IS DISTINCT FROM v_should_archive THEN
        RAISE EXCEPTION '이웃 활동 과제는 이웃 아지트에서 승인·매칭·종료해 주세요.' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_neighbor_activity_mission_v1() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS neighbor_activity_mission_guard ON public.writing_missions;
CREATE TRIGGER neighbor_activity_mission_guard BEFORE UPDATE OF is_archived, title, guide, class_id ON public.writing_missions
FOR EACH ROW EXECUTE FUNCTION public.guard_neighbor_activity_mission_v1();

COMMIT;

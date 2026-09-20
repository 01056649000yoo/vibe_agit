-- 함께 쓰는 주제에 "댓글·반응 마감 시각"을 둔다(2026-09-19, 선생님 결정).
--
-- 마감 시각이 지나면 그 주제의 글에는 새 댓글·공감을 달 수 없고, 읽기만 된다(이미 쓴 것은 남는다).
-- 글쓰기 자체의 종료는 기존 '활동 종료'(closed_at)가 담당하고, 여기서는 comments_close_at 만 다룬다.
--   - 강제는 트리거로 한다(거대한 댓글/반응 함수를 다시 복사하지 않는다).
--   - 교사는 set_neighbor_activity_deadline_v1 로 마감 시각을 정하거나 지운다(NULL = 마감 없음).
--   - 화면 표시를 위해 활동 피드(학생)와 교사 활동 목록에 comments_close_at 을 함께 싣는다.

BEGIN;

ALTER TABLE public.neighbor_activities ADD COLUMN IF NOT EXISTS comments_close_at TIMESTAMPTZ;

-- 마감 뒤 새 댓글/댓글 고쳐쓰기를 막는다. 검사 워커의 상태 전환(visible/blocked)·삭제·교사 숨김은 통과.
CREATE OR REPLACE FUNCTION public.guard_neighbor_comment_deadline_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status = 'pending'
       AND (TG_OP = 'INSERT' OR NEW.content IS DISTINCT FROM OLD.content) THEN
        IF EXISTS (
            SELECT 1 FROM public.neighbor_shared_posts shared
            JOIN public.neighbor_activities activity ON activity.id = shared.activity_id
            WHERE shared.id = NEW.shared_post_id
              AND activity.comments_close_at IS NOT NULL
              AND activity.comments_close_at <= now()
        ) THEN
            RAISE EXCEPTION '이 주제는 댓글·반응이 마감되었어요. 이제 읽을 수만 있어요.' USING ERRCODE = '55000';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_neighbor_comment_deadline ON public.neighbor_comments;
CREATE TRIGGER trg_neighbor_comment_deadline
    BEFORE INSERT OR UPDATE ON public.neighbor_comments
    FOR EACH ROW EXECUTE FUNCTION public.guard_neighbor_comment_deadline_v1();

-- 마감 뒤 새 공감을 막는다(공감 취소=DELETE 는 통과).
CREATE OR REPLACE FUNCTION public.guard_neighbor_reaction_deadline_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM public.neighbor_shared_posts shared
        JOIN public.neighbor_activities activity ON activity.id = shared.activity_id
        WHERE shared.id = NEW.shared_post_id
          AND activity.comments_close_at IS NOT NULL
          AND activity.comments_close_at <= now()
    ) THEN
        RAISE EXCEPTION '이 주제는 댓글·반응이 마감되었어요. 이제 읽을 수만 있어요.' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_neighbor_reaction_deadline ON public.neighbor_reactions;
CREATE TRIGGER trg_neighbor_reaction_deadline
    BEFORE INSERT ON public.neighbor_reactions
    FOR EACH ROW EXECUTE FUNCTION public.guard_neighbor_reaction_deadline_v1();

-- 교사가 마감 시각을 정하거나(NULL=마감 없음) 지운다. 이 활동에 참여하는 학급 교사만.
CREATE OR REPLACE FUNCTION public.set_neighbor_activity_deadline_v1(
    p_space_id UUID,
    p_actor_class_id UUID,
    p_activity_id UUID,
    p_close_at TIMESTAMPTZ
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_activity_classes link
        WHERE link.activity_id = p_activity_id AND link.class_id = p_actor_class_id AND link.space_id = p_space_id
    ) THEN
        RAISE EXCEPTION '우리 반이 참여하는 주제만 마감 시각을 정할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_close_at IS NOT NULL AND p_close_at <= now() THEN
        RAISE EXCEPTION '마감 시각은 지금 이후로 정해 주세요.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.neighbor_activities
    SET comments_close_at = p_close_at
    WHERE id = p_activity_id AND space_id = p_space_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '마감 시각을 정할 주제가 없습니다.' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object('success', TRUE, 'activity_id', p_activity_id, 'comments_close_at', p_close_at);
END;
$$;
REVOKE ALL ON FUNCTION public.set_neighbor_activity_deadline_v1(UUID, UUID, UUID, TIMESTAMPTZ)
    FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_neighbor_activity_deadline_v1(UUID, UUID, UUID, TIMESTAMPTZ) TO authenticated;

-- 학생 활동 피드의 activity 에 comments_close_at 을 싣는다(나머지는 20261240 과 동일).
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
            'status', v_activity.status, 'exchange_share_scope', v_activity.exchange_share_scope,
            'comments_close_at', v_activity.comments_close_at
        ),
        'items', v_items, 'has_more', COALESCE(v_has_more, FALSE),
        'next_cursor_at', CASE WHEN v_has_more THEN v_next_at ELSE NULL END,
        'next_cursor_id', CASE WHEN v_has_more THEN v_next_id ELSE NULL END,
        'max_rows', 50
    );
END;
$$;

-- 교사 활동 목록에도 comments_close_at 을 싣는다(20261239 래퍼 사본 + 한 필드).
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_activities_v1(
    p_space_id UUID,
    p_actor_class_id UUID
)
RETURNS JSONB
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(
        base.item || jsonb_build_object(
            'exchange_share_scope', activity.exchange_share_scope,
            'comments_close_at', activity.comments_close_at,
            'match_review_class_id', activity.match_review_class_id,
            'match_proposed_at', activity.match_proposed_at,
            'approvals', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'class_id', approval.class_id,
                    'class_name', membership.public_class_name,
                    'status', approval.status,
                    'is_proposer', approval.is_proposer,
                    'decided_at', approval.decided_at
                ) ORDER BY approval.is_proposer DESC, membership.public_class_name, approval.class_id)
                FROM public.neighbor_activity_approvals approval
                JOIN public.neighbor_space_classes membership
                  ON membership.space_id = approval.space_id
                 AND membership.class_id = approval.class_id
                WHERE approval.activity_id = activity.id
            ), '[]'::JSONB),
            'my_approval_status', (
                SELECT approval.status
                FROM public.neighbor_activity_approvals approval
                WHERE approval.activity_id = activity.id
                  AND approval.class_id = p_actor_class_id
            ),
            'can_review', EXISTS (
                SELECT 1 FROM public.neighbor_activity_approvals approval
                WHERE approval.activity_id = activity.id
                  AND approval.class_id = p_actor_class_id
                  AND approval.status = 'pending'
            ),
            'can_manage', EXISTS (
                SELECT 1 FROM public.neighbor_space_classes membership
                WHERE membership.space_id = p_space_id
                  AND membership.class_id = p_actor_class_id
                  AND membership.role = 'host'
            ),
            'can_propose_match', activity.activity_type = 'exchange'
                AND activity.status = 'open'
                AND EXISTS (
                    SELECT 1 FROM public.neighbor_space_classes membership
                    WHERE membership.space_id = p_space_id
                      AND membership.class_id = p_actor_class_id
                      AND membership.role = 'host'
                ),
            'can_review_match', activity.activity_type = 'exchange'
                AND activity.status = 'matching_review'
                AND activity.match_review_class_id = p_actor_class_id,
            'match_pairs', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'student_name', left(btrim(student.name), 30),
                    'student_class_name', student_membership.public_class_name,
                    'partner_name', left(btrim(partner.name), 30),
                    'partner_class_name', partner_membership.public_class_name
                ) ORDER BY student_membership.public_class_name, student.name,
                    partner_membership.public_class_name, partner.name)
                FROM public.neighbor_exchange_matches match
                JOIN public.students student
                  ON student.id = match.student_id AND student.class_id = match.class_id
                JOIN public.students partner
                  ON partner.id = match.partner_student_id AND partner.class_id = match.partner_class_id
                JOIN public.neighbor_space_classes student_membership
                  ON student_membership.space_id = match.space_id
                 AND student_membership.class_id = match.class_id
                JOIN public.neighbor_space_classes partner_membership
                  ON partner_membership.space_id = match.space_id
                 AND partner_membership.class_id = match.partner_class_id
                WHERE match.activity_id = activity.id
                  AND match.student_id < match.partner_student_id
                  AND EXISTS (
                      SELECT 1 FROM public.neighbor_activity_classes viewer_link
                      WHERE viewer_link.activity_id = activity.id
                        AND viewer_link.class_id = p_actor_class_id
                  )
            ), '[]'::JSONB)
        )
        ORDER BY base.ordinality
    ), '[]'::JSONB)
    FROM jsonb_array_elements(
        public.get_neighbor_teacher_activities_core_20261238(p_space_id, p_actor_class_id)
    ) WITH ORDINALITY AS base(item, ordinality)
    JOIN public.neighbor_activities activity
      ON activity.id = (base.item->>'id')::UUID AND activity.space_id = p_space_id;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

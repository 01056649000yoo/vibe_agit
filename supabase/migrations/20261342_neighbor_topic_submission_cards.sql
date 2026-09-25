-- 같이 쓰기 광장: 진행 현황에 학생 제출 글 카드 + 새 제출 알림 (2026-09-25, 선생님 요청)
--
--   · 주제마다 **우리 반 학생이 낸 글**(제목·글쓴이, 학생 번호 순, 최대 100편)을 교사 작업 공간 응답에 싣는다.
--     주제마다 따로 부르지 않도록(N+1) 이미 12초마다 받는 응답에 함께 넣는다.
--   · "새 제출 글" = 교사가 **같이 쓰기 광장 진행 현황을 마지막으로 본 뒤** 우리 반 학생이 낸 글.
--     이웃 글 마당의 새 글·새 댓글이 쓰는 last_seen_at 과 섞지 않으려고 topic_seen_at 을 따로 둔다.
--     세는 곳은 neighbor_topic_new_submission_count_v1 하나 — 작업 공간 알림과 메뉴 배지가 같이 쓴다.
--   · 진행 현황을 보면 mark_neighbor_topic_seen_v1 로 지운다(공개하지 않기로 한 글 때문에 숫자가 남지 않게).

BEGIN;

ALTER TABLE public.neighbor_space_teacher_visits ADD COLUMN IF NOT EXISTS topic_seen_at TIMESTAMPTZ;

-- 교사가 같이 쓰기 광장 진행 현황을 마지막으로 본 시각(없으면 지난 방문, 그것도 없으면 지금 — 처음엔 0건).
CREATE OR REPLACE FUNCTION public.neighbor_topic_seen_at_v1(p_space_id UUID, p_class_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT COALESCE(visit.topic_seen_at, visit.last_seen_at) FROM public.neighbor_space_teacher_visits visit
         WHERE visit.space_id = p_space_id AND visit.class_id = p_class_id),
        NOW())
$$;
REVOKE ALL ON FUNCTION public.neighbor_topic_seen_at_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.neighbor_topic_new_submission_count_v1(p_space_id UUID, p_class_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT count(*)::INTEGER
    FROM public.neighbor_activity_classes link
    JOIN public.neighbor_activities activity
      ON activity.id = link.activity_id AND activity.space_id = link.space_id AND activity.activity_type = 'topic'
    JOIN public.student_posts post
      ON post.class_id = link.class_id AND post.mission_id = link.mission_id
    WHERE link.space_id = p_space_id AND link.class_id = p_class_id
      AND public.neighbor_source_is_shareable_v1(post)
      AND COALESCE(post.first_submitted_at, post.updated_at) > public.neighbor_topic_seen_at_v1(p_space_id, p_class_id)
      AND NOT EXISTS (
          SELECT 1 FROM public.neighbor_shared_posts shared
          WHERE shared.space_id = p_space_id AND shared.post_id = post.id)
$$;
REVOKE ALL ON FUNCTION public.neighbor_topic_new_submission_count_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.mark_neighbor_topic_seen_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space_id UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    SELECT membership.space_id INTO v_space_id
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.class_id = p_class_id AND membership.status = 'active' AND space.status = 'active'
    LIMIT 1;
    IF v_space_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'space_id', NULL);
    END IF;
    INSERT INTO public.neighbor_space_teacher_visits (space_id, class_id, last_seen_at, topic_seen_at)
    VALUES (v_space_id, p_class_id, NOW(), NOW())
    ON CONFLICT (space_id, class_id) DO UPDATE SET topic_seen_at = NOW();
    RETURN jsonb_build_object('success', TRUE, 'space_id', v_space_id, 'topic_seen_at', NOW());
END;
$$;
REVOKE ALL ON FUNCTION public.mark_neighbor_topic_seen_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_neighbor_topic_seen_v1(UUID) TO authenticated;

-- 교사 활동 목록: 운영 정의 + 우리 반 제출 글 카드(my_submissions)·새 제출 수.
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_activities_v1(p_space_id uuid, p_actor_class_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
    SELECT COALESCE(jsonb_agg(
        base.item || jsonb_build_object(
            'exchange_share_scope', activity.exchange_share_scope,
            'comments_close_at', activity.comments_close_at,
            'writing_close_at', activity.writing_close_at,
            -- 우리 반 학생이 이 주제에 낸 글(제목·글쓴이). 학생 번호 순, 최대 100편.
            'my_submissions', COALESCE((
                SELECT jsonb_agg(sub.item ORDER BY sub.student_no NULLS LAST, sub.student_name, sub.post_id)
                FROM (
                    SELECT post.id AS post_id, student.student_no, student.name AS student_name,
                        jsonb_build_object(
                            'post_id', post.id,
                            'title', post.title,
                            'student_name', left(btrim(student.name), 30),
                            'submitted_at', COALESCE(post.first_submitted_at, post.updated_at),
                            'share_status', shared.status,
                            'is_new', shared.id IS NULL
                                AND COALESCE(post.first_submitted_at, post.updated_at) > seen.topic_seen_at
                        ) AS item
                    FROM public.neighbor_activity_classes link
                    JOIN public.student_posts post
                      ON post.class_id = link.class_id AND post.mission_id = link.mission_id
                    JOIN public.students student
                      ON student.id = post.student_id AND student.class_id = post.class_id
                     AND student.is_active IS DISTINCT FROM FALSE AND student.deleted_at IS NULL
                    LEFT JOIN public.neighbor_shared_posts shared
                      ON shared.space_id = p_space_id AND shared.post_id = post.id
                    WHERE activity.activity_type = 'topic'
                      AND link.activity_id = activity.id AND link.class_id = p_actor_class_id
                      AND public.neighbor_source_is_shareable_v1(post)
                    ORDER BY student.student_no NULLS LAST, student.name, post.id
                    LIMIT 100
                ) sub
            ), '[]'::JSONB),
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
      ON activity.id = (base.item->>'id')::UUID AND activity.space_id = p_space_id
    CROSS JOIN LATERAL (SELECT public.neighbor_topic_seen_at_v1(p_space_id, p_actor_class_id) AS topic_seen_at) seen;
$function$;

-- 교사 작업 공간: 운영 정의 + 새 제출 글 수.
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_workspace_v1(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_base JSONB;
    v_space_id UUID;
    v_my_role TEXT;
    v_last_seen TIMESTAMPTZ;
    v_new_posts INTEGER := 0;
    v_new_comments INTEGER := 0;
    v_pending_approvals INTEGER := 0;
    v_pending_joins INTEGER := 0;
    v_blocked JSONB := '[]'::JSONB;
    v_blocked_count INTEGER := 0;
    v_guestbook JSONB := '[]'::JSONB;
    v_guestbook_count INTEGER := 0;
    v_new_topic_submissions INTEGER := 0;
    v_notifications JSONB;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    v_base := public.get_neighbor_teacher_workspace_core_20261237(p_class_id);
    v_space_id := CASE WHEN v_base #>> '{space,my_status}' = 'active'
        THEN NULLIF(v_base #>> '{space,id}', '')::UUID ELSE NULL END;
    v_my_role := v_base #>> '{space,my_role}';

    IF v_space_id IS NOT NULL THEN
        v_last_seen := COALESCE((
            SELECT visit.last_seen_at FROM public.neighbor_space_teacher_visits visit
            WHERE visit.space_id = v_space_id AND visit.class_id = p_class_id
        ), NOW());

        SELECT count(*)::INTEGER INTO v_new_posts
        FROM public.neighbor_shared_posts shared
        WHERE shared.space_id = v_space_id AND shared.class_id <> p_class_id
          AND shared.status = 'published' AND shared.published_at > v_last_seen;

        SELECT count(*)::INTEGER INTO v_new_comments
        FROM public.neighbor_comments comment
        WHERE comment.space_id = v_space_id AND comment.class_id <> p_class_id
          AND comment.status = 'visible' AND comment.created_at > v_last_seen;

        SELECT count(*)::INTEGER INTO v_pending_approvals
        FROM public.neighbor_activity_approvals approval
        WHERE approval.space_id = v_space_id AND approval.class_id = p_class_id
          AND approval.status = 'pending';

        IF v_my_role = 'host' THEN
            SELECT count(*)::INTEGER INTO v_pending_joins
            FROM public.neighbor_space_classes membership
            WHERE membership.space_id = v_space_id AND membership.status = 'pending';
        END IF;

        -- 우리 반 학생이 쓴, AI가 막은 이웃 댓글(교사가 검토함에서 되살리거나 지운다).
        -- 배지에 쓰는 수는 **자르기 전 전체**를 센다. 예전에는 아래 LIMIT 100 안에서 세어
        -- 메뉴 배지(전체)와 검토함 배지(100까지)가 어긋났다(2026-09-18).
        SELECT count(*)::INTEGER INTO v_blocked_count
        FROM public.neighbor_comments comment
        WHERE comment.space_id = v_space_id AND comment.class_id = p_class_id
          AND comment.status = 'blocked';

        SELECT COALESCE(jsonb_agg(item.row ORDER BY item.created_at DESC), '[]'::JSONB)
        INTO v_blocked
        FROM (
            SELECT comment.created_at,
                jsonb_build_object(
                    'comment_id', comment.id,
                    'content', comment.content,
                    'created_at', comment.created_at,
                    'student_name', left(btrim(student.name), 30),
                    'shared_post_id', comment.shared_post_id,
                    'post_title', post.title,
                    'reason', comment.moderation_reason
                ) AS row
            FROM public.neighbor_comments comment
            JOIN public.students student
              ON student.id = comment.student_id AND student.class_id = comment.class_id
            JOIN public.neighbor_shared_posts shared ON shared.id = comment.shared_post_id
            JOIN public.student_posts post ON post.id = shared.post_id
            WHERE comment.space_id = v_space_id
              AND comment.class_id = p_class_id
              AND comment.status = 'blocked'
            ORDER BY comment.created_at DESC
            LIMIT 100
        ) item;

        -- 같이 쓰기 광장에 우리 반 학생이 새로 낸 글(진행 현황을 본 뒤, 20261342).
        v_new_topic_submissions := public.neighbor_topic_new_submission_count_v1(v_space_id, p_class_id);

        -- 우리 반 문집에 들어온 방문록 중 확인할 것(20261335). 세는 문장은 자르기 전 전체.
        SELECT count(*)::INTEGER INTO v_guestbook_count
        FROM public.neighbor_book_guestbook entry
        JOIN public.neighbor_shared_books shared ON shared.id = entry.shared_book_id
        WHERE entry.space_id = v_space_id AND shared.class_id = p_class_id AND entry.status = 'pending';
        SELECT COALESCE(jsonb_agg(item.row ORDER BY item.created_at), '[]'::JSONB) INTO v_guestbook
        FROM (
            SELECT entry.updated_at AS created_at,
                jsonb_build_object(
                    'entry_id', entry.id,
                    'shared_book_id', entry.shared_book_id,
                    'book_title', edition.snapshot->>'title',
                    'student_name', left(btrim(student.name), 30),
                    'class_name', membership.public_class_name,
                    'content', entry.content,
                    'created_at', entry.updated_at
                ) AS row
            FROM public.neighbor_book_guestbook entry
            JOIN public.neighbor_shared_books shared ON shared.id = entry.shared_book_id
            JOIN public.class_agit_book_editions edition ON edition.id = shared.edition_id
            JOIN public.students student ON student.id = entry.student_id
            JOIN public.neighbor_space_classes membership
              ON membership.space_id = entry.space_id AND membership.class_id = entry.class_id
            WHERE entry.space_id = v_space_id AND shared.class_id = p_class_id AND entry.status = 'pending'
            ORDER BY entry.updated_at
            LIMIT 100
        ) item;
    END IF;

    v_notifications := jsonb_build_object(
        'pending_reviews', COALESCE((v_base->>'review_total')::INTEGER, 0),
        'pending_approvals', v_pending_approvals,
        'pending_joins', v_pending_joins,
        'new_posts', v_new_posts,
        'new_comments', v_new_comments,
        'blocked_comments', v_blocked_count,
        'pending_guestbook', v_guestbook_count,
        'new_topic_submissions', v_new_topic_submissions
    );

    RETURN v_base || jsonb_build_object(
        'activities', CASE WHEN v_space_id IS NULL THEN '[]'::JSONB
            ELSE public.get_neighbor_teacher_activities_v1(v_space_id, p_class_id) END,
        'blocked_comments', v_blocked,
        'notifications', v_notifications,
        'pending_guestbook', v_guestbook
    );
END;
$function$;

-- 메뉴 배지: 운영 정의 + 새 제출 글(작업 공간 알림과 같은 함수로 센다).
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_badge_v1(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_space_id UUID;
    v_role TEXT;
    v_approvals INTEGER := 0;
    v_joins INTEGER := 0;
    v_blocked INTEGER := 0;
    v_guestbook INTEGER := 0;
    v_topic INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL
       OR NOT (public.auth_user_role() = 'ADMIN'
               OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class_id AND c.teacher_id = auth.uid())) THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    SELECT membership.space_id, membership.role INTO v_space_id, v_role
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.class_id = p_class_id
      AND membership.status = 'active'
      AND space.status = 'active'
    LIMIT 1;
    IF v_space_id IS NULL THEN
        RETURN jsonb_build_object('count', 0, 'active', FALSE);
    END IF;

    SELECT count(*)::INTEGER INTO v_approvals
    FROM public.neighbor_activity_approvals approval
    WHERE approval.space_id = v_space_id AND approval.class_id = p_class_id AND approval.status = 'pending';

    SELECT count(*)::INTEGER INTO v_blocked
    FROM public.neighbor_comments comment
    WHERE comment.space_id = v_space_id AND comment.class_id = p_class_id AND comment.status = 'blocked';

    SELECT count(*)::INTEGER INTO v_guestbook
    FROM public.neighbor_book_guestbook entry
    JOIN public.neighbor_shared_books shared ON shared.id = entry.shared_book_id
    WHERE entry.space_id = v_space_id AND shared.class_id = p_class_id AND entry.status = 'pending';

    v_topic := public.neighbor_topic_new_submission_count_v1(v_space_id, p_class_id);

    IF v_role = 'host' THEN
        SELECT count(*)::INTEGER INTO v_joins
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = v_space_id AND membership.status = 'pending';
    END IF;

    RETURN jsonb_build_object('count', v_approvals + v_joins + v_blocked + v_guestbook + v_topic, 'active', TRUE);
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 모두의 아지트 알림 점검 (2026-09-25, 선생님 요청: 새 알림은 모두 메뉴 건수로)
--
--   ① 메뉴 숫자 = 처리할 일 + **새 소식**(지난 방문 뒤 이웃 반의 새 글·새 댓글·새로 소개된 문집).
--      예전 메뉴 숫자는 처리할 일만 셌고 새 글·새 댓글은 화면 안 칩에만, 새 문집은 어디에도 세지 않았다.
--      새 소식은 한 함수(neighbor_teacher_news_v1)가 세고 작업 공간 알림·메뉴 배지가 같이 쓴다.
--      기준선은 그대로 last_seen_at(모두의 아지트에 들어오면 mark_neighbor_teacher_seen_v1 이 옮김).
--   ② 같이 쓰기 광장 "새 제출 글" 기준선이 비어 있으면 last_seen_at 을 대신 써서, 진행 현황을 안 보고
--      모두의 아지트에 들어오기만 해도 새 제출 알림이 사라졌다(20261342). 이제 topic_seen_at 만 본다 —
--      방문 줄을 처음 만들 때 함께 채우고, 비어 있는 줄은 last_seen_at 으로 한 번 채운다.

BEGIN;

UPDATE public.neighbor_space_teacher_visits SET topic_seen_at = last_seen_at WHERE topic_seen_at IS NULL;

CREATE OR REPLACE FUNCTION public.neighbor_topic_seen_at_v1(p_space_id UUID, p_class_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COALESCE(
        (SELECT visit.topic_seen_at FROM public.neighbor_space_teacher_visits visit
         WHERE visit.space_id = p_space_id AND visit.class_id = p_class_id),
        NOW())
$$;
REVOKE ALL ON FUNCTION public.neighbor_topic_seen_at_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- 새 소식 세 가지를 한 곳에서 센다. 기준선은 모두의 아지트에 마지막으로 들어온 시각.
CREATE OR REPLACE FUNCTION public.neighbor_teacher_news_v1(p_space_id UUID, p_class_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH seen AS (
        SELECT COALESCE((SELECT visit.last_seen_at FROM public.neighbor_space_teacher_visits visit
                         WHERE visit.space_id = p_space_id AND visit.class_id = p_class_id), NOW()) AS at
    )
    SELECT jsonb_build_object(
        'new_posts', (SELECT count(*)::INTEGER FROM public.neighbor_shared_posts shared, seen
            WHERE shared.space_id = p_space_id AND shared.class_id <> p_class_id
              AND shared.status = 'published' AND shared.published_at > seen.at),
        'new_comments', (SELECT count(*)::INTEGER FROM public.neighbor_comments comment, seen
            WHERE comment.space_id = p_space_id AND comment.class_id <> p_class_id
              AND comment.status = 'visible' AND comment.created_at > seen.at),
        'new_books', (SELECT count(*)::INTEGER FROM public.neighbor_shared_books book, seen
            WHERE book.space_id = p_space_id AND book.class_id <> p_class_id
              AND book.status = 'published' AND book.shared_at > seen.at)
    )
$$;
REVOKE ALL ON FUNCTION public.neighbor_teacher_news_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;

-- ② 방문 기록: 운영 정의 + 새 줄의 topic_seen_at.
CREATE OR REPLACE FUNCTION public.mark_neighbor_teacher_seen_v1(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_space_id UUID;
BEGIN
    PERFORM public.assert_neighbor_teacher_class_v1(p_class_id);
    SELECT membership.space_id INTO v_space_id
    FROM public.neighbor_space_classes membership
    JOIN public.neighbor_spaces space ON space.id = membership.space_id
    WHERE membership.class_id = p_class_id
      AND membership.status = 'active'
      AND space.status = 'active'
    LIMIT 1;
    IF v_space_id IS NULL THEN
        RETURN jsonb_build_object('success', TRUE, 'space_id', NULL);
    END IF;

    -- 처음 만드는 줄은 같이 쓰기 광장 기준선도 함께 둔다(이후에는 진행 현황을 볼 때만 옮긴다).
    INSERT INTO public.neighbor_space_teacher_visits (space_id, class_id, last_seen_at, topic_seen_at)
    VALUES (v_space_id, p_class_id, NOW(), NOW())
    ON CONFLICT (space_id, class_id) DO UPDATE SET last_seen_at = NOW();

    RETURN jsonb_build_object('success', TRUE, 'space_id', v_space_id, 'last_seen_at', NOW());
END;
$function$;

-- ① 교사 작업 공간: 운영 정의 + 새 문집 수, 새 소식은 공용 함수로.
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
    v_new_books INTEGER := 0;
    v_news JSONB;
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

        -- 새 소식은 메뉴 배지와 같은 함수로 센다(20261343).
        v_news := public.neighbor_teacher_news_v1(v_space_id, p_class_id);
        v_new_posts := (v_news->>'new_posts')::INTEGER;
        v_new_comments := (v_news->>'new_comments')::INTEGER;
        v_new_books := (v_news->>'new_books')::INTEGER;

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
        'new_books', v_new_books,
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

-- ① 메뉴 배지: 처리할 일 + 새 소식.
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
    v_news JSONB;
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
    v_news := public.neighbor_teacher_news_v1(v_space_id, p_class_id);

    IF v_role = 'host' THEN
        SELECT count(*)::INTEGER INTO v_joins
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = v_space_id AND membership.status = 'pending';
    END IF;

    -- 처리할 일 + 새 소식. 나눠 보고 싶을 때를 위해 todo·news 도 함께 준다.
    RETURN jsonb_build_object(
        'count', v_approvals + v_joins + v_blocked + v_guestbook + v_topic
            + (v_news->>'new_posts')::INTEGER + (v_news->>'new_comments')::INTEGER + (v_news->>'new_books')::INTEGER,
        'todo', v_approvals + v_joins + v_blocked + v_guestbook + v_topic,
        'news', v_news,
        'active', TRUE);
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;

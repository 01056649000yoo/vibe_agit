-- 2026-10-12 모두의 아지트 점검(Codex 독립 검토를 운영 DB 정의로 확인해 고친 것).
-- 1) 학급이 탈퇴한 뒤에는 그 학급 글에 다른 학급 학생이 댓글·공감을 달 수 없다.
-- 2) 교사 글 상세는 탈퇴한 학급이 남긴 댓글을 보여 주지 않는다(학생 화면과 같게).
-- 3) 우리 반 차단 댓글 목록은 공개가 끝난 상대 학급 글의 새 제목을 보여 주지 않는다.

CREATE OR REPLACE FUNCTION public.assert_neighbor_student_post_access_v1(p_space_id uuid, p_shared_post_id uuid)
 RETURNS TABLE(requester_student_id uuid, requester_class_id uuid, owner_student_id uuid)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    -- 글을 쓴 학급이 공간을 나갔다면 글이 남아 있어도 더는 열려 있지 않다.
    IF NOT EXISTS (
        SELECT 1 FROM public.neighbor_space_classes owner_membership
        WHERE owner_membership.space_id = p_space_id
          AND owner_membership.class_id = v_shared.class_id
          AND owner_membership.status = 'active'
    ) THEN
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
$function$
;

CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_post_detail_v1(p_space_id uuid, p_actor_class_id uuid, p_shared_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_shared public.neighbor_shared_posts%ROWTYPE;
    v_result JSONB;
    v_comments JSONB := '[]'::JSONB;
BEGIN
    PERFORM public.assert_neighbor_participating_teacher_v1(p_space_id, p_actor_class_id);
    SELECT shared.* INTO v_shared FROM public.neighbor_shared_posts shared
    WHERE shared.id = p_shared_post_id AND shared.space_id = p_space_id
      AND (shared.status = 'published' OR (shared.class_id = p_actor_class_id AND shared.status IN ('hidden', 'pending')));
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
      AND (shared.status = 'published'
           OR (shared.class_id = p_actor_class_id AND shared.status IN ('hidden', 'pending')));
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
         AND membership.status = 'active'
        WHERE comment.shared_post_id = p_shared_post_id
          AND (comment.status = 'visible' OR (comment.status = 'hidden' AND comment.class_id = p_actor_class_id))
        ORDER BY comment.created_at, comment.id LIMIT 100
    ) comment_row;
    RETURN v_result || jsonb_build_object('comments', v_comments);
END;
$function$
;

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
                    'post_title', CASE WHEN shared.status = 'published' THEN post.title ELSE '(공개가 끝난 글)' END,
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
$function$
;

REVOKE ALL ON FUNCTION public.assert_neighbor_student_post_access_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_post_detail_v1(UUID, UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_post_detail_v1(UUID, UUID, UUID) TO authenticated;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_workspace_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_workspace_v1(UUID) TO authenticated;

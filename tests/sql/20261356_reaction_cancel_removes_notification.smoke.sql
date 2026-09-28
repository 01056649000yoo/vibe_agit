-- 반응 알림: 누르면 생기고, 취소하면 사라지며, 남은 고아 알림이 없다. 모두 롤백된다.
DO $$
DECLARE
    v_post UUID;
    v_owner UUID;
    v_friend UUID;
    v_reaction UUID;
    v_count INTEGER;
BEGIN
    -- 고아 알림(가리키는 반응이 없는 반응 알림)이 없다
    SELECT count(*) INTO v_count FROM public.student_notification_events e
    WHERE e.module_id = 'feedback' AND e.event_key LIKE 'reaction:%'
      AND NOT EXISTS (SELECT 1 FROM public.post_reactions r WHERE r.id::TEXT = substr(e.event_key, 10));
    IF v_count <> 0 THEN RAISE EXCEPTION '취소된 반응의 알림이 %건 남아 있습니다.', v_count; END IF;

    -- 활성 학급의 글 하나와, 같은 반에서 아직 반응하지 않은 다른 학생
    SELECT post.id, post.student_id, friend.id INTO v_post, v_owner, v_friend
    FROM public.student_posts post
    JOIN public.students owner ON owner.id = post.student_id AND owner.is_active IS DISTINCT FROM FALSE AND owner.deleted_at IS NULL
    JOIN public.classes class ON class.id = owner.class_id AND class.deleted_at IS NULL
    JOIN public.students friend ON friend.class_id = owner.class_id AND friend.id <> owner.id
         AND friend.is_active IS DISTINCT FROM FALSE AND friend.deleted_at IS NULL
    WHERE NOT EXISTS (SELECT 1 FROM public.post_reactions r WHERE r.post_id = post.id AND r.student_id = friend.id)
    ORDER BY post.created_at DESC, friend.id
    LIMIT 1;
    IF v_post IS NULL THEN RAISE EXCEPTION '반응 스모크에 쓸 글이 없습니다.'; END IF;

    INSERT INTO public.post_reactions (post_id, student_id, reaction_type)
    VALUES (v_post, v_friend, 'heart') RETURNING id INTO v_reaction;
    SELECT count(*) INTO v_count FROM public.student_notification_events
    WHERE event_key = format('reaction:%s', v_reaction) AND student_id = v_owner;
    IF v_count <> 1 THEN RAISE EXCEPTION '반응 알림이 생기지 않았습니다(%건).', v_count; END IF;

    DELETE FROM public.post_reactions WHERE id = v_reaction;
    SELECT count(*) INTO v_count FROM public.student_notification_events
    WHERE event_key = format('reaction:%s', v_reaction);
    IF v_count <> 0 THEN RAISE EXCEPTION '반응을 취소했는데 알림이 남았습니다.'; END IF;
END;
$$;

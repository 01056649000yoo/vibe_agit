-- 모두의 아지트: 내 글에 이웃 반 댓글이 달리면 학생 "내 글 소식" 으로 알린다 (2026-09-23, 선생님 결정)
--
-- 우리 반 댓글(post_comments)은 emit_feedback_comment_notification_v1 가 알려 주는데, 모두의 아지트
-- 댓글(neighbor_comments)에는 알림 장치가 없어 학생은 직접 들어가 💬 숫자를 봐야만 알았다.
--
--   · 같은 원장·같은 갈래(module_id='feedback')에 새 종류 feedback.neighbor_comment_received 로 쌓는다.
--     내 글 소식 배지·댓글 탭에 우리 반 댓글과 함께 보인다.
--   · 댓글이 실제로 보이게 된 순간(status='visible')에만 알린다. AI 검사 대기(pending)·막힘(blocked)
--     에서는 알리지 않고, 숨김·삭제·다시 검사로 보이지 않게 되면 알림도 거둔다(우리 반 댓글과 같은 규칙).
--   · 공감(neighbor_reactions)은 알리지 않는다(선생님 결정 — 반이 많으면 알림이 넘친다).
--   · 내가 내 글에 단 댓글은 알리지 않는다. 지난 댓글은 소급하지 않는다.
--   · 알림이 실패해도 댓글 저장·AI 검사 전환을 막지 않는다(경고만 남긴다).

BEGIN;

CREATE OR REPLACE FUNCTION public.emit_neighbor_comment_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_owner_id UUID;
    v_post_id UUID;
    v_post_title TEXT;
    v_actor_name TEXT;
    v_actor_class_name TEXT;
BEGIN
    IF TG_OP = 'DELETE' THEN
        DELETE FROM public.student_notification_events
        WHERE module_id = 'feedback'
          AND event_key = format('neighbor-comment:%s', OLD.id);
        RETURN OLD;
    END IF;

    -- 보이지 않게 된 댓글(검사 대기·막힘·숨김·삭제)은 알림도 거둔다.
    IF NEW.status IS DISTINCT FROM 'visible' THEN
        DELETE FROM public.student_notification_events
        WHERE module_id = 'feedback'
          AND event_key = format('neighbor-comment:%s', NEW.id);
        RETURN NEW;
    END IF;
    -- 이미 보이던 댓글의 다른 열만 바뀐 것은 새 소식이 아니다.
    IF TG_OP = 'UPDATE' AND OLD.status = 'visible' THEN
        RETURN NEW;
    END IF;

    SELECT shared.student_id, shared.post_id, post.title
    INTO v_owner_id, v_post_id, v_post_title
    FROM public.neighbor_shared_posts shared
    JOIN public.student_posts post ON post.id = shared.post_id
    WHERE shared.id = NEW.shared_post_id;

    IF v_owner_id IS NULL OR v_owner_id = NEW.student_id THEN
        RETURN NEW;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.students student
        JOIN public.classes class ON class.id = student.class_id
        WHERE student.id = v_owner_id
          AND student.is_active IS DISTINCT FROM FALSE
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
          AND class.deleted_at IS NULL
    ) THEN
        RETURN NEW;
    END IF;

    SELECT left(btrim(student.name), 30) INTO v_actor_name
    FROM public.students student WHERE student.id = NEW.student_id;
    SELECT membership.public_class_name INTO v_actor_class_name
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = NEW.space_id AND membership.class_id = NEW.class_id;

    BEGIN
        -- 같은 댓글이 다시 보이게 돼도 event_key 가 같아 한 건만 남는다.
        PERFORM public.notification_emit_v1(
            v_owner_id, 'feedback', 'feedback.neighbor_comment_received', 'neighbor_shared_post', NEW.shared_post_id,
            jsonb_build_object(
                'post_id', v_post_id,
                'shared_post_id', NEW.shared_post_id,
                'space_id', NEW.space_id,
                'post_title', v_post_title,
                'actor_name', COALESCE(v_actor_name, '친구'),
                'actor_class_name', COALESCE(v_actor_class_name, '이웃 반'),
                'excerpt', left(COALESCE(NEW.content, ''), 120)
            ),
            format('neighbor-comment:%s', NEW.id),
            1::SMALLINT,
            NEW.student_id
        );
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING '이웃 댓글 알림을 만들지 못했습니다(%): %', NEW.id, SQLERRM;
    END;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.emit_neighbor_comment_notification_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_neighbor_comment_notification_v1 ON public.neighbor_comments;
CREATE TRIGGER trg_neighbor_comment_notification_v1
    AFTER INSERT OR DELETE OR UPDATE OF status ON public.neighbor_comments
    FOR EACH ROW EXECUTE FUNCTION public.emit_neighbor_comment_notification_v1();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 모두의 아지트 기능 점검에서 나온 결함 고침 (2026-09-24, docs/NEIGHBOR_AGIT_FUNCTIONAL_CHECKLIST.md D1·D2·D3·D5)
--
--   D1 · AI 검사가 두 번 모두 실패한(또는 두 번째 작업기가 멈춘) 이웃 댓글이 `pending` 에 영영 남았다.
--        학생은 계속 "확인 중", 교사 검토함·배지는 `blocked` 만 세서 아무도 볼 수 없었다.
--        → 이웃 댓글은 재시도가 끝나면 `blocked`(교사 확인 필요)로 넘긴다. 검토함·배지·되살리기/지우기·
--          되살렸을 때의 글쓴이 알림은 이미 있는 `blocked` 경로를 그대로 쓴다. 우리 반 댓글(post_comments)은
--          학급 댓글 관리가 `pending` 을 이미 "처리할 것" 으로 세므로 바꾸지 않는다.
--   D2 · 글 상세가 `visible` 댓글만 돌려줘, 다시 열면 내 댓글이 검사 중인지·막혔는지 알 수 없었다.
--        → `my_comment`(내 댓글이 보이지 않는 상태일 때만 상태·내용)를 싣는다.
--   D3 · 메뉴 배지가 모두의 아지트 참여 여부(`active`)를 함께 돌려줘, 참여 학급만 다른 메뉴에서 12초 확인을 켠다.
--   D5 · 공간이 끝나거나 학급이 빠진 뒤에도 이웃 댓글·방문록 알림이 남아, 눌러도 말없이 홈으로 튕겼다.
--        → 그때 그 공간 알림을 거둔다(일시 멈춤·학생 입장 끄기는 되돌릴 수 있으므로 거두지 않는다).

BEGIN;

CREATE OR REPLACE FUNCTION public.neighbor_comment_ai_unfinished_reason_v1()
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT 'AI 검사를 끝내지 못했어요. 내용을 보고 되살리거나 지워 주세요.'::TEXT
$$;
REVOKE ALL ON FUNCTION public.neighbor_comment_ai_unfinished_reason_v1() FROM PUBLIC, anon, authenticated;

-- D1 ① 검사 실패 보고: 재시도가 남았으면 예전처럼 다시 줄 세우고, 끝났으면 이웃 댓글은 교사 확인으로 넘긴다.
CREATE OR REPLACE FUNCTION public.fail_comment_ai_review_v2(
    p_comment_id UUID, p_review_token UUID, p_error_code TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_attempts SMALLINT;
    v_error_code TEXT := left(lower(COALESCE(NULLIF(p_error_code, ''), 'unknown')), 50);
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    IF v_error_code !~ '^[a-z0-9_:-]+$' THEN v_error_code := 'unknown'; END IF;

    UPDATE public.post_comments SET
        ai_review_token = NULL, ai_review_lease_until = NULL, moderated_at = NULL, moderated_by = NULL,
        ai_review_next_at = CASE WHEN ai_review_attempts < 2
            THEN NOW() + (INTERVAL '15 seconds' * ai_review_attempts) ELSE NULL END,
        ai_review_last_error_code = v_error_code
    WHERE id = p_comment_id AND status = 'pending' AND ai_review_token = p_review_token
    RETURNING ai_review_attempts INTO v_attempts;

    IF v_attempts IS NULL THEN
        UPDATE public.neighbor_comments SET
            ai_review_token = NULL, ai_review_lease_until = NULL,
            ai_review_next_at = CASE WHEN ai_review_attempts < 2
                THEN NOW() + (INTERVAL '15 seconds' * ai_review_attempts) ELSE NULL END,
            ai_review_last_error_code = v_error_code,
            status = CASE WHEN ai_review_attempts < 2 THEN 'pending' ELSE 'blocked' END,
            moderation_reason = CASE WHEN ai_review_attempts < 2 THEN NULL
                ELSE public.neighbor_comment_ai_unfinished_reason_v1() END,
            moderated_at = CASE WHEN ai_review_attempts < 2 THEN NULL ELSE NOW() END,
            moderated_by = CASE WHEN ai_review_attempts < 2 THEN NULL ELSE 'ai_failed' END
        WHERE id = p_comment_id AND status = 'pending' AND ai_review_token = p_review_token
        RETURNING ai_review_attempts INTO v_attempts;
    END IF;

    UPDATE public.comment_ai_review_slots SET
        comment_id = NULL, review_token = NULL, leased_at = NULL, lease_until = NULL
    WHERE comment_id = p_comment_id AND review_token = p_review_token;

    RETURN jsonb_build_object(
        'released', v_attempts IS NOT NULL,
        'will_retry', COALESCE(v_attempts < 2, false),
        'attempts', COALESCE(v_attempts, 0));
END;
$$;

-- D1 ② 작업기가 멈춘 슬롯 회수(2분 임대 만료)도 같은 규칙. 나머지는 20261264 판 그대로.
CREATE OR REPLACE FUNCTION public.claim_next_comment_ai_review_v2()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_slot public.comment_ai_review_slots%ROWTYPE;
    v_id UUID; v_student UUID; v_post UUID; v_content TEXT; v_attempts SMALLINT;
    v_source TEXT;
    v_token UUID := gen_random_uuid();
    v_now TIMESTAMPTZ := NOW();
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;

    -- 작업기가 중단된 슬롯은 2분 뒤 회수한다. 댓글의 시도 횟수는 유지해 무한 재시도를 막는다.
    UPDATE public.post_comments comment SET
        ai_review_token = NULL, ai_review_lease_until = NULL, moderated_at = NULL, moderated_by = NULL,
        ai_review_next_at = CASE WHEN comment.ai_review_attempts < 2 THEN v_now ELSE NULL END,
        ai_review_last_error_code = 'lease_expired'
    FROM public.comment_ai_review_slots slot
    WHERE slot.lease_until <= v_now AND slot.comment_id = comment.id
      AND slot.review_token = comment.ai_review_token AND comment.status = 'pending';
    -- 이웃 댓글은 두 번째 시도의 작업기가 멈췄으면 교사 확인으로 넘긴다(20261339, 아래 fail 과 같은 규칙).
    UPDATE public.neighbor_comments comment SET
        ai_review_token = NULL, ai_review_lease_until = NULL,
        ai_review_next_at = CASE WHEN comment.ai_review_attempts < 2 THEN v_now ELSE NULL END,
        ai_review_last_error_code = 'lease_expired',
        status = CASE WHEN comment.ai_review_attempts < 2 THEN 'pending' ELSE 'blocked' END,
        moderation_reason = CASE WHEN comment.ai_review_attempts < 2 THEN NULL
            ELSE public.neighbor_comment_ai_unfinished_reason_v1() END,
        moderated_at = CASE WHEN comment.ai_review_attempts < 2 THEN NULL ELSE v_now END,
        moderated_by = CASE WHEN comment.ai_review_attempts < 2 THEN NULL ELSE 'ai_failed' END
    FROM public.comment_ai_review_slots slot
    WHERE slot.lease_until <= v_now AND slot.comment_id = comment.id
      AND slot.review_token = comment.ai_review_token AND comment.status = 'pending';

    UPDATE public.comment_ai_review_slots SET
        comment_id = NULL, review_token = NULL, leased_at = NULL, lease_until = NULL
    WHERE lease_until <= v_now;

    SELECT * INTO v_slot FROM public.comment_ai_review_slots
    WHERE comment_id IS NULL ORDER BY slot_no FOR UPDATE SKIP LOCKED LIMIT 1;
    IF v_slot.slot_no IS NULL THEN
        RETURN jsonb_build_object('claimed', false, 'status', 'busy', 'limit', 3);
    END IF;

    -- 우리 반 댓글을 먼저 본다. 없으면 이웃 댓글을 본다. 둘 다 오래 기다린 것부터 집는다.
    SELECT id, student_id, post_id, content, ai_review_attempts, 'class'
      INTO v_id, v_student, v_post, v_content, v_attempts, v_source
    FROM public.post_comments
    WHERE status = 'pending' AND student_id IS NOT NULL AND ai_review_attempts < 2
      AND ai_review_next_at IS NOT NULL AND ai_review_next_at <= v_now AND ai_review_token IS NULL
    ORDER BY ai_review_enqueued_at, created_at, id
    FOR UPDATE SKIP LOCKED LIMIT 1;

    IF v_id IS NULL THEN
        SELECT id, student_id, shared_post_id, content, ai_review_attempts, 'neighbor'
          INTO v_id, v_student, v_post, v_content, v_attempts, v_source
        FROM public.neighbor_comments
        WHERE status = 'pending' AND student_id IS NOT NULL AND ai_review_attempts < 2
          AND ai_review_next_at IS NOT NULL AND ai_review_next_at <= v_now AND ai_review_token IS NULL
        ORDER BY ai_review_enqueued_at, created_at, id
        FOR UPDATE SKIP LOCKED LIMIT 1;
    END IF;

    IF v_id IS NULL THEN
        RETURN jsonb_build_object('claimed', false, 'status', 'empty', 'limit', 3);
    END IF;

    UPDATE public.comment_ai_review_slots SET
        comment_id = v_id, review_token = v_token, leased_at = v_now,
        lease_until = v_now + INTERVAL '2 minutes'
    WHERE slot_no = v_slot.slot_no;

    IF v_source = 'class' THEN
        UPDATE public.post_comments SET
            ai_review_token = v_token, ai_review_attempts = ai_review_attempts + 1,
            ai_review_lease_until = v_now + INTERVAL '2 minutes',
            moderated_by = 'ai_processing', moderated_at = v_now
        WHERE id = v_id;
    ELSE
        UPDATE public.neighbor_comments SET
            ai_review_token = v_token, ai_review_attempts = ai_review_attempts + 1,
            ai_review_lease_until = v_now + INTERVAL '2 minutes',
            moderated_by = 'ai_processing', moderated_at = v_now
        WHERE id = v_id;
    END IF;

    RETURN jsonb_build_object(
        'claimed', true, 'status', 'processing', 'slot_no', v_slot.slot_no,
        'comment_id', v_id, 'student_id', v_student, 'post_id', v_post,
        'content', v_content, 'review_token', v_token, 'attempt', v_attempts + 1,
        'source', v_source);
END;
$$;

-- D1 ③ 이미 멈춰 있는 이웃 댓글도 넘긴다(재시도가 끝났고 아무 작업기도 잡고 있지 않은 것).
UPDATE public.neighbor_comments SET
    status = 'blocked',
    moderation_reason = public.neighbor_comment_ai_unfinished_reason_v1(),
    moderated_at = NOW(),
    moderated_by = 'ai_failed'
WHERE status = 'pending' AND ai_review_attempts >= 2
  AND ai_review_next_at IS NULL AND ai_review_token IS NULL;

-- D2 · 글 상세: 20261240 판 + my_comment(내 댓글이 아직/더는 보이지 않을 때만).
CREATE OR REPLACE FUNCTION public.get_neighbor_shared_post_v1(p_space_id uuid, p_shared_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    v_my_comment JSONB;
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

    -- 보이는 댓글 목록에는 없지만 학생 자신은 알아야 하는 상태: 검사 중·교사 확인 중·선생님이 숨김.
    SELECT jsonb_build_object('comment_id', comment.id, 'status', comment.status, 'content', comment.content)
    INTO v_my_comment
    FROM public.neighbor_comments comment
    WHERE comment.shared_post_id = p_shared_post_id AND comment.student_id = v_student_id
      AND comment.status IN ('pending', 'blocked', 'hidden');

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
        'my_reaction', v_my_reaction, 'my_saved', v_my_saved,
        'my_comment', v_my_comment
    );
END;
$function$;

-- D3 · 메뉴 배지: 20261335 판 + active(이 학급이 모두의 아지트에 참여 중인지).
CREATE OR REPLACE FUNCTION public.get_neighbor_teacher_badge_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_space_id UUID;
    v_role TEXT;
    v_approvals INTEGER := 0;
    v_joins INTEGER := 0;
    v_blocked INTEGER := 0;
    v_guestbook INTEGER := 0;
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

    IF v_role = 'host' THEN
        SELECT count(*)::INTEGER INTO v_joins
        FROM public.neighbor_space_classes membership
        WHERE membership.space_id = v_space_id AND membership.status = 'pending';
    END IF;

    RETURN jsonb_build_object('count', v_approvals + v_joins + v_blocked + v_guestbook, 'active', TRUE);
END;
$$;
REVOKE ALL ON FUNCTION public.get_neighbor_teacher_badge_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_neighbor_teacher_badge_v1(UUID) TO authenticated;


-- D5 · 공간이 끝나거나 학급이 빠지면 그 공간의 이웃 댓글·방문록 알림을 거둔다.
-- 알림 표는 (class_id, student_id, …) 색인으로 학급 단위로만 찾는다.
CREATE OR REPLACE FUNCTION public.withdraw_neighbor_notifications_v1(p_space_id UUID, p_class_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    DELETE FROM public.student_notification_events event
    WHERE event.class_id = p_class_id
      AND event.module_id = 'feedback'
      AND (event.event_key LIKE 'neighbor-comment:%' OR event.event_key LIKE 'neighbor-guestbook%')
      AND event.payload->>'space_id' = p_space_id::TEXT;
$$;
REVOKE ALL ON FUNCTION public.withdraw_neighbor_notifications_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_neighbor_notifications_on_close_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
BEGIN
    IF TG_TABLE_NAME = 'neighbor_spaces' THEN
        FOR v_class_id IN
            SELECT membership.class_id FROM public.neighbor_space_classes membership
            WHERE membership.space_id = NEW.id
        LOOP
            PERFORM public.withdraw_neighbor_notifications_v1(NEW.id, v_class_id);
        END LOOP;
    ELSE
        PERFORM public.withdraw_neighbor_notifications_v1(NEW.space_id, NEW.class_id);
    END IF;
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.withdraw_neighbor_notifications_on_close_v1() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_neighbor_space_closed_notifications ON public.neighbor_spaces;
CREATE TRIGGER trg_neighbor_space_closed_notifications
    AFTER UPDATE OF status ON public.neighbor_spaces
    FOR EACH ROW
    WHEN (NEW.status = 'closed' AND OLD.status IS DISTINCT FROM 'closed')
    EXECUTE FUNCTION public.withdraw_neighbor_notifications_on_close_v1();

DROP TRIGGER IF EXISTS trg_neighbor_class_left_notifications ON public.neighbor_space_classes;
CREATE TRIGGER trg_neighbor_class_left_notifications
    AFTER UPDATE OF status ON public.neighbor_space_classes
    FOR EACH ROW
    WHEN (NEW.status = 'left' AND OLD.status IS DISTINCT FROM 'left')
    EXECUTE FUNCTION public.withdraw_neighbor_notifications_on_close_v1();

-- 이미 끝난 공간·빠진 학급에 남은 알림도 거둔다.
SELECT public.withdraw_neighbor_notifications_v1(membership.space_id, membership.class_id)
FROM public.neighbor_space_classes membership
JOIN public.neighbor_spaces space ON space.id = membership.space_id
WHERE space.status = 'closed' OR membership.status = 'left';

NOTIFY pgrst, 'reload schema';

COMMIT;

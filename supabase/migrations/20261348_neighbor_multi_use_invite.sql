-- 모두의 아지트 초대 코드를 여러 반이 함께 쓰게 (2026-09-25, 선생님 요청: 초대 과정이 직관적이지 않다)
--
-- 예전: 초대키는 한 번 신청하면 바로 '사용됨', 24시간 만료. 반을 여럿 모으려면 "키 만들기 → 전달 → 신청 → 승인" 을 반마다 되풀이했다.
-- 이제: 코드 하나로 **남은 자리 수만큼**(공간 상한 10반 − 지금 참여 반) 신청을 받고, 7일 동안 쓴다. 새 코드를 만들면 이전 코드는 멈춘다(그대로).
-- 그대로 지키는 것: 해시만 저장·원문은 만든 응답 한 번, 잘못된 코드 반복 제한(neighbor_invite_attempts), 호스트 승인.

BEGIN;

ALTER TABLE public.neighbor_invites ADD COLUMN IF NOT EXISTS max_uses SMALLINT NOT NULL DEFAULT 1;
ALTER TABLE public.neighbor_invites ADD COLUMN IF NOT EXISTS use_count SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE public.neighbor_invites DROP CONSTRAINT IF EXISTS neighbor_invites_uses_check;
ALTER TABLE public.neighbor_invites ADD CONSTRAINT neighbor_invites_uses_check
    CHECK (max_uses BETWEEN 1 AND 20 AND use_count BETWEEN 0 AND max_uses);

-- 초대 코드 만들기: 운영 정의 + 7일·여러 반.
CREATE OR REPLACE FUNCTION public.create_neighbor_invite_v1(p_space_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_host_class_id UUID;
    v_invite_id UUID;
    v_key TEXT;
    v_normalized TEXT;
    v_hash TEXT;
    v_expires_at TIMESTAMPTZ := NOW() + INTERVAL '7 days';
    v_max_uses SMALLINT;
BEGIN
    v_actor := public.assert_neighbor_space_host_v1(p_space_id);
    SELECT space.host_class_id INTO v_host_class_id
    FROM public.neighbor_spaces space
    WHERE space.id = p_space_id AND space.status = 'active'
    FOR UPDATE;
    IF v_host_class_id IS NULL THEN
        RAISE EXCEPTION '활성 공간에서만 초대키를 만들 수 있습니다.' USING ERRCODE = '55000';
    END IF;

    UPDATE public.neighbor_invites
    SET status = 'cancelled', cancelled_at = NOW()
    WHERE space_id = p_space_id AND status = 'active';

    -- 남은 자리만큼 신청을 받는다(공간당 10반, 대기 중인 신청도 자리로 센다).
    SELECT GREATEST(1, 10 - count(*))::SMALLINT INTO v_max_uses
    FROM public.neighbor_space_classes membership
    WHERE membership.space_id = p_space_id AND membership.status IN ('active', 'pending');

    LOOP
        v_key := public.generate_neighbor_invite_key_v1();
        v_normalized := replace(v_key, '-', '');
        v_hash := encode(extensions.digest(convert_to(v_normalized, 'UTF8'), 'sha256'), 'hex');
        BEGIN
            INSERT INTO public.neighbor_invites (
                space_id, class_id, invite_hash, expires_at, created_by, max_uses
            ) VALUES (
                p_space_id, v_host_class_id, v_hash, v_expires_at, v_user_id, v_max_uses
            ) RETURNING id INTO v_invite_id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            NULL;
        END;
    END LOOP;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        p_space_id, v_host_class_id, v_user_id, v_actor,
        'invite_created', 'invite', v_invite_id
    );

    -- 원문 키는 이 응답 한 번에만 포함되고 표·이벤트에는 해시만 남는다.
    RETURN jsonb_build_object(
        'success', TRUE,
        'invite_key', v_key,
        'expires_at', v_expires_at,
        'max_uses', v_max_uses
    );
END;
$function$;

-- 참여 신청: 운영 정의 + 여러 반이 같은 코드로.
CREATE OR REPLACE FUNCTION public.request_neighbor_join_v1(p_invite_key text, p_class_id uuid, p_public_class_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
    v_user_id UUID := auth.uid();
    v_actor TEXT;
    v_class_name TEXT := btrim(COALESCE(p_public_class_name, ''));
    v_normalized TEXT := regexp_replace(upper(COALESCE(p_invite_key, '')), '[-[:space:]]', '', 'g');
    v_hash TEXT;
    v_invite public.neighbor_invites%ROWTYPE;
    v_space public.neighbor_spaces%ROWTYPE;
    v_attempt public.neighbor_invite_attempts%ROWTYPE;
    v_membership_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    v_actor := public.assert_neighbor_teacher_class_v1(p_class_id);
    IF char_length(v_class_name) NOT BETWEEN 1 AND 40 THEN
        RAISE EXCEPTION '공개 학급명은 1~40자로 입력해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.class_id = p_class_id AND membership.status = 'active'
    ) THEN
        RAISE EXCEPTION '이 학급은 이미 활성 이웃 아지트에 참여 중입니다.' USING ERRCODE = '23505';
    END IF;

    SELECT attempt.* INTO v_attempt
    FROM public.neighbor_invite_attempts attempt
    WHERE attempt.user_id = v_user_id;
    IF v_attempt.blocked_until > v_now THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'error', 'rate_limited',
            'retry_after_seconds', GREATEST(
                1,
                CEIL(EXTRACT(EPOCH FROM (v_attempt.blocked_until - v_now)))::INTEGER
            )
        );
    END IF;

    IF v_normalized !~ '^[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{16}$' THEN
        RETURN public.record_neighbor_invite_failure_v1();
    END IF;
    v_hash := encode(extensions.digest(convert_to(v_normalized, 'UTF8'), 'sha256'), 'hex');

    SELECT invite.* INTO v_invite
    FROM public.neighbor_invites invite
    WHERE invite.invite_hash = v_hash
    FOR UPDATE;

    IF v_invite.id IS NULL OR v_invite.status <> 'active' OR v_invite.expires_at <= v_now THEN
        IF v_invite.id IS NOT NULL AND v_invite.status = 'active' AND v_invite.expires_at <= v_now THEN
            UPDATE public.neighbor_invites SET status = 'expired' WHERE id = v_invite.id;
        END IF;
        RETURN public.record_neighbor_invite_failure_v1();
    END IF;

    SELECT space.* INTO v_space
    FROM public.neighbor_spaces space
    WHERE space.id = v_invite.space_id
    FOR UPDATE;
    IF v_space.status <> 'active' THEN
        RETURN public.record_neighbor_invite_failure_v1();
    END IF;
    IF v_space.host_class_id = p_class_id THEN
        RAISE EXCEPTION '호스트 학급은 자기 초대로 참여할 수 없습니다.' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (
        SELECT 1 FROM public.neighbor_space_classes membership
        WHERE membership.space_id = v_space.id
          AND membership.class_id = p_class_id
          AND membership.status IN ('pending', 'active')
    ) THEN
        RAISE EXCEPTION '이미 참여 신청했거나 참여 중인 학급입니다.' USING ERRCODE = '23505';
    END IF;

    INSERT INTO public.neighbor_space_classes (
        space_id, class_id, role, status, public_class_name,
        student_access_enabled, requested_at, reviewed_at, reviewed_by, joined_at, left_at
    ) VALUES (
        v_space.id, p_class_id, 'guest', 'pending', v_class_name,
        FALSE, v_now, NULL, NULL, NULL, NULL
    )
    ON CONFLICT (space_id, class_id) DO UPDATE SET
        role = 'guest',
        status = 'pending',
        public_class_name = EXCLUDED.public_class_name,
        student_access_enabled = FALSE,
        requested_at = v_now,
        reviewed_at = NULL,
        reviewed_by = NULL,
        joined_at = NULL,
        left_at = NULL
    WHERE neighbor_space_classes.status IN ('rejected', 'left')
    RETURNING id INTO v_membership_id;

    IF v_membership_id IS NULL THEN
        RAISE EXCEPTION '이 학급의 참여 상태를 갱신할 수 없습니다.' USING ERRCODE = '55000';
    END IF;

    -- 한 반이 신청할 때마다 한 자리씩 쓴다. 다 쓰면 '사용됨'(마지막 신청 반을 남긴다).
    UPDATE public.neighbor_invites
    SET use_count = use_count + 1,
        status = CASE WHEN use_count + 1 >= max_uses THEN 'used' ELSE status END,
        used_at = CASE WHEN use_count + 1 >= max_uses THEN v_now ELSE NULL END,
        used_by_class_id = CASE WHEN use_count + 1 >= max_uses THEN p_class_id ELSE NULL END
    WHERE id = v_invite.id;
    DELETE FROM public.neighbor_invite_attempts WHERE user_id = v_user_id;

    INSERT INTO public.neighbor_space_events (
        space_id, class_id, actor_user_id, actor_role, event_type, target_type, target_id
    ) VALUES (
        v_space.id, p_class_id, v_user_id,
        CASE WHEN v_actor = 'admin' THEN 'admin' ELSE 'guest' END,
        'join_requested', 'class', p_class_id
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'space_id', v_space.id,
        'membership_id', v_membership_id,
        'status', 'pending'
    );
END;
$function$;

NOTIFY pgrst, 'reload schema';

COMMIT;

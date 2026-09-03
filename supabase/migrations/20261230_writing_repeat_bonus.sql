-- 기존 1회 추가 분량 보너스 뒤에 선택형 글자 수 구간 보너스를 더한다.
-- 새 설정은 제출 순간 student_posts에 스냅샷하여 이후 교사 설정 변경의 영향을 받지 않는다.

BEGIN;

ALTER TABLE public.writing_missions
    ADD COLUMN IF NOT EXISTS repeat_bonus_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS repeat_bonus_threshold INTEGER NOT NULL DEFAULT 0
        CHECK (repeat_bonus_threshold BETWEEN 0 AND 20000),
    ADD COLUMN IF NOT EXISTS repeat_bonus_reward INTEGER NOT NULL DEFAULT 0
        CHECK (repeat_bonus_reward BETWEEN 0 AND 10000),
    ADD COLUMN IF NOT EXISTS repeat_bonus_max_count INTEGER NOT NULL DEFAULT 0
        CHECK (repeat_bonus_max_count BETWEEN 0 AND 20);

ALTER TABLE public.class_writing_policies
    ADD COLUMN IF NOT EXISTS repeat_bonus_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS repeat_bonus_threshold INTEGER NOT NULL DEFAULT 0
        CHECK (repeat_bonus_threshold BETWEEN 0 AND 20000),
    ADD COLUMN IF NOT EXISTS repeat_bonus_reward INTEGER NOT NULL DEFAULT 0
        CHECK (repeat_bonus_reward BETWEEN 0 AND 10000),
    ADD COLUMN IF NOT EXISTS repeat_bonus_max_count INTEGER NOT NULL DEFAULT 0
        CHECK (repeat_bonus_max_count BETWEEN 0 AND 20);

ALTER TABLE public.student_posts
    ADD COLUMN IF NOT EXISTS awarded_repeat_bonus_enabled BOOLEAN,
    ADD COLUMN IF NOT EXISTS awarded_repeat_bonus_threshold INTEGER,
    ADD COLUMN IF NOT EXISTS awarded_repeat_bonus_reward INTEGER,
    ADD COLUMN IF NOT EXISTS awarded_repeat_bonus_max_count INTEGER;

CREATE OR REPLACE FUNCTION public.calculate_writing_reward_total_v1(
    p_base_reward INTEGER,
    p_min_chars INTEGER,
    p_char_count INTEGER,
    p_bonus_threshold INTEGER,
    p_bonus_reward INTEGER,
    p_repeat_enabled BOOLEAN,
    p_repeat_threshold INTEGER,
    p_repeat_reward INTEGER,
    p_repeat_max_count INTEGER
)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    WITH normalized AS (
        SELECT
            GREATEST(0, COALESCE(p_base_reward, 0)) AS base_reward,
            GREATEST(0, COALESCE(p_min_chars, 0)) AS min_chars,
            GREATEST(0, COALESCE(p_char_count, 0)) AS char_count,
            GREATEST(0, COALESCE(p_bonus_threshold, 0)) AS bonus_threshold,
            GREATEST(0, COALESCE(p_bonus_reward, 0)) AS bonus_reward,
            COALESCE(p_repeat_enabled, FALSE) AS repeat_enabled,
            GREATEST(0, COALESCE(p_repeat_threshold, 0)) AS repeat_threshold,
            GREATEST(0, COALESCE(p_repeat_reward, 0)) AS repeat_reward,
            LEAST(20, GREATEST(0, COALESCE(p_repeat_max_count, 0))) AS repeat_max_count
    ), calculated AS (
        SELECT *,
            bonus_threshold > 0 AND bonus_reward > 0
                AND char_count >= min_chars + bonus_threshold AS bonus_achieved,
            min_chars + CASE WHEN bonus_threshold > 0 AND bonus_reward > 0
                THEN bonus_threshold ELSE 0 END AS repeat_start
        FROM normalized
    )
    SELECT base_reward
        + CASE WHEN bonus_achieved THEN bonus_reward ELSE 0 END
        + CASE WHEN repeat_enabled AND repeat_threshold > 0
                    AND repeat_reward > 0 AND repeat_max_count > 0
            THEN LEAST(repeat_max_count, GREATEST(0,
                ((char_count - repeat_start) / repeat_threshold)::INTEGER
            )) * repeat_reward
            ELSE 0 END
    FROM calculated;
$$;

REVOKE ALL ON FUNCTION public.calculate_writing_reward_total_v1(
    INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, INTEGER, INTEGER, INTEGER
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_writing_reward_total_v1(
    INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, INTEGER, INTEGER, INTEGER
) TO service_role;

CREATE OR REPLACE FUNCTION public.snapshot_student_post_repeat_bonus_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_enabled BOOLEAN := FALSE;
    v_threshold INTEGER := 0;
    v_reward INTEGER := 0;
    v_max_count INTEGER := 0;
BEGIN
    IF NEW.is_submitted IS NOT TRUE
      OR (TG_OP = 'UPDATE' AND OLD.is_submitted IS TRUE) THEN
        RETURN NEW;
    END IF;

    IF NEW.writing_context = 'assignment' AND NEW.mission_id IS NOT NULL THEN
        SELECT mission.repeat_bonus_enabled, mission.repeat_bonus_threshold,
               mission.repeat_bonus_reward, mission.repeat_bonus_max_count
        INTO v_enabled, v_threshold, v_reward, v_max_count
        FROM public.writing_missions mission
        WHERE mission.id = NEW.mission_id AND mission.class_id = NEW.class_id;
    ELSIF NEW.writing_context = 'self' AND NEW.self_writing_type IN ('reading_log', 'diary') THEN
        SELECT policy.repeat_bonus_enabled, policy.repeat_bonus_threshold,
               policy.repeat_bonus_reward, policy.repeat_bonus_max_count
        INTO v_enabled, v_threshold, v_reward, v_max_count
        FROM public.class_writing_policies policy
        WHERE policy.class_id = NEW.class_id
          AND policy.writing_type = NEW.self_writing_type;
    END IF;

    NEW.awarded_repeat_bonus_enabled := COALESCE(v_enabled, FALSE);
    NEW.awarded_repeat_bonus_threshold := CASE WHEN COALESCE(v_enabled, FALSE)
        THEN GREATEST(0, COALESCE(v_threshold, 0)) ELSE 0 END;
    NEW.awarded_repeat_bonus_reward := CASE WHEN COALESCE(v_enabled, FALSE)
        THEN GREATEST(0, COALESCE(v_reward, 0)) ELSE 0 END;
    NEW.awarded_repeat_bonus_max_count := CASE WHEN COALESCE(v_enabled, FALSE)
        THEN LEAST(20, GREATEST(0, COALESCE(v_max_count, 0))) ELSE 0 END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_student_post_repeat_bonus_v1 ON public.student_posts;
CREATE TRIGGER trg_snapshot_student_post_repeat_bonus_v1
BEFORE INSERT OR UPDATE OF is_submitted ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.snapshot_student_post_repeat_bonus_v1();

CREATE OR REPLACE FUNCTION public.guard_student_post_server_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user <> 'authenticated' THEN RETURN NEW; END IF;
    IF public.auth_user_role() IS DISTINCT FROM 'STUDENT' THEN RETURN NEW; END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.awarded_base_reward := NULL;
        NEW.awarded_bonus_reward := NULL;
        NEW.awarded_bonus_threshold := NULL;
        NEW.awarded_repeat_bonus_enabled := NULL;
        NEW.awarded_repeat_bonus_threshold := NULL;
        NEW.awarded_repeat_bonus_reward := NULL;
        NEW.awarded_repeat_bonus_max_count := NULL;
        NEW.is_submitted := FALSE;
        NEW.is_returned := FALSE;
        NEW.is_confirmed := FALSE;
        NEW.spell_check_used_at := NULL;
        NEW.spell_check_result := NULL;
    ELSE
        NEW.awarded_base_reward := OLD.awarded_base_reward;
        NEW.awarded_bonus_reward := OLD.awarded_bonus_reward;
        NEW.awarded_bonus_threshold := OLD.awarded_bonus_threshold;
        NEW.awarded_repeat_bonus_enabled := OLD.awarded_repeat_bonus_enabled;
        NEW.awarded_repeat_bonus_threshold := OLD.awarded_repeat_bonus_threshold;
        NEW.awarded_repeat_bonus_reward := OLD.awarded_repeat_bonus_reward;
        NEW.awarded_repeat_bonus_max_count := OLD.awarded_repeat_bonus_max_count;
        NEW.is_submitted := OLD.is_submitted;
        NEW.is_returned := OLD.is_returned;
        NEW.is_confirmed := OLD.is_confirmed;
        NEW.spell_check_used_at := OLD.spell_check_used_at;
        NEW.spell_check_result := OLD.spell_check_result;
    END IF;

    NEW.char_count := public.writing_content_char_count(COALESCE(NEW.content, ''));
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_assignment_post(
    p_post_id UUID,
    p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_runtime_role TEXT := current_setting('role', true);
    v_post public.student_posts%ROWTYPE;
    v_mission public.writing_missions%ROWTYPE;
    v_amount INTEGER;
    v_cycle INTEGER;
    v_point_result JSONB;
BEGIN
    SELECT post.* INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id
    FOR UPDATE;
    IF NOT FOUND OR v_post.writing_context <> 'assignment' OR v_post.mission_id IS NULL THEN
        RAISE EXCEPTION '승인할 과제 글을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_id IS NULL THEN
        IF v_runtime_role NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
            RAISE EXCEPTION '[보안] 글을 승인할 권한이 없습니다.' USING ERRCODE = '42501';
        END IF;
    ELSIF public.auth_user_role() <> 'ADMIN'
      AND NOT EXISTS (
          SELECT 1 FROM public.classes class
          WHERE class.id = v_post.class_id AND class.teacher_id = v_caller_id
      ) THEN
        RAISE EXCEPTION '[보안] 글을 승인할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF v_post.is_confirmed IS TRUE THEN
        RETURN jsonb_build_object('status', 'already_approved', 'post_id', v_post.id, 'points_awarded', 0);
    END IF;
    IF v_post.is_submitted IS NOT TRUE OR v_post.is_returned IS TRUE THEN
        RAISE EXCEPTION '제출 완료 상태의 글만 승인할 수 있습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT mission.* INTO v_mission
    FROM public.writing_missions mission
    WHERE mission.id = v_post.mission_id AND mission.class_id = v_post.class_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '글과 같은 학급의 과제를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF v_mission.mission_type = 'meeting' THEN
        RAISE EXCEPTION '회의 안건은 회의 전용 결정 RPC로 처리해야 합니다.' USING ERRCODE = '22023';
    END IF;

    v_amount := public.calculate_writing_reward_total_v1(
        COALESCE(v_post.awarded_base_reward, v_mission.base_reward, 0),
        v_mission.min_chars,
        v_post.char_count,
        COALESCE(v_post.awarded_bonus_threshold, v_mission.bonus_threshold, 0),
        COALESCE(v_post.awarded_bonus_reward, v_mission.bonus_reward, 0),
        COALESCE(v_post.awarded_repeat_bonus_enabled, v_mission.repeat_bonus_enabled, FALSE),
        COALESCE(v_post.awarded_repeat_bonus_threshold, v_mission.repeat_bonus_threshold, 0),
        COALESCE(v_post.awarded_repeat_bonus_reward, v_mission.repeat_bonus_reward, 0),
        COALESCE(v_post.awarded_repeat_bonus_max_count, v_mission.repeat_bonus_max_count, 0)
    );
    IF v_amount <= 0 THEN
        RAISE EXCEPTION '과제 보상이 0점이라 승인 포인트를 지급할 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.point_logs
    WHERE post_id = v_post.id AND mission_id = v_post.mission_id
      AND student_id = v_post.student_id AND amount = 0;

    UPDATE public.student_posts
    SET is_submitted = TRUE, is_confirmed = TRUE, is_returned = FALSE,
        ai_feedback = COALESCE(p_feedback, ai_feedback)
    WHERE id = v_post.id;

    SELECT count(*)::INTEGER + 1 INTO v_cycle
    FROM public.point_logs log
    WHERE log.post_id = v_post.id AND log.student_id = v_post.student_id
      AND log.mission_id = v_post.mission_id AND log.amount > 0
      AND log.reason ILIKE '%승인%';

    v_point_result := public.point_engine_apply(
        v_post.student_id, v_amount,
        format('[%s] 미션 승인 보상', v_mission.title),
        'writing_reward', format('assignment:%s:approve:%s', v_post.id, v_cycle),
        v_post.id, v_post.mission_id,
        jsonb_build_object('source', 'assignment_approval', 'cycle', v_cycle)
    );

    RETURN jsonb_build_object(
        'status', 'approved', 'post_id', v_post.id,
        'points_awarded', COALESCE((v_point_result->>'applied_amount')::INTEGER, 0),
        'total_points', (v_point_result->>'total_points')::INTEGER
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_assignment_post(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_assignment_post(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.award_self_writing_review_points_v1(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post RECORD;
    v_book_id UUID;
    v_source_key TEXT;
    v_type_label TEXT;
    v_policy_enabled BOOLEAN := TRUE;
    v_min_chars INTEGER := 0;
    v_daily_limit INTEGER := 1;
    v_rewarded_on_submission_day INTEGER := 0;
    v_points INTEGER := 0;
    v_status TEXT := 'no_reward';
    v_claim_id UUID;
    v_existing RECORD;
    v_point_result JSONB;
    v_total_points INTEGER := 0;
    v_day_start TIMESTAMPTZ;
    v_day_end TIMESTAMPTZ;
    v_policy_snapshot JSONB;
BEGIN
    SELECT post.id, post.student_id, post.class_id, post.self_writing_type,
           post.created_at, post.char_count,
           COALESCE(post.awarded_base_reward, 0) AS base_reward,
           COALESCE(post.awarded_bonus_threshold, 0) AS bonus_threshold,
           COALESCE(post.awarded_bonus_reward, 0) AS bonus_reward,
           COALESCE(post.awarded_repeat_bonus_enabled, FALSE) AS repeat_bonus_enabled,
           COALESCE(post.awarded_repeat_bonus_threshold, 0) AS repeat_bonus_threshold,
           COALESCE(post.awarded_repeat_bonus_reward, 0) AS repeat_bonus_reward,
           COALESCE(post.awarded_repeat_bonus_max_count, 0) AS repeat_bonus_max_count,
           post.structured_content
    INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id AND post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '보상할 자율 글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(student.total_points, 0) INTO v_total_points
    FROM public.students student
    WHERE student.id = v_post.student_id AND student.class_id = v_post.class_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '활성 학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF v_post.self_writing_type = 'reading_log' THEN
        SELECT item.book_id INTO v_book_id
        FROM public.reading_log_entries entry
        JOIN public.student_library_items item
          ON item.id = entry.library_item_id AND item.class_id = entry.class_id
         AND item.student_id = entry.student_id
        WHERE entry.post_id = v_post.id AND entry.class_id = v_post.class_id
          AND entry.student_id = v_post.student_id;
        v_source_key := COALESCE(v_book_id::TEXT, format('post:%s', v_post.id));
        v_type_label := '독서록';
    ELSE
        v_source_key := COALESCE(
            NULLIF(v_post.structured_content ->> 'diaryDate', ''),
            (v_post.created_at AT TIME ZONE 'Asia/Seoul')::DATE::TEXT
        );
        v_type_label := '일기';
    END IF;

    SELECT claim.id, claim.awarded_points, claim.reward_status INTO v_existing
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_post.student_id
      AND claim.writing_type = v_post.self_writing_type
      AND claim.reward_kind = 'completion'
      AND (claim.source_post_id = v_post.id OR claim.source_key = v_source_key)
    ORDER BY claim.created_at, claim.id LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'points_awarded', 0, 'reward_status', 'already_claimed',
            'original_reward_status', v_existing.reward_status,
            'original_points', v_existing.awarded_points, 'total_points', v_total_points
        );
    END IF;

    SELECT COALESCE(policy.is_enabled, TRUE), COALESCE(policy.min_chars, 0),
           GREATEST(1, COALESCE(policy.daily_reward_limit, 1))
    INTO v_policy_enabled, v_min_chars, v_daily_limit
    FROM public.class_writing_policies policy
    WHERE policy.class_id = v_post.class_id
      AND policy.writing_type = v_post.self_writing_type;
    v_policy_enabled := COALESCE(v_policy_enabled, TRUE);
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 1));

    v_day_start := ((v_post.created_at AT TIME ZONE 'Asia/Seoul')::DATE::TIMESTAMP AT TIME ZONE 'Asia/Seoul');
    v_day_end := v_day_start + INTERVAL '1 day';
    SELECT COUNT(*)::INTEGER INTO v_rewarded_on_submission_day
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_post.student_id AND claim.class_id = v_post.class_id
      AND claim.writing_type = v_post.self_writing_type AND claim.reward_kind = 'completion'
      AND claim.awarded_points > 0
      AND claim.created_at >= v_day_start AND claim.created_at < v_day_end;

    IF NOT v_policy_enabled THEN
        v_status := 'policy_disabled';
    ELSIF v_rewarded_on_submission_day >= v_daily_limit THEN
        v_status := 'daily_limit';
    ELSE
        v_points := public.calculate_writing_reward_total_v1(
            v_post.base_reward, v_min_chars, v_post.char_count,
            v_post.bonus_threshold, v_post.bonus_reward,
            v_post.repeat_bonus_enabled, v_post.repeat_bonus_threshold,
            v_post.repeat_bonus_reward, v_post.repeat_bonus_max_count
        );
        v_status := CASE WHEN v_points > 0 THEN 'awarded' ELSE 'no_reward' END;
    END IF;

    v_policy_snapshot := jsonb_build_object(
        'reward_gate', 'teacher_review', 'submitted_at', v_post.created_at,
        'daily_reward_limit', v_daily_limit, 'base_reward', v_post.base_reward,
        'bonus_threshold', v_post.bonus_threshold, 'bonus_reward', v_post.bonus_reward,
        'repeat_bonus_enabled', v_post.repeat_bonus_enabled,
        'repeat_bonus_threshold', v_post.repeat_bonus_threshold,
        'repeat_bonus_reward', v_post.repeat_bonus_reward,
        'repeat_bonus_max_count', v_post.repeat_bonus_max_count
    );

    INSERT INTO public.writing_reward_claims (
        class_id, student_id, writing_type, source_key, source_post_id,
        reward_kind, awarded_points, reward_status, policy_snapshot, created_at
    ) VALUES (
        v_post.class_id, v_post.student_id, v_post.self_writing_type,
        v_source_key, v_post.id, 'completion', v_points, v_status,
        v_policy_snapshot, v_post.created_at
    )
    ON CONFLICT (student_id, writing_type, source_key, reward_kind) DO NOTHING
    RETURNING id INTO v_claim_id;

    IF v_claim_id IS NULL THEN
        RETURN jsonb_build_object(
            'points_awarded', 0, 'reward_status', 'already_claimed',
            'total_points', v_total_points
        );
    END IF;

    IF v_points > 0 THEN
        v_point_result := public.point_engine_apply(
            v_post.student_id, v_points, format('%s 선생님 확인 보상', v_type_label),
            'writing_reward', format('self-writing-review:%s', v_post.id),
            v_post.id, NULL,
            jsonb_build_object('source', 'self_writing_teacher_review',
                'writing_type', v_post.self_writing_type)
        );
        v_total_points := COALESCE((v_point_result ->> 'total_points')::INTEGER, v_total_points);
    END IF;

    RETURN jsonb_build_object(
        'points_awarded', v_points, 'reward_status', v_status,
        'total_points', v_total_points
    );
END;
$$;

REVOKE ALL ON FUNCTION public.award_self_writing_review_points_v1(UUID)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.emit_assignment_status_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mission public.writing_missions%ROWTYPE;
    v_cycle INTEGER;
    v_points INTEGER := 0;
BEGIN
    IF NEW.writing_context <> 'assignment' OR NEW.mission_id IS NULL THEN RETURN NEW; END IF;
    SELECT mission.* INTO v_mission
    FROM public.writing_missions mission
    WHERE mission.id = NEW.mission_id AND mission.class_id = NEW.class_id;
    IF NOT FOUND THEN RETURN NEW; END IF;

    IF NEW.is_returned IS TRUE AND NEW.is_submitted IS FALSE
      AND NEW.is_confirmed IS FALSE AND NEW.recalled_at IS NULL
      AND (OLD.is_returned IS DISTINCT FROM TRUE
        OR OLD.is_submitted IS DISTINCT FROM FALSE
        OR OLD.is_confirmed IS DISTINCT FROM FALSE
        OR OLD.recalled_at IS NOT NULL) THEN
        SELECT count(*)::INTEGER + 1 INTO v_cycle
        FROM public.student_notification_events event
        WHERE event.student_id = NEW.student_id AND event.entity_id = NEW.id
          AND event.event_type = 'writing.rewrite_requested';
        PERFORM public.notification_emit_v1(
            NEW.student_id, 'writing', 'writing.rewrite_requested', 'student_post', NEW.id,
            jsonb_build_object('post_id', NEW.id, 'mission_id', NEW.mission_id,
                'post_title', NEW.title, 'mission_title', v_mission.title,
                'feedback', NEW.ai_feedback),
            format('writing:%s:rewrite:%s', NEW.id, v_cycle)
        );
    END IF;

    IF NEW.is_confirmed IS TRUE AND OLD.is_confirmed IS DISTINCT FROM TRUE THEN
        v_points := public.calculate_writing_reward_total_v1(
            COALESCE(NEW.awarded_base_reward, v_mission.base_reward, 0),
            v_mission.min_chars, NEW.char_count,
            COALESCE(NEW.awarded_bonus_threshold, v_mission.bonus_threshold, 0),
            COALESCE(NEW.awarded_bonus_reward, v_mission.bonus_reward, 0),
            COALESCE(NEW.awarded_repeat_bonus_enabled, v_mission.repeat_bonus_enabled, FALSE),
            COALESCE(NEW.awarded_repeat_bonus_threshold, v_mission.repeat_bonus_threshold, 0),
            COALESCE(NEW.awarded_repeat_bonus_reward, v_mission.repeat_bonus_reward, 0),
            COALESCE(NEW.awarded_repeat_bonus_max_count, v_mission.repeat_bonus_max_count, 0)
        );
        SELECT count(*)::INTEGER + 1 INTO v_cycle
        FROM public.point_logs log
        WHERE log.student_id = NEW.student_id AND log.post_id = NEW.id
          AND log.amount > 0 AND log.reason ILIKE '%승인%';
        PERFORM public.notification_emit_v1(
            NEW.student_id, 'writing', 'writing.approved', 'student_post', NEW.id,
            jsonb_build_object('post_id', NEW.id, 'mission_id', NEW.mission_id,
                'post_title', NEW.title, 'mission_title', v_mission.title,
                'point_delta', v_points),
            format('writing:%s:approved:%s', NEW.id, v_cycle)
        );
    END IF;

    IF NEW.is_confirmed IS FALSE AND OLD.is_confirmed IS TRUE THEN
        SELECT GREATEST(0, COALESCE(sum(log.amount), 0))::INTEGER INTO v_points
        FROM public.point_logs log
        WHERE log.student_id = NEW.student_id AND log.post_id = NEW.id
          AND log.mission_id = NEW.mission_id AND log.activity_type = 'writing_reward'
          AND log.reason ILIKE '%승인%';
        IF v_points = 0 THEN
            SELECT count(*)::INTEGER + 1 INTO v_cycle
            FROM public.student_notification_events event
            WHERE event.student_id = NEW.student_id AND event.entity_id = NEW.id
              AND event.event_type = 'writing.approval_recovered';
            PERFORM public.notification_emit_v1(
                NEW.student_id, 'writing', 'writing.approval_recovered', 'student_post', NEW.id,
                jsonb_build_object('post_id', NEW.id, 'mission_id', NEW.mission_id,
                    'post_title', NEW.title, 'mission_title', v_mission.title,
                    'point_delta', 0),
                format('writing:%s:recovered:%s', NEW.id, v_cycle)
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_assignment_status_notification_v1()
    FROM PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

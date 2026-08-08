-- 과제 승인 상태와 포인트 원장을 하나의 트랜잭션에서 함께 처리한다.
-- 클라이언트가 보낸 학생·과제·금액은 신뢰하지 않고 post_id에서 서버가 다시 계산한다.

BEGIN;

ALTER TABLE public.point_logs
    ADD COLUMN IF NOT EXISTS event_key TEXT,
    ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;

CREATE UNIQUE INDEX IF NOT EXISTS uq_point_logs_student_event_key
    ON public.point_logs (student_id, event_key)
    WHERE event_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_point_logs_class_activity_created
    ON public.point_logs (class_id, activity_type, created_at DESC);

-- 모든 콘텐츠 전용 RPC가 내부에서 호출하는 유일한 포인트 원장 엔진이다.
-- 클라이언트 실행 권한은 주지 않는다. 기능별 RPC가 권한·규칙을 확인한 뒤 호출한다.
CREATE OR REPLACE FUNCTION public.point_engine_apply(
    p_student_id UUID,
    p_amount INTEGER,
    p_reason TEXT,
    p_activity_type TEXT,
    p_event_key TEXT DEFAULT NULL,
    p_post_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_points INTEGER;
    v_class_id UUID;
    v_log_id UUID;
    v_existing_amount INTEGER;
    v_post_student_id UUID;
    v_post_mission_id UUID;
    v_post_class_id UUID;
BEGIN
    IF p_student_id IS NULL OR p_amount = 0 THEN
        RAISE EXCEPTION '학생과 0이 아닌 포인트가 필요합니다.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '포인트 사유는 1~200자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_activity_type NOT IN (
        'writing_reward', 'meeting_activity', 'vocab_tower', 'dragon_care',
        'hideout_purchase', 'starting_bonus', 'private_adjustment'
    ) THEN
        RAISE EXCEPTION '지원하지 않는 포인트 활동 유형입니다: %', p_activity_type USING ERRCODE = '22023';
    END IF;
    IF p_event_key IS NOT NULL AND char_length(p_event_key) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '중복 방지 키는 1~200자여야 합니다.' USING ERRCODE = '22023';
    END IF;
    IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
        RAISE EXCEPTION '포인트 부가 정보는 JSON 객체여야 합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT s.class_id, COALESCE(s.total_points, 0)
    INTO v_class_id, v_current_points
    FROM public.students s
    WHERE s.id = p_student_id AND s.deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '활성 학생 정보를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF p_post_id IS NOT NULL THEN
        SELECT sp.student_id, sp.mission_id, sp.class_id
        INTO v_post_student_id, v_post_mission_id, v_post_class_id
        FROM public.student_posts sp WHERE sp.id = p_post_id;
        IF NOT FOUND
          OR v_post_student_id IS DISTINCT FROM p_student_id
          OR v_post_class_id IS DISTINCT FROM v_class_id
          OR (p_mission_id IS NOT NULL AND v_post_mission_id IS DISTINCT FROM p_mission_id) THEN
            RAISE EXCEPTION '글·학생·과제 정보가 서로 일치하지 않습니다.' USING ERRCODE = '22023';
        END IF;
    END IF;

    IF p_event_key IS NOT NULL THEN
        SELECT pl.id, pl.amount
        INTO v_log_id, v_existing_amount
        FROM public.point_logs pl
        WHERE pl.student_id = p_student_id AND pl.event_key = p_event_key;
        IF FOUND THEN
            RETURN jsonb_build_object(
                'status', 'duplicate', 'duplicate', true, 'log_id', v_log_id,
                'applied_amount', 0, 'original_amount', v_existing_amount,
                'total_points', v_current_points, 'event_key', p_event_key
            );
        END IF;
    END IF;

    IF p_amount < 0 AND v_current_points + p_amount < 0 THEN
        RAISE EXCEPTION '보유 포인트가 부족합니다. 필요: %P, 현재: %P', abs(p_amount), v_current_points
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);
    UPDATE public.students
    SET total_points = v_current_points + p_amount
    WHERE id = p_student_id;

    INSERT INTO public.point_logs (
        student_id, amount, reason, activity_type, event_key, post_id, mission_id, metadata
    ) VALUES (
        p_student_id, p_amount, btrim(p_reason), p_activity_type, p_event_key,
        p_post_id, p_mission_id, p_metadata
    )
    RETURNING id INTO v_log_id;
    PERFORM set_config('app.bypass_student_trigger', 'false', true);

    RETURN jsonb_build_object(
        'status', 'applied', 'duplicate', false, 'log_id', v_log_id,
        'applied_amount', p_amount, 'total_points', v_current_points + p_amount,
        'event_key', p_event_key
    );
EXCEPTION WHEN unique_violation THEN
    -- 같은 event_key가 동시에 들어온 경우에도 한 번만 지급한다.
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    SELECT pl.id, pl.amount INTO v_log_id, v_existing_amount
    FROM public.point_logs pl
    WHERE pl.student_id = p_student_id AND pl.event_key = p_event_key;
    RETURN jsonb_build_object(
        'status', 'duplicate', 'duplicate', true, 'log_id', v_log_id,
        'applied_amount', 0, 'original_amount', v_existing_amount,
        'total_points', v_current_points, 'event_key', p_event_key
    );
WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.point_engine_apply(UUID, INTEGER, TEXT, TEXT, TEXT, UUID, UUID, JSONB)
    FROM PUBLIC, anon, authenticated, service_role;

-- 원장은 조회만 허용하고 쓰기는 SECURITY DEFINER 전용 RPC만 수행한다.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.point_logs FROM anon, authenticated;

-- 구형 범용 교사 함수도 화면에서 직접 호출하지 못하게 닫는다.
REVOKE ALL ON FUNCTION public.teacher_manage_points(UUID, INTEGER, TEXT)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.teacher_manage_points(UUID, INTEGER, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.increment_student_points(
    p_student_id UUID,
    p_amount INTEGER,
    p_reason TEXT DEFAULT '포인트 보상 🎁',
    p_post_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_runtime_role TEXT := current_setting('role', true);
    v_class_id UUID;
BEGIN
    SELECT s.class_id INTO v_class_id
    FROM public.students s
    WHERE s.id = p_student_id AND s.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_id IS NULL THEN
        IF v_runtime_role NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
            RAISE EXCEPTION '[보안] 포인트를 변경할 권한이 없습니다.' USING ERRCODE = '42501';
        END IF;
    ELSIF public.auth_user_role() <> 'ADMIN'
      AND NOT EXISTS (
          SELECT 1 FROM public.classes c
          WHERE c.id = v_class_id AND c.teacher_id = v_caller_id
      ) THEN
        RAISE EXCEPTION '[보안] 포인트를 변경할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM public.point_engine_apply(
        p_student_id, p_amount, p_reason,
        CASE WHEN p_post_id IS NOT NULL OR p_mission_id IS NOT NULL
            THEN 'writing_reward' ELSE 'private_adjustment' END,
        NULL, p_post_id, p_mission_id,
        jsonb_build_object('source', 'legacy_increment_student_points')
    );
END;
$$;

REVOKE ALL ON FUNCTION public.increment_student_points(UUID, INTEGER, TEXT, UUID, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_student_points(UUID, INTEGER, TEXT, UUID, UUID)
    TO service_role;

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
    v_base_reward INTEGER;
    v_bonus_threshold INTEGER;
    v_bonus_reward INTEGER;
    v_amount INTEGER;
    v_cycle INTEGER;
    v_point_result JSONB;
BEGIN
    SELECT sp.* INTO v_post
    FROM public.student_posts sp
    WHERE sp.id = p_post_id
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
          SELECT 1 FROM public.classes c
          WHERE c.id = v_post.class_id AND c.teacher_id = v_caller_id
      ) THEN
        RAISE EXCEPTION '[보안] 글을 승인할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF v_post.is_confirmed IS TRUE THEN
        RETURN jsonb_build_object('status', 'already_approved', 'post_id', v_post.id, 'points_awarded', 0);
    END IF;
    IF v_post.is_submitted IS NOT TRUE OR v_post.is_returned IS TRUE THEN
        RAISE EXCEPTION '제출 완료 상태의 글만 승인할 수 있습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT m.* INTO v_mission
    FROM public.writing_missions m
    WHERE m.id = v_post.mission_id
      AND m.class_id = v_post.class_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '글과 같은 학급의 과제를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF v_mission.mission_type = 'meeting' THEN
        RAISE EXCEPTION '회의 안건은 회의 전용 결정 RPC로 처리해야 합니다.' USING ERRCODE = '22023';
    END IF;

    v_base_reward := GREATEST(0, COALESCE(v_post.awarded_base_reward, v_mission.base_reward, 0));
    v_bonus_threshold := GREATEST(0, COALESCE(v_post.awarded_bonus_threshold, v_mission.bonus_threshold, 0));
    v_bonus_reward := GREATEST(0, COALESCE(v_post.awarded_bonus_reward, v_mission.bonus_reward, 0));
    v_amount := v_base_reward + CASE
        WHEN v_bonus_threshold > 0
         AND v_bonus_reward > 0
         AND COALESCE(v_post.char_count, 0) >= GREATEST(0, COALESCE(v_mission.min_chars, 0)) + v_bonus_threshold
        THEN v_bonus_reward ELSE 0 END;
    IF v_amount <= 0 THEN
        RAISE EXCEPTION '과제 보상이 0점이라 승인 포인트를 지급할 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    DELETE FROM public.point_logs
    WHERE post_id = v_post.id AND mission_id = v_post.mission_id
      AND student_id = v_post.student_id AND amount = 0;

    UPDATE public.student_posts
    SET is_submitted = TRUE,
        is_confirmed = TRUE,
        is_returned = FALSE,
        ai_feedback = COALESCE(p_feedback, ai_feedback)
    WHERE id = v_post.id;

    SELECT count(*)::INTEGER + 1 INTO v_cycle
    FROM public.point_logs pl
    WHERE pl.post_id = v_post.id AND pl.student_id = v_post.student_id
      AND pl.mission_id = v_post.mission_id AND pl.amount > 0
      AND pl.reason ILIKE '%승인%';

    v_point_result := public.point_engine_apply(
        v_post.student_id,
        v_amount,
        format('[%s] 미션 승인 보상%s', v_mission.title,
            CASE WHEN v_amount > v_base_reward THEN ' (보너스 달성! 🔥)' ELSE '' END),
        'writing_reward',
        format('assignment:%s:approve:%s', v_post.id, v_cycle),
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

CREATE OR REPLACE FUNCTION public.recover_assignment_post_approval(
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
    v_mission_title TEXT;
    v_net_reward INTEGER;
    v_cycle INTEGER;
    v_point_result JSONB;
BEGIN
    SELECT sp.* INTO v_post
    FROM public.student_posts sp
    WHERE sp.id = p_post_id
    FOR UPDATE;
    IF NOT FOUND OR v_post.writing_context <> 'assignment' OR v_post.mission_id IS NULL THEN
        RAISE EXCEPTION '승인을 취소할 과제 글을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF v_caller_id IS NULL THEN
        IF v_runtime_role NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
            RAISE EXCEPTION '[보안] 승인을 취소할 권한이 없습니다.' USING ERRCODE = '42501';
        END IF;
    ELSIF public.auth_user_role() <> 'ADMIN'
      AND NOT EXISTS (
          SELECT 1 FROM public.classes c
          WHERE c.id = v_post.class_id AND c.teacher_id = v_caller_id
      ) THEN
        RAISE EXCEPTION '[보안] 승인을 취소할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF v_post.is_confirmed IS NOT TRUE THEN
        RETURN jsonb_build_object('status', 'already_recovered', 'post_id', v_post.id, 'points_recovered', 0);
    END IF;

    SELECT m.title INTO v_mission_title
    FROM public.writing_missions m
    WHERE m.id = v_post.mission_id AND m.class_id = v_post.class_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '글과 같은 학급의 과제를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT GREATEST(0, COALESCE(sum(pl.amount), 0))::INTEGER
    INTO v_net_reward
    FROM public.point_logs pl
    WHERE pl.post_id = v_post.id
      AND pl.student_id = v_post.student_id
      AND pl.mission_id = v_post.mission_id
      AND pl.activity_type = 'writing_reward'
      AND pl.reason ILIKE '%승인%';

    UPDATE public.student_posts
    SET is_confirmed = FALSE,
        is_submitted = TRUE,
        ai_feedback = COALESCE(p_feedback, ai_feedback)
    WHERE id = v_post.id;

    IF v_net_reward > 0 THEN
        SELECT count(*)::INTEGER + 1 INTO v_cycle
        FROM public.point_logs pl
        WHERE pl.post_id = v_post.id AND pl.student_id = v_post.student_id
          AND pl.mission_id = v_post.mission_id AND pl.amount < 0
          AND pl.reason ILIKE '%승인 취소%';

        v_point_result := public.point_engine_apply(
            v_post.student_id,
            -v_net_reward,
            format('[%s] 승인 취소로 인한 포인트 회수 ⚠️', v_mission_title),
            'writing_reward',
            format('assignment:%s:recover:%s', v_post.id, v_cycle),
            v_post.id, v_post.mission_id,
            jsonb_build_object('source', 'assignment_recovery', 'cycle', v_cycle)
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'recovered', 'post_id', v_post.id,
        'points_recovered', CASE WHEN v_net_reward > 0
            THEN abs(COALESCE((v_point_result->>'applied_amount')::INTEGER, 0)) ELSE 0 END,
        'total_points', CASE WHEN v_net_reward > 0 THEN (v_point_result->>'total_points')::INTEGER ELSE NULL END
    );
END;
$$;

REVOKE ALL ON FUNCTION public.recover_assignment_post_approval(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.recover_assignment_post_approval(UUID, TEXT) TO authenticated, service_role;

-- 기존 함수는 RETURNS void라 반환형을 JSONB로 바꾸기 전에 같은 시그니처를 제거한다.
DROP FUNCTION IF EXISTS public.bulk_approve_posts(JSONB);

CREATE FUNCTION public.bulk_approve_posts(p_submissions JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_result JSONB;
    v_approved INTEGER := 0;
    v_already INTEGER := 0;
    v_points INTEGER := 0;
BEGIN
    IF jsonb_typeof(p_submissions) <> 'array' OR jsonb_array_length(p_submissions) NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION '승인할 글은 한 번에 1~100건이어야 합니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_submissions)
    LOOP
        v_result := public.approve_assignment_post((v_item->>'post_id')::UUID, NULL);
        IF v_result->>'status' = 'approved' THEN
            v_approved := v_approved + 1;
            v_points := v_points + COALESCE((v_result->>'points_awarded')::INTEGER, 0);
        ELSE
            v_already := v_already + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'completed', 'approved_count', v_approved,
        'already_approved_count', v_already, 'points_awarded', v_points
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_approve_posts(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_approve_posts(JSONB) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.bulk_recover_assignment_posts(
    p_post_ids UUID[],
    p_feedback TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post_id UUID;
    v_result JSONB;
    v_recovered INTEGER := 0;
    v_already INTEGER := 0;
    v_points INTEGER := 0;
BEGIN
    IF COALESCE(cardinality(p_post_ids), 0) NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION '회수할 글은 한 번에 1~100건이어야 합니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_post_id IN SELECT DISTINCT value FROM unnest(p_post_ids) AS value ORDER BY value
    LOOP
        v_result := public.recover_assignment_post_approval(v_post_id, p_feedback);
        IF v_result->>'status' = 'recovered' THEN
            v_recovered := v_recovered + 1;
            v_points := v_points + COALESCE((v_result->>'points_recovered')::INTEGER, 0);
        ELSE
            v_already := v_already + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', 'completed', 'recovered_count', v_recovered,
        'already_recovered_count', v_already, 'points_recovered', v_points
    );
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_recover_assignment_posts(UUID[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.bulk_recover_assignment_posts(UUID[], TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.teacher_manage_points_bulk(UUID[], INTEGER, TEXT);

CREATE FUNCTION public.teacher_manage_points_bulk(
    p_student_ids UUID[],
    p_amount INTEGER,
    p_reason TEXT,
    p_request_id UUID DEFAULT gen_random_uuid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_count INTEGER;
    v_student_id UUID;
    v_result JSONB;
    v_applied_count INTEGER := 0;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    p_request_id := COALESCE(p_request_id, gen_random_uuid());
    IF COALESCE(cardinality(p_student_ids), 0) NOT BETWEEN 1 AND 100 OR p_amount = 0 THEN
        RAISE EXCEPTION '학생 1~100명과 0이 아닌 포인트를 입력해주세요.' USING ERRCODE = '22023';
    END IF;
    IF char_length(btrim(COALESCE(p_reason, ''))) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION '포인트 사유는 1~200자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_count FROM (SELECT DISTINCT unnest(p_student_ids)) ids;
    IF v_count <> cardinality(p_student_ids) THEN
        RAISE EXCEPTION '학생 목록에 중복된 값이 있습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.students s
    JOIN public.classes c ON c.id = s.class_id
    WHERE s.id = ANY(p_student_ids)
      AND s.deleted_at IS NULL
      AND (c.teacher_id = v_caller_id OR public.auth_user_role() = 'ADMIN')
    ;
    IF v_count <> cardinality(p_student_ids) THEN
        RAISE EXCEPTION '관리 권한이 없거나 삭제된 학생이 포함되어 있습니다.' USING ERRCODE = '42501';
    END IF;

    FOR v_student_id IN SELECT DISTINCT value FROM unnest(p_student_ids) AS value ORDER BY value
    LOOP
        v_result := public.point_engine_apply(
            v_student_id, p_amount, p_reason, 'private_adjustment',
            format('teacher-adjustment:%s:%s', p_request_id, v_student_id),
            NULL, NULL,
            jsonb_build_object('source', 'teacher_adjustment', 'request_id', p_request_id)
        );
        IF v_result->>'status' = 'applied' THEN
            v_applied_count := v_applied_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'status', CASE WHEN v_applied_count = 0 THEN 'duplicate' ELSE 'completed' END,
        'student_count', v_count, 'applied_count', v_applied_count,
        'points_each', p_amount, 'request_id', p_request_id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.teacher_manage_points_bulk(UUID[], INTEGER, TEXT, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teacher_manage_points_bulk(UUID[], INTEGER, TEXT, UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_point_manager_snapshot(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_students JSONB;
BEGIN
    IF auth.uid() IS NULL OR (
        public.auth_user_role() <> 'ADMIN'
        AND NOT EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
        )
    ) THEN
        RAISE EXCEPTION '이 학급의 포인트 정보를 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH scoped_students AS (
        SELECT s.id, s.name, s.total_points, s.student_code, s.created_at, s.pet_data, s.class_id
        FROM public.students s
        WHERE s.class_id = p_class_id AND s.deleted_at IS NULL
        ORDER BY s.name
        LIMIT 200
    ), point_stats AS (
        SELECT pl.student_id,
            COALESCE(sum(pl.amount) FILTER (WHERE pl.amount > 0), 0)::BIGINT AS score_all,
            COALESCE(sum(pl.amount) FILTER (
                WHERE pl.amount > 0 AND pl.created_at >= now() - interval '7 days'
            ), 0)::BIGINT AS score_week,
            COALESCE(sum(pl.amount) FILTER (
                WHERE pl.amount > 0 AND pl.created_at >= now() - interval '30 days'
            ), 0)::BIGINT AS score_month
        FROM public.point_logs pl
        WHERE pl.class_id = p_class_id
        GROUP BY pl.student_id
    )
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', student.id,
        'name', student.name,
        'total_points', COALESCE(student.total_points, 0),
        'student_code', student.student_code,
        'created_at', student.created_at,
        'pet_data', student.pet_data,
        'class_id', student.class_id,
        'activity_score', COALESCE(stats.score_all, 0),
        'score_all', COALESCE(stats.score_all, 0),
        'score_week', COALESCE(stats.score_week, 0),
        'score_month', COALESCE(stats.score_month, 0)
    ) ORDER BY student.name), '[]'::JSONB)
    INTO v_students
    FROM scoped_students student
    LEFT JOIN point_stats stats ON stats.student_id = student.id;

    RETURN jsonb_build_object('status', 'ok', 'class_id', p_class_id, 'students', v_students);
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_point_manager_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_point_manager_snapshot(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_student_point_history(
    p_student_id UUID,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_logs JSONB;
BEGIN
    SELECT s.class_id INTO v_class_id
    FROM public.students s WHERE s.id = p_student_id AND s.deleted_at IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF auth.uid() IS NULL OR (
        public.auth_user_role() <> 'ADMIN'
        AND NOT EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = v_class_id AND c.teacher_id = auth.uid()
        )
    ) THEN
        RAISE EXCEPTION '학생의 포인트 내역을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(log_row) ORDER BY log_row.created_at DESC), '[]'::JSONB)
    INTO v_logs
    FROM (
        SELECT pl.id, pl.amount, pl.reason, pl.activity_type, pl.created_at,
               pl.student_id, pl.event_key, pl.metadata
        FROM public.point_logs pl
        WHERE pl.class_id = v_class_id AND pl.student_id = p_student_id
        ORDER BY pl.created_at DESC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 100)
        OFFSET GREATEST(COALESCE(p_offset, 0), 0)
    ) log_row;

    RETURN jsonb_build_object('status', 'ok', 'student_id', p_student_id, 'logs', v_logs);
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_student_point_history(UUID, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_student_point_history(UUID, INTEGER, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.add_student_with_bonus(
    p_class_id UUID,
    p_name TEXT,
    p_student_code TEXT,
    p_initial_points INTEGER DEFAULT 100
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
BEGIN
    IF auth.uid() IS NULL OR (
        public.auth_user_role() <> 'ADMIN'
        AND NOT EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = p_class_id AND c.teacher_id = auth.uid() AND c.deleted_at IS NULL
        )
    ) THEN
        RAISE EXCEPTION '이 학급에 학생을 추가할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF char_length(btrim(COALESCE(p_name, ''))) NOT BETWEEN 1 AND 30 THEN
        RAISE EXCEPTION '학생 이름은 1~30자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_initial_points NOT BETWEEN 0 AND 10000 THEN
        RAISE EXCEPTION '시작 포인트는 0~10,000P 사이여야 합니다.' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.students (class_id, name, student_code, total_points)
    VALUES (p_class_id, btrim(p_name), p_student_code, 0)
    RETURNING id INTO v_student_id;

    IF p_initial_points > 0 THEN
        PERFORM public.point_engine_apply(
            v_student_id, p_initial_points, '신규 등록 기념 환영 포인트! 🎁', 'starting_bonus',
            format('student:%s:welcome', v_student_id), NULL, NULL,
            jsonb_build_object('source', 'student_registration')
        );
    END IF;

    RETURN v_student_id;
END;
$$;

REVOKE ALL ON FUNCTION public.add_student_with_bonus(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_student_with_bonus(UUID, TEXT, TEXT, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_meeting_idea_status(
    p_post_id UUID,
    p_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_mission public.writing_missions%ROWTYPE;
    v_was_decided BOOLEAN;
    v_is_decided BOOLEAN;
    v_eligible BOOLEAN;
    v_reward INTEGER;
    v_net_reward INTEGER;
    v_had_reward BOOLEAN;
    v_point_result JSONB;
BEGIN
    IF p_status NOT IN ('제안중', '검토중', '결정됨') THEN
        RAISE EXCEPTION '지원하지 않는 회의 안건 상태입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT sp.* INTO v_post
    FROM public.student_posts sp WHERE sp.id = p_post_id
    FOR UPDATE;
    IF NOT FOUND OR v_post.mission_id IS NULL THEN
        RAISE EXCEPTION '회의 안건 글을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    SELECT m.* INTO v_mission
    FROM public.writing_missions m
    WHERE m.id = v_post.mission_id AND m.class_id = v_post.class_id AND m.mission_type = 'meeting';
    IF NOT FOUND THEN
        RAISE EXCEPTION '회의 안건 미션을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF auth.uid() IS NULL OR (
        public.auth_user_role() <> 'ADMIN'
        AND NOT EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = v_post.class_id AND c.teacher_id = auth.uid()
        )
    ) THEN
        RAISE EXCEPTION '회의 안건을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_was_decided := COALESCE(v_post.status, '제안중') = '결정됨';
    v_is_decided := p_status = '결정됨';
    v_reward := GREATEST(0, COALESCE(v_mission.bonus_reward, 50));
    v_eligible := COALESCE(v_post.char_count, 0) >=
        GREATEST(0, COALESCE(v_mission.min_chars, 100)) + GREATEST(0, COALESCE(v_mission.bonus_threshold, 0));

    SELECT EXISTS (
        SELECT 1 FROM public.point_logs pl
        WHERE pl.post_id = v_post.id AND pl.student_id = v_post.student_id
          AND pl.mission_id = v_post.mission_id AND pl.amount > 0
          AND pl.reason ILIKE '%안건 결정%'
    ) INTO v_had_reward;

    SELECT GREATEST(0, COALESCE(sum(pl.amount), 0))::INTEGER INTO v_net_reward
    FROM public.point_logs pl
    WHERE pl.post_id = v_post.id AND pl.student_id = v_post.student_id
      AND pl.mission_id = v_post.mission_id AND pl.reason ILIKE '%안건 결정%';

    UPDATE public.student_posts
    SET status = p_status,
        is_confirmed = v_is_decided,
        is_submitted = CASE WHEN v_is_decided THEN TRUE ELSE is_submitted END,
        is_returned = CASE WHEN v_is_decided THEN FALSE ELSE is_returned END
    WHERE id = v_post.id;

    IF v_is_decided AND NOT v_was_decided AND v_eligible AND v_reward > 0 AND NOT v_had_reward THEN
        v_point_result := public.point_engine_apply(
            v_post.student_id, v_reward,
            format('회의 안건 결정! "%s" 🏛️✅', left(COALESCE(v_post.title, ''), 20)),
            'meeting_activity', format('meeting:%s:decision-reward', v_post.id),
            v_post.id, v_post.mission_id,
            jsonb_build_object('source', 'meeting_decision')
        );
    ELSIF v_was_decided AND NOT v_is_decided AND v_net_reward > 0 THEN
        v_point_result := public.point_engine_apply(
            v_post.student_id, -v_net_reward,
            format('회의 안건 결정 취소로 인한 포인트 회수 ⚠️ "%s"', left(COALESCE(v_post.title, ''), 20)),
            'meeting_activity', format('meeting:%s:decision-recovery', v_post.id),
            v_post.id, v_post.mission_id,
            jsonb_build_object('source', 'meeting_decision_recovery')
        );
    END IF;

    RETURN jsonb_build_object(
        'status', 'updated', 'post_id', v_post.id, 'idea_status', p_status,
        'reward_eligible', v_eligible,
        'points_awarded', CASE WHEN v_is_decided THEN GREATEST(0, COALESCE((v_point_result->>'applied_amount')::INTEGER, 0)) ELSE 0 END,
        'points_recovered', CASE WHEN NOT v_is_decided THEN abs(LEAST(0, COALESCE((v_point_result->>'applied_amount')::INTEGER, 0))) ELSE 0 END,
        'already_rewarded', v_had_reward
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_meeting_idea_status(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_meeting_idea_status(UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.withdraw_my_teacher_account()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_teacher_id UUID := auth.uid();
    v_class_count INTEGER;
BEGIN
    IF v_teacher_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.profiles p WHERE p.id = v_teacher_id AND p.role = 'TEACHER'
    ) THEN
        RAISE EXCEPTION '교사 계정으로 로그인해야 합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT count(*)::INTEGER INTO v_class_count
    FROM public.classes c WHERE c.teacher_id = v_teacher_id;

    DELETE FROM public.point_logs WHERE teacher_id = v_teacher_id;
    DELETE FROM public.classes WHERE teacher_id = v_teacher_id;
    DELETE FROM public.teachers WHERE id = v_teacher_id;
    DELETE FROM public.profiles WHERE id = v_teacher_id;
    DELETE FROM auth.users WHERE id = v_teacher_id;

    RETURN jsonb_build_object('status', 'withdrawn', 'removed_classes', v_class_count);
END;
$$;

REVOKE ALL ON FUNCTION public.withdraw_my_teacher_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_my_teacher_account() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

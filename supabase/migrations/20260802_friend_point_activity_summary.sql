-- ============================================================================
-- 친구 아지트 포인트 활동 요약
-- - 원문 reason/잔액/교사 조정 내역은 친구에게 공개하지 않는다.
-- - 기계 판독용 activity_type으로 공개 가능한 활동 횟수만 집계한다.
-- - 학생의 point_logs 직접 조회는 본인 행으로 제한한다.
-- ============================================================================

BEGIN;

ALTER TABLE public.point_logs
    ADD COLUMN IF NOT EXISTS activity_type TEXT;

UPDATE public.point_logs
SET activity_type = CASE
    WHEN mission_id IS NOT NULL OR post_id IS NOT NULL
        THEN 'writing_reward'
    WHEN COALESCE(reason, '') ILIKE '%어휘의 탑%'
        THEN 'vocab_tower'
    WHEN COALESCE(reason, '') ILIKE '%드래곤 먹이주기%'
        THEN 'dragon_care'
    WHEN COALESCE(reason, '') ILIKE '%아지트 배경 구매%'
        THEN 'hideout_purchase'
    WHEN COALESCE(reason, '') ILIKE '%회의%' OR COALESCE(reason, '') ILIKE '%아이디어%'
        THEN 'meeting_activity'
    WHEN COALESCE(reason, '') ILIKE '%신규 등록%' OR COALESCE(reason, '') ILIKE '%환영 포인트%'
        THEN 'starting_bonus'
    ELSE 'private_adjustment'
END
WHERE activity_type IS NULL;

ALTER TABLE public.point_logs
    ALTER COLUMN activity_type SET DEFAULT NULL,
    ALTER COLUMN activity_type SET NOT NULL;

ALTER TABLE public.point_logs
    DROP CONSTRAINT IF EXISTS point_logs_activity_type_check;
ALTER TABLE public.point_logs
    ADD CONSTRAINT point_logs_activity_type_check CHECK (activity_type IN (
        'writing_reward',
        'meeting_activity',
        'vocab_tower',
        'dragon_care',
        'hideout_purchase',
        'starting_bonus',
        'private_adjustment'
    ));

CREATE INDEX IF NOT EXISTS idx_point_logs_student_activity_created
    ON public.point_logs (student_id, activity_type, created_at DESC);

CREATE OR REPLACE FUNCTION public.classify_point_log_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF NEW.activity_type IS NULL THEN
        NEW.activity_type := CASE
            WHEN NEW.mission_id IS NOT NULL OR NEW.post_id IS NOT NULL
                THEN 'writing_reward'
            WHEN COALESCE(NEW.reason, '') ILIKE '%어휘의 탑%'
                THEN 'vocab_tower'
            WHEN COALESCE(NEW.reason, '') ILIKE '%드래곤 먹이주기%'
                THEN 'dragon_care'
            WHEN COALESCE(NEW.reason, '') ILIKE '%아지트 배경 구매%'
                THEN 'hideout_purchase'
            WHEN COALESCE(NEW.reason, '') ILIKE '%회의%' OR COALESCE(NEW.reason, '') ILIKE '%아이디어%'
                THEN 'meeting_activity'
            WHEN COALESCE(NEW.reason, '') ILIKE '%신규 등록%' OR COALESCE(NEW.reason, '') ILIKE '%환영 포인트%'
                THEN 'starting_bonus'
            ELSE 'private_adjustment'
        END;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_point_log_activity ON public.point_logs;
CREATE TRIGGER trg_classify_point_log_activity
BEFORE INSERT ON public.point_logs
FOR EACH ROW EXECUTE FUNCTION public.classify_point_log_activity();

-- 교사 수동 조정은 사유 문구와 무관하게 항상 비공개 유형으로 기록한다.
CREATE OR REPLACE FUNCTION public.teacher_manage_points(
    target_student_id UUID,
    points_amount INTEGER,
    reason_text TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_caller_id UUID := auth.uid();
    v_current_points INTEGER;
    v_is_authorized BOOLEAN := false;
BEGIN
    IF v_caller_id IS NULL THEN
        v_is_authorized := current_setting('role', true) = 'service_role';
    ELSE
        SELECT EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = v_caller_id AND role = 'ADMIN'
        ) INTO v_is_authorized;

        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1
                FROM public.students s
                JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = target_student_id
                  AND c.teacher_id = v_caller_id
                  AND s.deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 포인트를 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(total_points, 0)
    INTO v_current_points
    FROM public.students
    WHERE id = target_student_id;

    IF v_current_points IS NULL THEN
        RAISE EXCEPTION '학생 정보를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF points_amount < 0 AND (v_current_points + points_amount) < 0 THEN
        RAISE EXCEPTION '보유 포인트가 부족하여 회수할 수 없습니다. (현재: % P)', v_current_points
            USING ERRCODE = 'P0001';
    END IF;

    PERFORM set_config('app.bypass_student_trigger', 'true', true);

    UPDATE public.students
    SET total_points = GREATEST(0, COALESCE(total_points, 0) + points_amount)
    WHERE id = target_student_id;

    INSERT INTO public.point_logs (student_id, reason, amount, activity_type)
    VALUES (target_student_id, reason_text, points_amount, 'private_adjustment');

    PERFORM set_config('app.bypass_student_trigger', 'false', true);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_student_trigger', 'false', true);
    RAISE;
END;
$$;

DROP POLICY IF EXISTS "Point_Logs_Select_V18" ON public.point_logs;
DROP POLICY IF EXISTS "Point_Logs_Insert_V18" ON public.point_logs;
DROP POLICY IF EXISTS "Point_Logs_Update_V18" ON public.point_logs;

CREATE POLICY "Point_Logs_Select_V20"
ON public.point_logs FOR SELECT TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR student_id = public.auth_student_id()
    OR EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = point_logs.class_id AND teacher_id = auth.uid()
    )
);

CREATE POLICY "Point_Logs_Insert_V20"
ON public.point_logs FOR INSERT TO authenticated
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = point_logs.class_id AND teacher_id = auth.uid()
    )
);

CREATE POLICY "Point_Logs_Update_V20"
ON public.point_logs FOR UPDATE TO authenticated
USING (
    public.auth_user_role() = 'ADMIN'
    OR EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = point_logs.class_id AND teacher_id = auth.uid()
    )
)
WITH CHECK (
    public.auth_user_role() = 'ADMIN'
    OR EXISTS (
        SELECT 1 FROM public.classes
        WHERE id = point_logs.class_id AND teacher_id = auth.uid()
    )
);

CREATE OR REPLACE FUNCTION public.get_friend_point_activity_summary(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_viewer_id UUID := public.auth_student_id();
    v_viewer_class_id UUID;
    v_target_name TEXT;
    v_writing_reward_count INTEGER := 0;
    v_meeting_activity_count INTEGER := 0;
    v_vocab_reward_count INTEGER := 0;
    v_dragon_care_count INTEGER := 0;
    v_hideout_purchase_count INTEGER := 0;
    v_last_public_activity_at TIMESTAMPTZ;
BEGIN
    IF v_viewer_id IS NULL OR p_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT class_id INTO v_viewer_class_id
    FROM public.students
    WHERE id = v_viewer_id
      AND auth_id = auth.uid()
      AND is_active IS DISTINCT FROM false
      AND (deleted_at IS NULL OR deleted_at > NOW());

    SELECT name INTO v_target_name
    FROM public.students
    WHERE id = p_student_id
      AND class_id = v_viewer_class_id
      AND is_active IS DISTINCT FROM false
      AND (deleted_at IS NULL OR deleted_at > NOW());

    IF v_viewer_class_id IS NULL OR v_target_name IS NULL THEN
        RAISE EXCEPTION '같은 반 친구의 활동만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    WITH writing_groups AS (
        SELECT COALESCE(post_id::TEXT, mission_id::TEXT, id::TEXT) AS reward_key,
               sum(amount) AS net_amount
        FROM public.point_logs
        WHERE student_id = p_student_id
          AND activity_type = 'writing_reward'
        GROUP BY COALESCE(post_id::TEXT, mission_id::TEXT, id::TEXT)
    )
    SELECT count(*)::INTEGER
    INTO v_writing_reward_count
    FROM writing_groups
    WHERE net_amount > 0;

    SELECT
        count(*) FILTER (WHERE activity_type = 'meeting_activity' AND amount > 0)::INTEGER,
        count(*) FILTER (WHERE activity_type = 'vocab_tower' AND amount > 0)::INTEGER,
        count(*) FILTER (WHERE activity_type = 'dragon_care' AND amount < 0)::INTEGER,
        count(*) FILTER (WHERE activity_type = 'hideout_purchase' AND amount < 0)::INTEGER,
        max(created_at) FILTER (WHERE activity_type IN (
            'writing_reward', 'meeting_activity', 'vocab_tower', 'dragon_care', 'hideout_purchase'
        ))
    INTO
        v_meeting_activity_count,
        v_vocab_reward_count,
        v_dragon_care_count,
        v_hideout_purchase_count,
        v_last_public_activity_at
    FROM public.point_logs
    WHERE student_id = p_student_id;

    RETURN jsonb_build_object(
        'student_name', v_target_name,
        'writing_reward_count', COALESCE(v_writing_reward_count, 0),
        'meeting_activity_count', COALESCE(v_meeting_activity_count, 0),
        'vocab_reward_count', COALESCE(v_vocab_reward_count, 0),
        'dragon_care_count', COALESCE(v_dragon_care_count, 0),
        'hideout_purchase_count', COALESCE(v_hideout_purchase_count, 0),
        'last_public_activity_at', v_last_public_activity_at
    );
END;
$$;

REVOKE ALL ON FUNCTION public.classify_point_log_activity()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_friend_point_activity_summary(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_point_activity_summary(UUID)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

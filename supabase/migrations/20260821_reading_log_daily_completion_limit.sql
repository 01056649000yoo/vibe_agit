-- ============================================================================
-- 독서록 하루 작성 완료 상한 + 학생용 오늘 현황
--
-- 기존 daily_reward_limit를 "보상을 받을 수 있는 편수"가 아니라 새 독서록을
-- 작성 완료할 수 있는 편수로 사용한다. 완료 원장을 기준으로 세므로 글을 지워도
-- 당일 사용 편수는 복구되지 않으며, 학생 행 잠금으로 동시 완료도 직렬화한다.
-- ============================================================================

BEGIN;

-- 배포 당일 이미 완료했지만 보상 원장이 없는 독서록도 오늘 사용 편수에 포함한다.
INSERT INTO public.writing_reward_claims (
    class_id, student_id, writing_type, source_key, source_post_id,
    reward_kind, awarded_points, reward_status, policy_snapshot, created_at
)
SELECT
    p.class_id,
    p.student_id,
    'reading_log',
    rle.library_item_id::TEXT,
    p.id,
    'completion',
    0,
    'no_reward',
    jsonb_build_object(
        'migration_backfill', true,
        'daily_reward_limit', COALESCE(policy.daily_reward_limit, 3)
    ),
    p.created_at
FROM public.student_posts p
JOIN public.reading_log_entries rle
  ON rle.post_id = p.id
 AND rle.class_id = p.class_id
LEFT JOIN public.class_writing_policies policy
  ON policy.class_id = p.class_id
 AND policy.writing_type = 'reading_log'
WHERE p.writing_context = 'self'
  AND p.self_writing_type = 'reading_log'
  AND p.created_at >= (
      date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
  )
ON CONFLICT (student_id, writing_type, source_key, reward_kind) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_my_reading_log_daily_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_daily_limit INTEGER := 3;
    v_completed_today INTEGER := 0;
BEGIN
    v_student_id := public.auth_student_id();
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT s.class_id
    INTO v_class_id
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.auth_id = auth.uid()
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW());

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT GREATEST(1, COALESCE(policy.daily_reward_limit, 3))
    INTO v_daily_limit
    FROM public.class_writing_policies policy
    WHERE policy.class_id = v_class_id
      AND policy.writing_type = 'reading_log';

    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 3));

    SELECT count(*)::INTEGER
    INTO v_completed_today
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_student_id
      AND claim.class_id = v_class_id
      AND claim.writing_type = 'reading_log'
      AND claim.reward_kind = 'completion'
      AND claim.created_at >= (
          date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
      );

    RETURN jsonb_build_object(
        'daily_limit', v_daily_limit,
        'completed_today', v_completed_today,
        'remaining_today', GREATEST(0, v_daily_limit - v_completed_today),
        'can_complete', v_completed_today < v_daily_limit
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reading_log_daily_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_reading_log_daily_status() TO authenticated, service_role;

-- 20260820의 분량·보상 래퍼를 내부 구현으로 보존한다.
DO $$
BEGIN
    IF to_regprocedure('public.upsert_my_reading_log_rewarded(uuid,jsonb,text,text,text,text)') IS NULL THEN
        ALTER FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
            RENAME TO upsert_my_reading_log_rewarded;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_reading_log_rewarded(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.upsert_my_reading_log(
    p_post_id UUID,
    p_book JSONB,
    p_title TEXT,
    p_content TEXT,
    p_visibility TEXT DEFAULT 'private',
    p_reading_status TEXT DEFAULT 'completed'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_class_id UUID;
    v_daily_limit INTEGER := 3;
    v_completed_today INTEGER := 0;
BEGIN
    v_student_id := public.auth_student_id();
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    -- 같은 학생의 새 독서록 완료를 직렬화해 제한을 동시에 넘지 못하게 한다.
    SELECT s.class_id
    INTO v_class_id
    FROM public.students s
    WHERE s.id = v_student_id
      AND s.auth_id = auth.uid()
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    FOR UPDATE;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    -- 완료된 기존 글의 수정은 새 편수로 세지 않는다.
    IF p_post_id IS NULL THEN
        SELECT GREATEST(1, COALESCE(policy.daily_reward_limit, 3))
        INTO v_daily_limit
        FROM public.class_writing_policies policy
        WHERE policy.class_id = v_class_id
          AND policy.writing_type = 'reading_log';

        v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 3));

        SELECT count(*)::INTEGER
        INTO v_completed_today
        FROM public.writing_reward_claims claim
        WHERE claim.student_id = v_student_id
          AND claim.class_id = v_class_id
          AND claim.writing_type = 'reading_log'
          AND claim.reward_kind = 'completion'
          AND claim.created_at >= (
              date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul'
          );

        IF v_completed_today >= v_daily_limit THEN
            RAISE EXCEPTION '오늘 완료할 수 있는 독서록은 최대 %편이에요. 새 독서록은 내일 다시 작성할 수 있어요.', v_daily_limit
                USING ERRCODE = 'P0001';
        END IF;
    END IF;

    RETURN public.upsert_my_reading_log_rewarded(
        p_post_id, p_book, p_title, p_content, p_visibility, p_reading_status
    );
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_my_reading_log(UUID, JSONB, TEXT, TEXT, TEXT, TEXT)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

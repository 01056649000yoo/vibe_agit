-- 학급별 일기 사용 여부를 기존 class_writing_policies.is_enabled 와 학생 화면·저장 RPC에 연결한다.
-- OFF는 학생 노출과 새 작성/수정만 막는다. 기존 완성 글·초안·보상 원장은 삭제하지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.prevent_disabled_diary_writes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.writing_context = 'self'
       AND NEW.self_writing_type = 'diary'
       AND EXISTS (
            SELECT 1
            FROM public.class_writing_policies policy
            WHERE policy.class_id = NEW.class_id
              AND policy.writing_type = 'diary'
              AND policy.is_enabled = false
       ) THEN
        RAISE EXCEPTION '지금은 이 학급에서 일기 쓰기를 사용하지 않아요.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_disabled_diary_posts ON public.student_posts;
CREATE TRIGGER trg_prevent_disabled_diary_posts
BEFORE INSERT OR UPDATE ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.prevent_disabled_diary_writes();

CREATE OR REPLACE FUNCTION public.prevent_disabled_diary_drafts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.writing_type = 'diary'
       AND EXISTS (
            SELECT 1
            FROM public.class_writing_policies policy
            WHERE policy.class_id = NEW.class_id
              AND policy.writing_type = 'diary'
              AND policy.is_enabled = false
       ) THEN
        RAISE EXCEPTION '지금은 이 학급에서 일기 쓰기를 사용하지 않아요.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_disabled_diary_drafts ON public.self_writing_drafts;
CREATE TRIGGER trg_prevent_disabled_diary_drafts
BEFORE INSERT OR UPDATE ON public.self_writing_drafts
FOR EACH ROW EXECUTE FUNCTION public.prevent_disabled_diary_drafts();

CREATE OR REPLACE FUNCTION public.get_my_diary_daily_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_is_enabled BOOLEAN := true;
    v_daily_limit INTEGER;
    v_completed_today INTEGER := 0;
    v_has_today BOOLEAN := false;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id;

    SELECT policy.is_enabled, GREATEST(1, COALESCE(policy.daily_reward_limit, 1))
    INTO v_is_enabled, v_daily_limit
    FROM public.class_writing_policies policy
    WHERE policy.class_id = v_class_id
      AND policy.writing_type = 'diary';

    v_is_enabled := COALESCE(v_is_enabled, true);
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 1));

    SELECT count(*)::INTEGER
    INTO v_completed_today
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_student_id
      AND claim.class_id = v_class_id
      AND claim.writing_type = 'diary'
      AND claim.reward_kind = 'completion'
      AND claim.created_at >= (date_trunc('day', NOW() AT TIME ZONE 'Asia/Seoul') AT TIME ZONE 'Asia/Seoul');

    SELECT EXISTS (
        SELECT 1
        FROM public.student_posts post
        WHERE post.class_id = v_class_id
          AND post.student_id = v_student_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'diary'
          AND post.structured_content ->> 'diaryDate' = v_today::TEXT
    ) INTO v_has_today;

    RETURN jsonb_build_object(
        'is_enabled', v_is_enabled,
        'today', v_today::TEXT,
        'daily_limit', v_daily_limit,
        'completed_today', v_completed_today,
        'remaining_today', CASE WHEN v_is_enabled THEN GREATEST(0, v_daily_limit - v_completed_today) ELSE 0 END,
        'can_complete', v_is_enabled AND v_completed_today < v_daily_limit,
        'has_today_diary', v_has_today
    );
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_disabled_diary_writes() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_disabled_diary_drafts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_diary_daily_status() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.prevent_disabled_diary_writes() TO service_role;
GRANT EXECUTE ON FUNCTION public.prevent_disabled_diary_drafts() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_my_diary_daily_status() TO authenticated, service_role;

COMMIT;

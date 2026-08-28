-- 끝난 회차를 관리자가 **다시 검수**할 수 있게 한다.
--
-- 첫 회차(146건)를 돌려 보니 `반영 권장` 이 83건으로 몰렸다. 기준이 "틀렸는가" 하나뿐이라
-- `안/않` 같은 규칙과 `즐거워더` 같은 한 아이의 오타가 한 칸에 섞였다(2026-08-28).
-- 기준을 고쳐도 다시 돌릴 길이 없으면 다음 주까지 기다려야 하므로, 여는 문을 만든다.
--
-- 회차 행을 지우면 그 주의 결과가 함께 지워진다(items 가 ON DELETE CASCADE). 그 뒤 `start_` 가
-- 새 회차를 연다. **관리자가 이미 게시하거나 뺀 결정은 건드리지 않는다** —
-- 그것은 `spelling_common_reviews` 에 따로 남아 있고, 다음 회차에서도 그대로 걸러진다.
--
-- 판정 캐시도 지우지 않는다. 기준이 바뀌면 `REVIEW_VERSION` 이 올라가 옛 판정을 아무도 못 찾으므로
-- 자연히 새로 검수한다. 기준이 그대로면 캐시를 재사용해 비용이 안 나간다 — 둘 다 바라는 대로다.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_restart_spelling_weekly_review_v1(p_week_start DATE DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_week DATE;
    v_removed INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 다시 검수할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    v_week := COALESCE(
        p_week_start,
        (CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::INTEGER - 1) || ' days')::INTERVAL)::DATE
    );

    SELECT count(*)::INTEGER INTO v_removed
    FROM public.spelling_weekly_review_items item
    WHERE item.week_start = v_week;

    -- 회차를 지우면 그 주의 검토 후보가 함께 지워진다. 게시·보류 결정은 다른 표라 남는다.
    DELETE FROM public.spelling_weekly_review_runs run
    WHERE run.week_start = v_week;

    RETURN jsonb_build_object('week_start', v_week, 'removed_item_count', v_removed);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_restart_spelling_weekly_review_v1(DATE) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_restart_spelling_weekly_review_v1(DATE) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_restart_spelling_weekly_review_v1(DATE) IS
    '끝난 회차를 지워 다시 검수할 수 있게 한다. 관리자가 이미 게시하거나 뺀 결정은 그대로 남는다.';

NOTIFY pgrst, 'reload schema';

COMMIT;

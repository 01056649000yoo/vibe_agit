-- 맞춤법 주간 검수: 기본 규칙(띄어쓰기 규칙 등)이 이미 밑줄을 긋는 대기 후보를 자동으로 닫는다(2026-10-07).
-- 규칙 판정은 브라우저와 같은 정규식(JS)으로 해야 해서 맥미니 자동 검수(run-weekly-spelling-review.mjs --auto)가
-- 대기 목록을 읽어 걸리는 id 를 넘긴다. 관리자가 되돌린 것(triage_locked)은 건드리지 않는다.

ALTER TABLE public.spelling_weekly_review_items DROP CONSTRAINT IF EXISTS spelling_weekly_review_items_auto_reason_check;
ALTER TABLE public.spelling_weekly_review_items ADD CONSTRAINT spelling_weekly_review_items_auto_reason_check
    CHECK (auto_reason IS NULL OR auto_reason IN ('ai_reject', 'already_common', 'duplicate', 'base_rule'));

CREATE OR REPLACE FUNCTION public.spelling_weekly_pending_expressions_v1()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
    IF session_user <> 'supabase_admin' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'server role required' USING ERRCODE = '42501';
    END IF;
    RETURN COALESCE((
        SELECT jsonb_agg(jsonb_build_object('id', item.id, 'expression', item.expression))
        FROM public.spelling_weekly_review_items item
        WHERE item.decision = 'pending' AND item.triage_locked IS FALSE
    ), '[]'::JSONB);
END;
$function$;
REVOKE ALL ON FUNCTION public.spelling_weekly_pending_expressions_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.spelling_weekly_pending_expressions_v1() TO service_role;

CREATE OR REPLACE FUNCTION public.close_rule_covered_spelling_items_v1(p_ids UUID[])
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
    v_count INTEGER;
BEGIN
    IF session_user <> 'supabase_admin' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'server role required' USING ERRCODE = '42501';
    END IF;
    IF cardinality(COALESCE(p_ids, ARRAY[]::UUID[])) > 2000 THEN
        RAISE EXCEPTION '한 번에 2000개까지만 닫습니다.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.spelling_weekly_review_items item
    SET decision = 'rejected', auto_reason = 'base_rule', decided_at = NOW(), decided_by = NULL
    WHERE item.id = ANY(p_ids) AND item.decision = 'pending' AND item.triage_locked IS FALSE;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_rule_covered_spelling_items_v1(UUID[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_rule_covered_spelling_items_v1(UUID[]) TO service_role;

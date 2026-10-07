-- 맞춤법 주간 검수: 대기 후보를 새 지시문(제47항 허용·알 수 없는 오타는 제외)으로 다시 판정해 닫는 길(2026-10-07).
-- 지시문은 새 검수부터 적용되므로, 이미 쌓인 대기 후보만 맥미니 러너(--rejudge-pending)가 다시 묻는다.
-- 닫는 이유는 기존 `ai_reject`(AI 제외 권장) — 관리자 화면 `자동으로 뺀 것` 에서 되돌릴 수 있다.

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
        SELECT jsonb_agg(jsonb_build_object(
            'id', item.id, 'expression', item.expression, 'source_correction', item.source_correction,
            'source_kinds', to_jsonb(item.source_kinds), 'hit_count', item.hit_count, 'class_count', item.class_count,
            'ai_verdict', item.ai_verdict
        ))
        FROM public.spelling_weekly_review_items item
        WHERE item.decision = 'pending' AND item.triage_locked IS FALSE
    ), '[]'::JSONB);
END;
$function$;

CREATE OR REPLACE FUNCTION public.close_rejudged_spelling_items_v1(p_items JSONB)
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
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 2000 THEN
        RAISE EXCEPTION '다시 판정 결과 범위를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.spelling_weekly_review_items item
    SET decision = 'rejected', auto_reason = 'ai_reject', ai_verdict = 'reject',
        ai_reason = left(btrim(COALESCE(rejudged.value->>'reason', '')), 300),
        decided_at = NOW(), decided_by = NULL
    FROM jsonb_array_elements(p_items) rejudged
    WHERE item.id = (rejudged.value->>'id')::UUID
      AND item.decision = 'pending' AND item.triage_locked IS FALSE
      AND char_length(btrim(COALESCE(rejudged.value->>'reason', ''))) BETWEEN 1 AND 300;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$function$;
REVOKE ALL ON FUNCTION public.close_rejudged_spelling_items_v1(JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_rejudged_spelling_items_v1(JSONB) TO service_role;

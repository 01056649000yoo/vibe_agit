-- 한 달에 한 번, 모인 표현을 골라 기본 자료로 올리는 흐름 (2026-08-20)
--
-- 지금까지는 근거만 쌓였다 — 학생이 찾아본 것(`spelling_search_corpus`)과 AI가 찾아낸 것
-- (`spelling_ai_findings`). 이걸 매달 한 번 관리자가 훑어 **여러 학급에서 되풀이되는 것만**
-- 기본 자료 500개 후보로 추린다.
--
-- 기준을 "여러 학급"으로 잡는 이유: 한 학급에서 많이 나온 표현은 그 반의 한때 유행이거나
-- 한 학생의 버릇일 수 있다. **서로 다른 학급에서 되풀이될 때** 비로소 우리 학생 전체가
-- 헷갈리는 표현이라고 말할 수 있다.
--
-- 결정은 여기 남기고, 실제 카탈로그(`catalog/*.js`)는 코드라 화면이 직접 고치지 않는다.
-- 화면은 붙여 넣을 코드 조각을 만들어 주고, 반영은 배포로 한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.spelling_promotion_decisions (
    expression TEXT NOT NULL CHECK (char_length(expression) BETWEEN 1 AND 40),
    correction TEXT NOT NULL CHECK (char_length(correction) BETWEEN 1 AND 40),
    decision TEXT NOT NULL CHECK (decision IN ('accepted', 'rejected')),
    note TEXT CHECK (note IS NULL OR char_length(note) <= 200),
    decided_by UUID,
    decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (expression, correction)
);

COMMENT ON TABLE public.spelling_promotion_decisions IS
    '맞춤법 승격 검토 결과. accepted 는 기본 자료에 넣기로 한 것, rejected 는 다시 보지 않을 것.';

ALTER TABLE public.spelling_promotion_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_promotion_decisions FROM PUBLIC, anon, authenticated;

-- 후보 목록. 기준을 넘고 **아직 결정하지 않은 것**만 돌려준다.
CREATE OR REPLACE FUNCTION public.get_spelling_promotion_candidates_v1(
    p_min_classes INTEGER DEFAULT 2,
    p_min_hits INTEGER DEFAULT 3,
    p_limit INTEGER DEFAULT 200
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_min_classes INTEGER := GREATEST(COALESCE(p_min_classes, 2), 1);
    v_min_hits INTEGER := GREATEST(COALESCE(p_min_hits, 3), 1);
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 200), 1), 500);
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'thresholds', jsonb_build_object('min_classes', v_min_classes, 'min_hits', v_min_hits),
        'ai_findings', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.class_count DESC, row.hit_count DESC) FROM (
            SELECT finding.expression, finding.correction, finding.hit_count, finding.class_count,
                   finding.first_seen_at, finding.last_seen_at
            FROM public.spelling_ai_findings finding
            WHERE finding.class_count >= v_min_classes
              AND finding.hit_count >= v_min_hits
              AND NOT EXISTS (
                  SELECT 1 FROM public.spelling_promotion_decisions decided
                  WHERE decided.expression = finding.expression
                    AND decided.correction = finding.correction
              )
            ORDER BY finding.class_count DESC, finding.hit_count DESC
            LIMIT v_limit
        ) row), '[]'::jsonb),
        -- 학생이 직접 찾아본 표현. 바른 표현이 없어 참고 자료로만 함께 보여 준다.
        'searched', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.class_count DESC, row.search_count DESC) FROM (
            SELECT corpus.expression, corpus.label, corpus.matched,
                   corpus.search_count, corpus.class_count, corpus.last_seen_at
            FROM public.spelling_search_corpus corpus
            WHERE corpus.class_count >= v_min_classes
              AND corpus.search_count >= v_min_hits
              AND corpus.matched IS FALSE
            ORDER BY corpus.class_count DESC, corpus.search_count DESC
            LIMIT v_limit
        ) row), '[]'::jsonb),
        'decided_recent', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.decided_at DESC) FROM (
            SELECT decision.expression, decision.correction, decision.decision, decision.decided_at
            FROM public.spelling_promotion_decisions decision
            ORDER BY decision.decided_at DESC
            LIMIT 50
        ) row), '[]'::jsonb)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

-- 여러 건을 한 번에 기록한다(월 1회 훑어보며 한꺼번에 정하는 흐름이라 묶음으로 받는다).
CREATE OR REPLACE FUNCTION public.record_spelling_promotion_decisions_v1(
    p_items JSONB,
    p_decision TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_expression TEXT;
    v_correction TEXT;
    v_saved INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 결정할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_decision NOT IN ('accepted', 'rejected') THEN
        RAISE EXCEPTION 'invalid decision' USING ERRCODE = '22023';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 200 THEN
        RAISE EXCEPTION '한 번에 처리할 수 있는 항목 수를 넘었습니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_expression := btrim(COALESCE(v_item->>'expression', ''));
        v_correction := btrim(COALESCE(v_item->>'correction', ''));
        CONTINUE WHEN v_expression = '' OR v_correction = ''
            OR char_length(v_expression) > 40 OR char_length(v_correction) > 40;

        INSERT INTO public.spelling_promotion_decisions(expression, correction, decision, note, decided_by)
        VALUES (
            v_expression, v_correction, p_decision,
            left(btrim(COALESCE(v_item->>'note', '')), 200),
            auth.uid()
        )
        ON CONFLICT (expression, correction) DO UPDATE SET
            decision = EXCLUDED.decision,
            note = EXCLUDED.note,
            decided_by = EXCLUDED.decided_by,
            decided_at = NOW();

        v_saved := v_saved + 1;
    END LOOP;

    RETURN jsonb_build_object('saved', v_saved, 'decision', p_decision);
END;
$$;

REVOKE ALL ON FUNCTION public.get_spelling_promotion_candidates_v1(INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_spelling_promotion_decisions_v1(JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_spelling_promotion_candidates_v1(INTEGER, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_spelling_promotion_decisions_v1(JSONB, TEXT) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

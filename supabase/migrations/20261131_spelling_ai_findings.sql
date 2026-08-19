-- AI 맞춤법 검사가 찾아낸 표현을 따로 모은다 (2026-08-20)
--
-- 배경: 지금은 검사 결과가 **그 글 행(`student_posts.spell_check_result`)에만** 남는다.
-- 글이 지워지거나 학급이 정리되면 함께 사라져서, 나중에 "아이들이 실제로 무엇을 틀리는가"를
-- 볼 수도 없고 기본 자료 500개를 늘리는 근거로도 쓸 수 없다.
--
-- 그래서 검색 말뭉치(`spelling_search_corpus`)와 같은 방식으로, **학급·학생 식별자 없이**
-- `틀린 표현 → 바른 표현` 짝만 누적한다. 표현은 40자까지만 담는다(그보다 길면 문장일 수 있다).
-- 검색 말뭉치와 섞지 않는 이유: 하나는 **학생이 찾아본 것**, 하나는 **AI가 찾아낸 것**이라
-- 근거의 성격이 다르다. 나중에 카탈로그로 승격할 때 둘을 구분해서 봐야 한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.spelling_ai_findings (
    expression TEXT NOT NULL CHECK (char_length(expression) BETWEEN 1 AND 40),
    correction TEXT NOT NULL CHECK (char_length(correction) BETWEEN 1 AND 40),
    hit_count BIGINT NOT NULL DEFAULT 0 CHECK (hit_count >= 0),
    class_count INTEGER NOT NULL DEFAULT 0 CHECK (class_count >= 0),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (expression, correction)
);

COMMENT ON TABLE public.spelling_ai_findings IS
    'AI 맞춤법 검사가 찾은 틀린 표현→바른 표현 누적 집계. 학생·학급 식별자를 담지 않는다.';

-- 몇 학급에서 나왔는지만 세기 위한 짝 표. 학급이 지워져도 집계는 남아야 하므로 FK 를 걸지 않는다.
CREATE TABLE IF NOT EXISTS public.spelling_ai_finding_classes (
    expression TEXT NOT NULL,
    correction TEXT NOT NULL,
    class_id UUID NOT NULL,
    PRIMARY KEY (expression, correction, class_id)
);

ALTER TABLE public.spelling_ai_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spelling_ai_finding_classes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_ai_findings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.spelling_ai_finding_classes FROM PUBLIC, anon, authenticated;

-- 서버(Edge Function)만 부른다. 한 번의 검사 결과를 통째로 넘겨 누적한다.
CREATE OR REPLACE FUNCTION public.record_spelling_ai_findings_v1(p_class_id UUID, p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_expression TEXT;
    v_correction TEXT;
    v_rows INTEGER;
    v_new_class BOOLEAN;
    v_saved INTEGER := 0;
BEGIN
    IF auth.role() <> 'service_role' THEN
        RAISE EXCEPTION 'service role required' USING ERRCODE = '42501';
    END IF;
    IF p_class_id IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
        RETURN jsonb_build_object('saved', 0);
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_expression := btrim(COALESCE(v_item->>'wrong', ''));
        v_correction := btrim(COALESCE(v_item->>'right', ''));
        -- 40자를 넘으면 문장일 수 있어 담지 않는다(원문 비저장 원칙).
        CONTINUE WHEN v_expression = '' OR v_correction = ''
            OR char_length(v_expression) > 40 OR char_length(v_correction) > 40
            OR v_expression = v_correction;

        INSERT INTO public.spelling_ai_finding_classes(expression, correction, class_id)
        VALUES (v_expression, v_correction, p_class_id)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_new_class := v_rows = 1;

        INSERT INTO public.spelling_ai_findings(
            expression, correction, hit_count, class_count, first_seen_at, last_seen_at
        )
        VALUES (v_expression, v_correction, 1, CASE WHEN v_new_class THEN 1 ELSE 0 END, NOW(), NOW())
        ON CONFLICT (expression, correction) DO UPDATE SET
            hit_count = public.spelling_ai_findings.hit_count + 1,
            class_count = public.spelling_ai_findings.class_count + EXCLUDED.class_count,
            last_seen_at = NOW();

        v_saved := v_saved + 1;
    END LOOP;

    RETURN jsonb_build_object('saved', v_saved);
END;
$$;

REVOKE ALL ON FUNCTION public.record_spelling_ai_findings_v1(UUID, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_spelling_ai_findings_v1(UUID, JSONB) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

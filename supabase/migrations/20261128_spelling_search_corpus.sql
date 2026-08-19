-- 맞춤법 검색 기록: 표현을 제대로 남기고, 서비스 전체 말뭉치를 쌓는다 (2026-08-19)
--
-- 배경 두 가지.
-- ① 교사 화면의 `자주 찾아본 표현`이 전부 `미분류`로 보였다. 학생 화면이 검색 결과의 라벨을
--    엉뚱한 필드(`label`)에서 찾아 늘 비어 있었고(기본 자료는 `learningLabel` 이다),
--    표시할 표현도 **찾은 항목일 때는 저장하지 않아** 화면에 `common:myeochil` 같은 내부 키가 떴다.
--    → 찾은 항목도 **사전 항목의 표기**(예: `며칠 / 몇일`)를 함께 남긴다. 이는 학생 글이 아니라
--      우리 사전의 항목 이름이라 개인 정보가 아니다.
-- ② 학급 통계는 학급이 지워지면 함께 사라지고(FK CASCADE) 교사 화면도 30일만 본다.
--    나중에 "초등학생이 실제로 무엇을 자주 헷갈리는가"를 보려면 **학급·학생과 끊어진 누적 말뭉치**가
--    따로 있어야 한다. 그래서 `spelling_search_corpus` 를 둔다.
--
-- 개인 정보 원칙은 그대로다: 학생 글 원문은 저장하지 않는다. 말뭉치에는 **40자 이하 검색 표현**만
-- 남기고(그보다 길면 문장일 수 있어 개수만 센다) 학생·학급 식별자는 넣지 않는다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.spelling_search_corpus (
    expression TEXT PRIMARY KEY CHECK (char_length(expression) BETWEEN 1 AND 40),
    entry_key TEXT CHECK (entry_key IS NULL OR char_length(entry_key) <= 80),
    label TEXT CHECK (label IS NULL OR char_length(label) <= 40),
    matched BOOLEAN NOT NULL DEFAULT FALSE,
    search_count BIGINT NOT NULL DEFAULT 0 CHECK (search_count >= 0),
    class_count INTEGER NOT NULL DEFAULT 0 CHECK (class_count >= 0),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.spelling_search_corpus IS
    '맞춤법 수첩에서 실제로 찾아본 표현의 서비스 전체 누적 집계. 학생·학급 식별자를 담지 않는다.';

-- 몇 학급에서 찾았는지만 세기 위한 짝 표. 학급이 지워져도 말뭉치는 남아야 하므로 FK 를 걸지 않는다.
CREATE TABLE IF NOT EXISTS public.spelling_search_corpus_classes (
    expression TEXT NOT NULL,
    class_id UUID NOT NULL,
    PRIMARY KEY (expression, class_id)
);

ALTER TABLE public.spelling_search_corpus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spelling_search_corpus_classes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_search_corpus FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.spelling_search_corpus_classes FROM PUBLIC, anon, authenticated;

-- 학생이 수첩을 닫을 때 부르는 기록 RPC. 바뀐 점:
--   · 찾은 항목도 표시 표현(display)을 남긴다.
--   · 같은 내용을 서비스 전체 말뭉치에도 더한다.
CREATE OR REPLACE FUNCTION public.record_spelling_search_batch_v1(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_item JSONB;
    v_key TEXT;
    v_label TEXT;
    v_display TEXT;
    v_corpus_expression TEXT;
    v_count INTEGER;
    v_rows INTEGER;
    v_new_student BOOLEAN;
    v_new_class BOOLEAN;
BEGIN
    SELECT * INTO v_student FROM public.students s
    WHERE s.auth_id = auth.uid() AND s.deleted_at IS NULL LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '학생 연결을 확인할 수 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 20 THEN
        RAISE EXCEPTION '한 번에 기록할 수 있는 항목 수를 넘었습니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_key := left(btrim(COALESCE(v_item->>'entry_key', '')), 80);
        v_label := left(btrim(COALESCE(v_item->>'label', '미분류')), 40);
        IF v_key = '' OR v_label = '' THEN CONTINUE; END IF;

        -- 찾은 항목이면 사전 항목 표기, 못 찾았으면 학생이 친 검색어를 남긴다.
        v_display := left(btrim(COALESCE(NULLIF(v_item->>'display', ''), v_item->>'query', '')), 80);
        v_count := LEAST(GREATEST(COALESCE((v_item->>'count')::INT, 1), 1), 100);

        INSERT INTO public.class_spelling_student_daily(class_id, event_date, student_id, entry_key)
        VALUES (v_student.class_id, CURRENT_DATE, v_student.id, v_key)
        ON CONFLICT DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_new_student := v_rows = 1;

        INSERT INTO public.class_spelling_daily_stats(
            class_id, event_date, entry_key, label, display_expression,
            search_count, student_count, last_seen_at
        )
        VALUES (
            v_student.class_id, CURRENT_DATE, v_key, v_label, NULLIF(v_display, ''),
            v_count, CASE WHEN v_new_student THEN 1 ELSE 0 END, NOW()
        )
        ON CONFLICT (class_id, event_date, entry_key) DO UPDATE SET
            search_count = public.class_spelling_daily_stats.search_count + EXCLUDED.search_count,
            student_count = public.class_spelling_daily_stats.student_count + EXCLUDED.student_count,
            label = EXCLUDED.label,
            -- 표시 표현은 한 번 담기면 유지하되, 비어 있던 옛 기록은 채운다.
            display_expression = COALESCE(public.class_spelling_daily_stats.display_expression, EXCLUDED.display_expression),
            last_seen_at = NOW();

        -- 서비스 전체 말뭉치. 40자를 넘는 검색은 문장일 수 있어 담지 않는다.
        v_corpus_expression := left(btrim(COALESCE(NULLIF(v_display, ''), '')), 40);
        IF v_corpus_expression <> '' AND char_length(btrim(v_display)) <= 40 THEN
            INSERT INTO public.spelling_search_corpus_classes(expression, class_id)
            VALUES (v_corpus_expression, v_student.class_id)
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            v_new_class := v_rows = 1;

            INSERT INTO public.spelling_search_corpus(
                expression, entry_key, label, matched, search_count, class_count, first_seen_at, last_seen_at
            )
            VALUES (
                v_corpus_expression,
                NULLIF(v_key, ''),
                v_label,
                v_key NOT LIKE 'unmatched:%',
                v_count,
                CASE WHEN v_new_class THEN 1 ELSE 0 END,
                NOW(), NOW()
            )
            ON CONFLICT (expression) DO UPDATE SET
                search_count = public.spelling_search_corpus.search_count + EXCLUDED.search_count,
                class_count = public.spelling_search_corpus.class_count + EXCLUDED.class_count,
                entry_key = COALESCE(public.spelling_search_corpus.entry_key, EXCLUDED.entry_key),
                label = CASE WHEN EXCLUDED.label = '미분류' THEN public.spelling_search_corpus.label ELSE EXCLUDED.label END,
                matched = public.spelling_search_corpus.matched OR EXCLUDED.matched,
                last_seen_at = NOW();
        END IF;
    END LOOP;

    RETURN jsonb_build_object('recorded', true);
END;
$$;

REVOKE ALL ON FUNCTION public.record_spelling_search_batch_v1(JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_spelling_search_batch_v1(JSONB) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

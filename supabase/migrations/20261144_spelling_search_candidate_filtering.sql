-- 맞춤법 검색 기록을 새 자료 후보와 이용 통계로 분리한다 (2026-08-20)
--
-- 검색한 문장을 그대로 교사 화면에 보여 주지 않는다. 기존 자료·사전 검색·문장은
-- 고정 요약 키로 횟수만 모으고, 짧은 미등록 한글 표현만 후보 원문을 보관한다.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_class_spelling_student_entry_date
    ON public.class_spelling_student_daily (class_id, entry_key, event_date DESC, student_id);

CREATE OR REPLACE FUNCTION public.record_spelling_search_batch_v2(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_item JSONB;
    v_kind TEXT;
    v_key TEXT;
    v_label TEXT;
    v_expression TEXT;
    v_count INTEGER;
    v_rows INTEGER;
    v_new_student BOOLEAN;
    v_new_class BOOLEAN;
BEGIN
    SELECT * INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.deleted_at IS NULL
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '학생 연결을 확인할 수 없습니다.' USING ERRCODE = '42501';
    END IF;
    IF jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) > 20 THEN
        RAISE EXCEPTION '한 번에 기록할 수 있는 항목 수를 넘었습니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_kind := btrim(COALESCE(v_item->>'kind', ''));
        v_count := LEAST(GREATEST(COALESCE((v_item->>'count')::INTEGER, 1), 1), 100);
        v_expression := regexp_replace(
            lower(normalize(btrim(COALESCE(v_item->>'display', '')), NFC)),
            '\s+', ' ', 'g'
        );

        IF v_kind = 'covered' THEN
            v_key := left(btrim(COALESCE(v_item->>'entry_key', '')), 80);
            IF v_key !~ '^(common|class):[A-Za-z0-9-]+$' THEN CONTINUE; END IF;
            v_label := left(btrim(COALESCE(NULLIF(v_item->>'label', ''), '기존 자료')), 40);
            v_expression := NULL;
        ELSIF v_kind = 'dictionary' THEN
            v_key := 'summary:dictionary';
            v_label := '사전에서 확인';
            v_expression := NULL;
        ELSIF v_kind = 'sentence' THEN
            v_key := 'summary:sentence';
            v_label := '문장 검색';
            v_expression := NULL;
        ELSIF v_kind = 'candidate' THEN
            IF char_length(v_expression) NOT BETWEEN 2 AND 15
               OR array_length(regexp_split_to_array(v_expression, '\s+'), 1) > 2
               OR v_expression !~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
               OR (char_length(v_expression) >= 3
                   AND v_expression = repeat(left(v_expression, 1), char_length(v_expression))) THEN
                CONTINUE;
            END IF;
            v_key := 'candidate:' || v_expression;
            v_label := '미등록 표현';
        ELSE
            CONTINUE;
        END IF;

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
            v_student.class_id, CURRENT_DATE, v_key, v_label, v_expression,
            v_count, CASE WHEN v_new_student THEN 1 ELSE 0 END, NOW()
        )
        ON CONFLICT (class_id, event_date, entry_key) DO UPDATE SET
            search_count = public.class_spelling_daily_stats.search_count + EXCLUDED.search_count,
            student_count = public.class_spelling_daily_stats.student_count + EXCLUDED.student_count,
            label = EXCLUDED.label,
            display_expression = EXCLUDED.display_expression,
            last_seen_at = NOW();

        -- 서비스 전체 말뭉치에는 추천 가능한 짧은 표현만 남긴다.
        IF v_kind = 'candidate' THEN
            INSERT INTO public.spelling_search_corpus_classes(expression, class_id)
            VALUES (v_expression, v_student.class_id)
            ON CONFLICT DO NOTHING;
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            v_new_class := v_rows = 1;

            INSERT INTO public.spelling_search_corpus(
                expression, entry_key, label, matched,
                search_count, class_count, first_seen_at, last_seen_at
            )
            VALUES (
                v_expression, v_key, v_label, FALSE,
                v_count, CASE WHEN v_new_class THEN 1 ELSE 0 END, NOW(), NOW()
            )
            ON CONFLICT (expression) DO UPDATE SET
                search_count = public.spelling_search_corpus.search_count + EXCLUDED.search_count,
                class_count = public.spelling_search_corpus.class_count + EXCLUDED.class_count,
                entry_key = EXCLUDED.entry_key,
                label = EXCLUDED.label,
                last_seen_at = NOW();
        END IF;
    END LOOP;

    RETURN jsonb_build_object('recorded', TRUE);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_spelling_learning_workspace_v2(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.teacher_id = auth.uid()
          AND class.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION '이 학급의 맞춤법 데이터를 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH recent AS MATERIALIZED (
        SELECT stats.*
        FROM public.class_spelling_daily_stats stats
        WHERE stats.class_id = p_class_id
          AND stats.event_date >= CURRENT_DATE - 30
    ), candidate_counts AS MATERIALIZED (
        SELECT
            stats.entry_key,
            max(stats.display_expression) AS expression,
            sum(stats.search_count)::INTEGER AS total
        FROM recent stats
        WHERE stats.entry_key LIKE 'candidate:%'
           OR stats.entry_key LIKE 'unmatched:%'
        GROUP BY stats.entry_key
    ), candidate_students AS MATERIALIZED (
        SELECT seen.entry_key, count(DISTINCT seen.student_id)::INTEGER AS students
        FROM public.class_spelling_student_daily seen
        WHERE seen.class_id = p_class_id
          AND seen.event_date >= CURRENT_DATE - 30
          AND (seen.entry_key LIKE 'candidate:%' OR seen.entry_key LIKE 'unmatched:%')
        GROUP BY seen.entry_key
    ), candidate_groups AS MATERIALIZED (
        SELECT counts.entry_key, counts.expression, counts.total,
               COALESCE(students.students, 0) AS students
        FROM candidate_counts counts
        LEFT JOIN candidate_students students USING (entry_key)
    ), safe_candidates AS MATERIALIZED (
        SELECT candidate.*
        FROM candidate_groups candidate
        WHERE char_length(candidate.expression) BETWEEN 2 AND 15
          AND array_length(regexp_split_to_array(candidate.expression, '\s+'), 1) <= 2
          AND candidate.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
          AND NOT (
              char_length(candidate.expression) >= 3
              AND candidate.expression = repeat(left(candidate.expression, 1), char_length(candidate.expression))
          )
          AND NOT EXISTS (
              SELECT 1
              FROM public.spelling_learning_entries entry
              WHERE entry.class_id = p_class_id
                AND entry.status = 'approved'
                AND lower(btrim(entry.wrong_expression)) = lower(candidate.expression)
          )
    ), recommended AS MATERIALIZED (
        SELECT candidate.*,
               CASE WHEN candidate.students >= 2
                    THEN '여러 학생이 찾아봤어요'
                    ELSE '같은 표현을 반복해서 찾아봤어요' END AS reason
        FROM safe_candidates candidate
        WHERE candidate.students >= 2 OR candidate.total >= 3
        ORDER BY candidate.students DESC, candidate.total DESC, candidate.expression
        LIMIT 30
    )
    SELECT jsonb_build_object(
        'entries', COALESCE((
            SELECT jsonb_agg(to_jsonb(entry_row) ORDER BY entry_row.updated_at DESC)
            FROM (
                SELECT entry.id, entry.wrong_expression, entry.correct_expression, entry.label,
                       entry.explanation, entry.examples, entry.status, entry.updated_at
                FROM public.spelling_learning_entries entry
                WHERE entry.class_id = p_class_id
                ORDER BY entry.updated_at DESC
                LIMIT 100
            ) entry_row
        ), '[]'::JSONB),
        'candidate_searches', COALESCE((
            SELECT jsonb_agg(to_jsonb(candidate_row)
                             ORDER BY candidate_row.students DESC, candidate_row.total DESC)
            FROM (
                SELECT expression, total, students, reason
                FROM recommended
            ) candidate_row
        ), '[]'::JSONB),
        'search_summary', jsonb_build_object(
            'total', COALESCE((SELECT sum(search_count)::INTEGER FROM recent), 0),
            'covered', COALESCE((SELECT sum(search_count)::INTEGER FROM recent
                                 WHERE entry_key LIKE 'common:%' OR entry_key LIKE 'class:%'), 0),
            'dictionary', COALESCE((SELECT sum(search_count)::INTEGER FROM recent
                                    WHERE entry_key = 'summary:dictionary'), 0),
            'filtered', COALESCE((SELECT sum(search_count)::INTEGER FROM recent
                                  WHERE entry_key = 'summary:sentence'
                                     OR (entry_key LIKE 'unmatched:%' AND NOT (
                                         char_length(display_expression) BETWEEN 2 AND 15
                                         AND array_length(regexp_split_to_array(display_expression, '\s+'), 1) <= 2
                                         AND display_expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
                                     ))), 0),
            'recommended', (SELECT count(*)::INTEGER FROM recommended),
            'observing', (SELECT count(*)::INTEGER FROM safe_candidates candidate
                          WHERE candidate.students < 2 AND candidate.total < 3)
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.record_spelling_search_batch_v2(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_spelling_learning_workspace_v2(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_spelling_search_batch_v2(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_spelling_learning_workspace_v2(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

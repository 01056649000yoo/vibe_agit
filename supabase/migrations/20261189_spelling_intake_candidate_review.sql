-- 관리자가 AI 검수를 돌리기 **전에** 원자료 목록을 보고 골라내게 한다.
--
-- 학생 검색에는 아이 이름·오타 부스러기처럼 맞춤법 자료가 될 수 없는 것이 섞인다. 통째로 AI 에 보내면
-- 돈이 새고 검토할 후보에 잡음이 낀다. 그래서 목록을 보여 주고 빼거나 직접 등록하게 한다.
--
-- 새 표를 만들지 않는다. 빼기는 이미 있는 `spelling_common_reviews` 에 `rejected` 로 남기고,
-- `start_spelling_weekly_review_v1` 이 그 행을 보고 영구히 건너뛴다. 직접 등록은 이미 있는
-- `admin_publish_common_spelling_entry_v1` 이 맡는다(같은 키에 `published` 로 덮어쓴다).
--
-- 세는 기준(v_since·걸러내기)은 `start_spelling_weekly_review_v1`·`admin_get_spelling_weekly_intake_v1`
-- 과 **같아야 한다**. 셋 중 하나를 고치면 나머지도 함께 고친다.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_get_spelling_intake_candidates_v1(
    p_source_kind TEXT,
    p_excluded BOOLEAN DEFAULT FALSE,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_since TIMESTAMPTZ;
    v_week DATE;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 100), 1), 300);
    v_offset INTEGER := GREATEST(COALESCE(p_offset, 0), 0);
    v_items JSONB;
    v_total BIGINT;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_source_kind NOT IN ('ai', 'search') THEN
        RAISE EXCEPTION '출처를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    v_week := (CURRENT_DATE - ((EXTRACT(ISODOW FROM CURRENT_DATE)::INTEGER - 1) || ' days')::INTERVAL)::DATE;
    SELECT COALESCE(max(run.finished_at), '-infinity'::TIMESTAMPTZ)
    INTO v_since
    FROM public.spelling_weekly_review_runs run
    WHERE run.status IN ('ready', 'empty')
      AND run.week_start < v_week;

    IF p_excluded THEN
        -- 빼 둔 것. 되돌리려면 이 목록이 필요하다. 게시된 것은 여기 없다(그건 공통 자료 화면에서 다룬다).
        SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.decided_at DESC), '[]'::JSONB)
        INTO v_items
        FROM (
            SELECT review.expression, review.source_correction, review.decided_at,
                   0::BIGINT AS hit_count, 0::INTEGER AS class_count, NULL::TIMESTAMPTZ AS last_seen_at
            FROM public.spelling_common_reviews review
            WHERE review.source_kind = p_source_kind
              AND review.decision = 'rejected'
            ORDER BY review.decided_at DESC
            LIMIT v_limit OFFSET v_offset
        ) row_data;

        SELECT count(*) INTO v_total
        FROM public.spelling_common_reviews review
        WHERE review.source_kind = p_source_kind AND review.decision = 'rejected';

    ELSIF p_source_kind = 'ai' THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.hit_count DESC), '[]'::JSONB)
        INTO v_items
        FROM (
            SELECT finding.expression, finding.correction AS source_correction, finding.hit_count,
                   finding.class_count, finding.last_seen_at, NULL::TIMESTAMPTZ AS decided_at
            FROM public.spelling_ai_findings finding
            WHERE finding.last_seen_at > v_since
              AND NOT EXISTS (
                  SELECT 1 FROM public.spelling_common_reviews review
                  WHERE review.source_kind = 'ai'
                    AND review.expression = finding.expression
                    AND review.source_correction = finding.correction
              )
            ORDER BY finding.class_count DESC, finding.hit_count DESC, finding.last_seen_at DESC
            LIMIT v_limit OFFSET v_offset
        ) row_data;

        SELECT count(*) INTO v_total
        FROM public.spelling_ai_findings finding
        WHERE finding.last_seen_at > v_since
          AND NOT EXISTS (
              SELECT 1 FROM public.spelling_common_reviews review
              WHERE review.source_kind = 'ai'
                AND review.expression = finding.expression
                AND review.source_correction = finding.correction
          );

    ELSE
        SELECT COALESCE(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.hit_count DESC), '[]'::JSONB)
        INTO v_items
        FROM (
            SELECT corpus.expression, ''::TEXT AS source_correction, corpus.search_count AS hit_count,
                   corpus.class_count, corpus.last_seen_at, NULL::TIMESTAMPTZ AS decided_at
            FROM public.spelling_search_corpus corpus
            WHERE corpus.last_seen_at > v_since
              AND corpus.matched IS FALSE
              AND char_length(corpus.expression) BETWEEN 2 AND 15
              AND array_length(regexp_split_to_array(corpus.expression, '\s+'), 1) <= 2
              AND corpus.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
              AND NOT EXISTS (
                  SELECT 1 FROM public.spelling_common_reviews review
                  WHERE review.source_kind = 'search'
                    AND review.expression = corpus.expression
                    AND review.source_correction = ''
              )
            ORDER BY corpus.class_count DESC, corpus.search_count DESC, corpus.last_seen_at DESC
            LIMIT v_limit OFFSET v_offset
        ) row_data;

        SELECT count(*) INTO v_total
        FROM public.spelling_search_corpus corpus
        WHERE corpus.last_seen_at > v_since
          AND corpus.matched IS FALSE
          AND char_length(corpus.expression) BETWEEN 2 AND 15
          AND array_length(regexp_split_to_array(corpus.expression, '\s+'), 1) <= 2
          AND corpus.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
          AND NOT EXISTS (
              SELECT 1 FROM public.spelling_common_reviews review
              WHERE review.source_kind = 'search'
                AND review.expression = corpus.expression
                AND review.source_correction = ''
          );
    END IF;

    RETURN jsonb_build_object(
        'source_kind', p_source_kind,
        'excluded', p_excluded,
        'total', COALESCE(v_total, 0),
        'items', COALESCE(v_items, '[]'::JSONB)
    );
END;
$$;

/**
 * AI 검수 대상에서 빼거나(rejected) 다시 되돌린다.
 *
 * 이미 공통 자료로 **게시된** 것은 여기서 빼지 않는다. 그 행의 `common_entry_id` 를 잃으면 어떤 자료가
 * 어디서 왔는지 끊긴다. 게시한 것을 그만 쓰려면 공통 자료 화면에서 적용을 중지한다.
 */
CREATE OR REPLACE FUNCTION public.admin_set_spelling_candidate_excluded_v1(
    p_source_kind TEXT,
    p_expression TEXT,
    p_source_correction TEXT DEFAULT '',
    p_excluded BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_expression TEXT := btrim(COALESCE(p_expression, ''));
    v_correction TEXT := btrim(COALESCE(p_source_correction, ''));
    v_existing TEXT;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 바꿀 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_source_kind NOT IN ('ai', 'search') THEN
        RAISE EXCEPTION '출처를 확인해 주세요.' USING ERRCODE = '22023';
    END IF;
    IF char_length(v_expression) NOT BETWEEN 1 AND 40 OR char_length(v_correction) > 40 THEN
        RAISE EXCEPTION '표현을 확인해 주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT review.decision INTO v_existing
    FROM public.spelling_common_reviews review
    WHERE review.source_kind = p_source_kind
      AND review.expression = v_expression
      AND review.source_correction = v_correction;

    IF v_existing = 'published' THEN
        RETURN jsonb_build_object('status', 'published_locked');
    END IF;

    IF p_excluded THEN
        INSERT INTO public.spelling_common_reviews(
            source_kind, expression, source_correction, decision, common_entry_id, decided_by, decided_at
        ) VALUES (
            p_source_kind, v_expression, v_correction, 'rejected', NULL, auth.uid(), NOW()
        )
        ON CONFLICT (source_kind, expression, source_correction) DO UPDATE SET
            decision = 'rejected', common_entry_id = NULL, decided_by = auth.uid(), decided_at = NOW();
        RETURN jsonb_build_object('status', 'excluded');
    END IF;

    DELETE FROM public.spelling_common_reviews review
    WHERE review.source_kind = p_source_kind
      AND review.expression = v_expression
      AND review.source_correction = v_correction
      AND review.decision = 'rejected';
    RETURN jsonb_build_object('status', 'restored');
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_spelling_intake_candidates_v1(TEXT, BOOLEAN, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_set_spelling_candidate_excluded_v1(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_spelling_intake_candidates_v1(TEXT, BOOLEAN, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_spelling_candidate_excluded_v1(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.admin_get_spelling_intake_candidates_v1(TEXT, BOOLEAN, INTEGER, INTEGER) IS
    'AI 검수를 돌리기 전에 관리자가 볼 원자료 목록. 읽기만 한다. start 함수와 같은 기준으로 고른다.';
COMMENT ON FUNCTION public.admin_set_spelling_candidate_excluded_v1(TEXT, TEXT, TEXT, BOOLEAN) IS
    'AI 검수 대상에서 빼거나 되돌린다. 이미 게시된 후보는 바꾸지 않고 published_locked 를 돌려준다.';

NOTIFY pgrst, 'reload schema';

COMMIT;

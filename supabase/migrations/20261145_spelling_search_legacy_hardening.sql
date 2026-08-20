-- 맞춤법 검색 후보 V2 도입 뒤 남아 있던 구버전 기록 경로를 닫는다 (2026-08-21)
--
-- V1은 인증 학생이 직접 호출하면 40자 이하 문장을 누적 말뭉치에 넣을 수 있었다.
-- 화면은 이미 V2만 쓰지만 브라우저의 공개 RPC 권한도 함께 닫아야 새 개인정보 원칙을 우회할 수 없다.
-- 기존 누적 자료 중 V2 후보 기준 밖의 미등록 표현은 학급 연결표와 말뭉치에서 함께 제거하고,
-- 관리자 월간 검토도 같은 서버 필터를 다시 적용한다.

BEGIN;

REVOKE EXECUTE ON FUNCTION public.record_spelling_search_batch_v1(JSONB) FROM authenticated;

DELETE FROM public.spelling_search_corpus_classes corpus_class
WHERE EXISTS (
    SELECT 1
    FROM public.spelling_search_corpus corpus
    WHERE corpus.expression = corpus_class.expression
      AND corpus.matched IS FALSE
      AND NOT (
          char_length(corpus.expression) BETWEEN 2 AND 15
          AND array_length(regexp_split_to_array(corpus.expression, '\s+'), 1) <= 2
          AND corpus.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
          AND NOT (
              char_length(corpus.expression) >= 3
              AND corpus.expression = repeat(left(corpus.expression, 1), char_length(corpus.expression))
          )
      )
);

DELETE FROM public.spelling_search_corpus corpus
WHERE corpus.matched IS FALSE
  AND NOT (
      char_length(corpus.expression) BETWEEN 2 AND 15
      AND array_length(regexp_split_to_array(corpus.expression, '\s+'), 1) <= 2
      AND corpus.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
      AND NOT (
          char_length(corpus.expression) >= 3
          AND corpus.expression = repeat(left(corpus.expression, 1), char_length(corpus.expression))
      )
  );

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
        'searched', COALESCE((SELECT jsonb_agg(to_jsonb(row) ORDER BY row.class_count DESC, row.search_count DESC) FROM (
            SELECT corpus.expression, corpus.label, corpus.matched,
                   corpus.search_count, corpus.class_count, corpus.last_seen_at
            FROM public.spelling_search_corpus corpus
            WHERE corpus.class_count >= v_min_classes
              AND corpus.search_count >= v_min_hits
              AND corpus.matched IS FALSE
              AND char_length(corpus.expression) BETWEEN 2 AND 15
              AND array_length(regexp_split_to_array(corpus.expression, '\s+'), 1) <= 2
              AND corpus.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
              AND NOT (
                  char_length(corpus.expression) >= 3
                  AND corpus.expression = repeat(left(corpus.expression, 1), char_length(corpus.expression))
              )
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

REVOKE ALL ON FUNCTION public.get_spelling_promotion_candidates_v1(INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_spelling_promotion_candidates_v1(INTEGER, INTEGER, INTEGER) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

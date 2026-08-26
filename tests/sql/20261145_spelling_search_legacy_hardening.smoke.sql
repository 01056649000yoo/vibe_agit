DO $$
BEGIN
    -- 지워진 함수는 이 검사가 지키려는 상태를 이미 만족한다. 다만 `has_function_privilege` 는
    -- 이름이 없으면 그 자리에서 오류를 내므로 존재할 때만 본다
    -- (2026-08-26 다른 스모크가 같은 이유로 통째로 깨졌다).
    IF to_regprocedure('public.record_spelling_search_batch_v1(jsonb)') IS NOT NULL
       AND has_function_privilege('authenticated', 'public.record_spelling_search_batch_v1(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION '인증 학생에게 구버전 맞춤법 기록 RPC 실행 권한이 남아 있습니다.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.spelling_search_corpus corpus
        WHERE corpus.matched IS FALSE
          AND NOT (
              char_length(corpus.expression) BETWEEN 2 AND 15
              AND array_length(regexp_split_to_array(corpus.expression, '\s+'), 1) <= 2
              AND corpus.expression ~ '^[가-힣ㄱ-ㅎㅏ-ㅣ]+( [가-힣ㄱ-ㅎㅏ-ㅣ]+)?$'
              AND NOT (
                  char_length(corpus.expression) >= 3
                  AND corpus.expression = repeat(left(corpus.expression, 1), char_length(corpus.expression))
              )
          )
    ) THEN
        RAISE EXCEPTION '안전 기준 밖의 기존 미등록 표현이 누적 말뭉치에 남아 있습니다.';
    END IF;
END;
$$;

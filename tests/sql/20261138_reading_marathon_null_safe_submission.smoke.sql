-- 20261259 파일에서 바뀜: 쪽수 상한이 10000 상수에서 reading_marathon_max_pages_v1()(1,000쪽) 한 곳으로 옮겨졌다.
DO $$
DECLARE
    v_definition TEXT;
BEGIN
    SELECT pg_get_functiondef('public.record_reading_marathon_contribution(uuid)'::regprocedure)
    INTO v_definition;

    IF v_definition NOT LIKE '%COALESCE(v_post.review_status, '''') NOT IN%'
       OR v_definition NOT LIKE '%COALESCE(v_post.page_count, 0) NOT BETWEEN 1 AND public.reading_marathon_max_pages_v1()%'
       OR public.reading_marathon_max_pages_v1() <> 1000 THEN
        RAISE EXCEPTION 'marathon contribution must treat missing review and page count as pending';
    END IF;

    IF has_function_privilege(
        'authenticated',
        'public.record_reading_marathon_contribution(uuid)',
        'EXECUTE'
    ) THEN
        RAISE EXCEPTION 'authenticated must not execute internal marathon contribution function';
    END IF;
END;
$$;

DO $$
BEGIN
    IF has_table_privilege('anon', 'public.system_service_scan_runs', 'SELECT')
       OR has_table_privilege('authenticated', 'public.system_service_scan_runs', 'SELECT')
       OR has_table_privilege('service_role', 'public.system_service_scan_runs', 'SELECT')
       OR has_table_privilege('authenticated', 'public.system_service_reviews', 'INSERT') THEN
        RAISE EXCEPTION 'service management ledgers must not be directly accessible';
    END IF;
    IF has_function_privilege('anon', 'public.admin_get_service_management_v1(integer)', 'EXECUTE')
       OR NOT has_function_privilege('authenticated', 'public.admin_get_service_management_v1(integer)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.record_service_scan_v1(jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('service_role', 'public.record_service_scan_v1(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'service management RPC privilege boundary is incorrect';
    END IF;
END;
$$;

DO $$
DECLARE
    v_admin UUID;
    v_review UUID;
    v_result JSONB;
BEGIN
    SELECT id INTO v_admin FROM public.profiles WHERE role = 'ADMIN' LIMIT 1;
    IF v_admin IS NULL THEN
        RAISE EXCEPTION 'admin profile is required for service review smoke';
    END IF;
    PERFORM set_config('request.jwt.claim.sub', v_admin::TEXT, TRUE);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', TRUE);
    PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', v_admin, 'role', 'authenticated')::TEXT, TRUE);

    v_review := public.admin_start_service_review_v1();
    UPDATE public.system_service_review_items SET status = 'PASS', checked_at = NOW(), checked_by = v_admin
    WHERE review_id = v_review;
    v_result := public.admin_complete_service_review_v1(v_review);

    IF (v_result->>'next_due_at')::TIMESTAMPTZ < NOW() + INTERVAL '89 days'
       OR (SELECT count(*) FROM public.system_service_review_items WHERE review_id = v_review) <> 12 THEN
        RAISE EXCEPTION 'quarterly review baseline or checklist is incorrect: %', v_result;
    END IF;
END;
$$;

SELECT public.record_service_scan_v1(jsonb_build_object(
    'run_key', 'service-scan-20990101T010203',
    'status', 'PASS',
    'scanner_name', 'trivy',
    'scanner_version', '0.74.0',
    'started_at', NOW() - INTERVAL '1 minute',
    'finished_at', NOW(),
    'vulnerability_db_updated_at', NOW() - INTERVAL '1 hour',
    'critical_count', 2,
    'high_count', 5,
    'fixable_count', 4,
    'urgent_count', 1,
    'attention_count', 4,
    'detail_code', 'scan_complete',
    'raw_report_sha256', repeat('a', 64),
    'images', jsonb_build_array(jsonb_build_object(
        'image_key', repeat('b', 64),
        'image_ref', 'example/service:1.2.3',
        'image_digest', 'sha256:' || repeat('b', 64),
        'service_group', 'agit',
        'exposure', 'public',
        'container_count', 1,
        'critical_count', 2,
        'high_count', 5,
        'fixable_count', 4,
        'urgent_count', 1,
        'attention_count', 4
    ))
));

DO $$
BEGIN
    IF (SELECT image_count FROM public.system_service_scan_runs
        WHERE run_key = 'service-scan-20990101T010203') <> 1
       OR (SELECT urgent_count FROM public.system_service_scan_images
           WHERE run_key = 'service-scan-20990101T010203') <> 1 THEN
        RAISE EXCEPTION 'normalized service scan was not recorded';
    END IF;
END;
$$;

-- ============================================================================
-- 🧹 서비스 이미지 검사 — 손댈 수 없는 항목은 세지 않고, 몇 건을 뺐는지 남긴다
-- 작성일: 2026-09-02
--
-- 무엇이 문제였나:
--   관리자 첫 화면의 `지금 확인할 항목`이 24건이었는데 그중 **12건이 `linux-libc-dev`**
--   (리눅스 커널 헤더 패키지) 취약점이었다. 컨테이너는 자기 커널을 띄우지 않고 호스트 커널을 쓴다.
--   즉 이미지 안의 커널 헤더 패키지는 실행되지 않으며, 그 CVE 는 이미지를 고쳐서 막을 수 있는 것도
--   이미지를 통해 공격당할 수 있는 것도 아니다. 스캐너가 흔히 만들어 내는 잡음이다.
--   진짜로 조치할 11건이 이 잡음에 묻혀 있었다.
--
-- 어떻게 고치나:
--   무시할 패키지 목록은 `ops/service-management/services.json` 의 `ignoredPackages` 하나가 원본이고,
--   **이유를 함께 적어야** 목록에 넣을 수 있다(`scripts/scan-service-images.mjs` 가 검사한다).
--   **조용히 지우지 않는다** — 뺀 건수를 `ignored_count` 로 함께 기록해 화면에 `숨김 N건`으로 보여 준다.
--   숨긴 것이 무엇이었는지는 원본 보고서(맥미니 로컬 gz)에 그대로 남는다.
-- ============================================================================

BEGIN;

ALTER TABLE public.system_service_scan_runs
    ADD COLUMN IF NOT EXISTS ignored_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.system_service_scan_images
    ADD COLUMN IF NOT EXISTS ignored_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.system_service_scan_runs
    DROP CONSTRAINT IF EXISTS system_service_scan_runs_ignored_count_check;
ALTER TABLE public.system_service_scan_runs
    ADD CONSTRAINT system_service_scan_runs_ignored_count_check
    CHECK (ignored_count >= 0 AND ignored_count <= 1000000);

ALTER TABLE public.system_service_scan_images
    DROP CONSTRAINT IF EXISTS system_service_scan_images_ignored_count_check;
ALTER TABLE public.system_service_scan_images
    ADD CONSTRAINT system_service_scan_images_ignored_count_check
    CHECK (ignored_count >= 0 AND ignored_count <= 1000000);

COMMENT ON COLUMN public.system_service_scan_runs.ignored_count IS
    '이유를 적어 세지 않기로 한 취약점 수(커널 헤더 등). 목록 원본은 ops/service-management/services.json.';
COMMENT ON COLUMN public.system_service_scan_images.ignored_count IS
    '이 이미지에서 이유를 적어 세지 않은 취약점 수.';

CREATE OR REPLACE FUNCTION public.record_service_scan_v1(p_payload JSONB)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_run_key TEXT := p_payload->>'run_key';
    v_images JSONB := COALESCE(p_payload->'images', '[]'::JSONB);
    v_image JSONB;
BEGIN
    IF session_user <> 'supabase_admin' AND COALESCE(auth.role(), '') <> 'service_role' THEN
        RAISE EXCEPTION 'Only the host recorder can write service scans' USING ERRCODE = '42501';
    END IF;
    IF p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
       OR jsonb_typeof(v_images) <> 'array' OR jsonb_array_length(v_images) > 100
       OR v_run_key IS NULL OR v_run_key !~ '^service-scan-[0-9]{8}T[0-9]{6}$' THEN
        RAISE EXCEPTION 'Invalid service scan payload' USING ERRCODE = '22023';
    END IF;

    FOR v_image IN SELECT value FROM jsonb_array_elements(v_images)
    LOOP
        IF COALESCE(v_image->>'image_key', '') !~ '^[a-f0-9]{12,64}$'
           OR COALESCE(v_image->>'image_ref', '') !~ '^[A-Za-z0-9][A-Za-z0-9._/@:+-]{0,199}$'
           OR COALESCE(v_image->>'image_digest', '') !~ '^sha256:[a-f0-9]{64}$'
           OR COALESCE(v_image->>'service_group', '') !~ '^[a-z0-9_,-]{1,120}$'
           OR COALESCE(v_image->>'exposure', '') NOT IN ('public', 'lan', 'internal', 'unknown') THEN
            RAISE EXCEPTION 'Invalid service scan image payload' USING ERRCODE = '22023';
        END IF;
    END LOOP;

    INSERT INTO public.system_service_scan_runs (
        run_key, status, scanner_name, scanner_version, started_at, finished_at,
        vulnerability_db_updated_at, image_count, critical_count, high_count,
        fixable_count, urgent_count, attention_count, ignored_count, detail_code, raw_report_sha256
    ) VALUES (
        v_run_key,
        p_payload->>'status',
        COALESCE(p_payload->>'scanner_name', 'trivy'),
        p_payload->>'scanner_version',
        (p_payload->>'started_at')::TIMESTAMPTZ,
        (p_payload->>'finished_at')::TIMESTAMPTZ,
        NULLIF(p_payload->>'vulnerability_db_updated_at', '')::TIMESTAMPTZ,
        jsonb_array_length(v_images),
        (p_payload->>'critical_count')::INTEGER,
        (p_payload->>'high_count')::INTEGER,
        (p_payload->>'fixable_count')::INTEGER,
        (p_payload->>'urgent_count')::INTEGER,
        (p_payload->>'attention_count')::INTEGER,
        COALESCE((p_payload->>'ignored_count')::INTEGER, 0),
        COALESCE(p_payload->>'detail_code', ''),
        p_payload->>'raw_report_sha256'
    )
    ON CONFLICT (run_key) DO UPDATE SET
        status = EXCLUDED.status,
        scanner_version = EXCLUDED.scanner_version,
        finished_at = EXCLUDED.finished_at,
        vulnerability_db_updated_at = EXCLUDED.vulnerability_db_updated_at,
        image_count = EXCLUDED.image_count,
        critical_count = EXCLUDED.critical_count,
        high_count = EXCLUDED.high_count,
        fixable_count = EXCLUDED.fixable_count,
        urgent_count = EXCLUDED.urgent_count,
        attention_count = EXCLUDED.attention_count,
        ignored_count = EXCLUDED.ignored_count,
        detail_code = EXCLUDED.detail_code,
        raw_report_sha256 = EXCLUDED.raw_report_sha256;

    DELETE FROM public.system_service_scan_images WHERE run_key = v_run_key;
    INSERT INTO public.system_service_scan_images (
        run_key, image_key, image_ref, image_digest, service_group, exposure, container_count,
        critical_count, high_count, fixable_count, urgent_count, attention_count, ignored_count
    )
    SELECT
        v_run_key,
        image->>'image_key', image->>'image_ref', image->>'image_digest',
        image->>'service_group', image->>'exposure', (image->>'container_count')::SMALLINT,
        (image->>'critical_count')::INTEGER, (image->>'high_count')::INTEGER,
        (image->>'fixable_count')::INTEGER, (image->>'urgent_count')::INTEGER,
        (image->>'attention_count')::INTEGER,
        COALESCE((image->>'ignored_count')::INTEGER, 0)
    FROM jsonb_array_elements(v_images) image;

    RETURN v_run_key;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_get_service_management_v1(p_scan_limit INTEGER DEFAULT 12)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_scan_limit, 12), 1), 24);
    v_catalog JSONB;
    v_active_review JSONB;
    v_latest_review JSONB;
    v_latest_scan JSONB;
    v_scan_runs JSONB;
    v_review_due BOOLEAN := FALSE;
    v_review_attention INTEGER := 0;
    v_scan_attention INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can read service management' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'item_key', item_key, 'sort_order', sort_order, 'title', title, 'description', description
    ) ORDER BY sort_order), '[]'::JSONB)
    INTO v_catalog
    FROM public.system_service_review_catalog WHERE active IS TRUE;

    SELECT jsonb_build_object(
        'review_id', review.review_id,
        'status', review.status,
        'started_at', review.started_at,
        'items', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'item_key', item.item_key, 'status', item.status, 'note', item.note,
                'checked_at', item.checked_at
            ) ORDER BY catalog.sort_order)
            FROM public.system_service_review_items item
            JOIN public.system_service_review_catalog catalog USING (item_key)
            WHERE item.review_id = review.review_id
        ), '[]'::JSONB)
    ) INTO v_active_review
    FROM public.system_service_reviews review
    WHERE review.status = 'IN_PROGRESS'
    ORDER BY review.started_at DESC LIMIT 1;

    SELECT jsonb_build_object(
        'review_id', review.review_id,
        'status', review.status,
        'started_at', review.started_at,
        'completed_at', review.completed_at,
        'next_due_at', review.next_due_at,
        'attention_count', (SELECT count(*) FROM public.system_service_review_items item
                            WHERE item.review_id = review.review_id AND item.status = 'ATTENTION')
    ) INTO v_latest_review
    FROM public.system_service_reviews review
    WHERE review.status = 'COMPLETED'
    ORDER BY review.completed_at DESC LIMIT 1;

    SELECT to_jsonb(scan) || jsonb_build_object(
        'images', COALESCE((
            SELECT jsonb_agg(to_jsonb(image) - 'run_key'
                             ORDER BY image.urgent_count DESC, image.attention_count DESC, image.image_ref)
            FROM public.system_service_scan_images image WHERE image.run_key = scan.run_key
        ), '[]'::JSONB)
    ) INTO v_latest_scan
    FROM (
        SELECT run_key, status, scanner_name, scanner_version, started_at, finished_at,
               vulnerability_db_updated_at, image_count, critical_count, high_count,
               fixable_count, urgent_count, attention_count, ignored_count, detail_code
        FROM public.system_service_scan_runs ORDER BY finished_at DESC LIMIT 1
    ) scan;

    SELECT COALESCE(jsonb_agg(to_jsonb(scan) ORDER BY scan.finished_at DESC), '[]'::JSONB)
    INTO v_scan_runs
    FROM (
        SELECT run_key, status, finished_at, image_count, critical_count, high_count,
               fixable_count, urgent_count, attention_count, ignored_count, detail_code
        FROM public.system_service_scan_runs ORDER BY finished_at DESC LIMIT v_limit
    ) scan;

    v_review_due := COALESCE((v_latest_review->>'next_due_at')::TIMESTAMPTZ <= NOW(), FALSE);
    v_review_attention := COALESCE((v_latest_review->>'attention_count')::INTEGER, 0);
    v_scan_attention := COALESCE((v_latest_scan->>'urgent_count')::INTEGER, 0);

    RETURN jsonb_build_object(
        'server_time', NOW(),
        'review_interval_months', 3,
        'scan_interval_days', 30,
        'summary', jsonb_build_object(
            'review_initialized', v_latest_review IS NOT NULL,
            'review_in_progress', v_active_review IS NOT NULL,
            'review_due', v_review_due,
            'next_review_at', v_latest_review->'next_due_at',
            'review_attention_count', v_review_attention,
            'scan_initialized', v_latest_scan IS NOT NULL,
            'scan_failed', COALESCE(v_latest_scan->>'status', '') = 'FAIL',
            'scan_finished_at', v_latest_scan->'finished_at',
            'scan_urgent_count', v_scan_attention,
            'scan_attention_count', COALESCE((v_latest_scan->>'attention_count')::INTEGER, 0),
            'scan_ignored_count', COALESCE((v_latest_scan->>'ignored_count')::INTEGER, 0),
            'attention_count', CASE
                WHEN v_latest_review IS NULL AND v_active_review IS NULL AND v_latest_scan IS NULL THEN 0
                ELSE (CASE WHEN v_review_due THEN 1 ELSE 0 END)
                   + CASE WHEN v_active_review IS NOT NULL THEN 1 ELSE 0 END
                   + v_review_attention + v_scan_attention
                   + CASE WHEN COALESCE(v_latest_scan->>'status', '') = 'FAIL' THEN 1 ELSE 0 END
            END
        ),
        'catalog', v_catalog,
        'active_review', COALESCE(v_active_review, 'null'::JSONB),
        'latest_review', COALESCE(v_latest_review, 'null'::JSONB),
        'latest_scan', COALESCE(v_latest_scan, 'null'::JSONB),
        'scan_runs', v_scan_runs
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_service_scan_v1(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_service_scan_v1(JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.admin_get_service_management_v1(INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_service_management_v1(INTEGER) TO authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';

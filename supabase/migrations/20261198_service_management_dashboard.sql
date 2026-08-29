BEGIN;

-- 셀프호스팅 운영 점검과 이미지 CVE 요약 원장.
-- 원본 Trivy JSON·파일 경로·시크릿은 호스트에만 두고, 브라우저에는 관리자 RPC가 안전한 요약만 반환한다.
CREATE TABLE IF NOT EXISTS public.system_service_review_catalog (
    item_key TEXT PRIMARY KEY CHECK (item_key ~ '^[a-z0-9_]{3,50}$'),
    sort_order SMALLINT NOT NULL UNIQUE CHECK (sort_order BETWEEN 1 AND 200),
    title TEXT NOT NULL CHECK (char_length(title) BETWEEN 2 AND 80),
    description TEXT NOT NULL CHECK (char_length(description) BETWEEN 5 AND 240),
    active BOOLEAN NOT NULL DEFAULT TRUE
);

INSERT INTO public.system_service_review_catalog (item_key, sort_order, title, description)
VALUES
    ('network_exposure', 10, '외부·LAN 포트', 'Caddy 443 외 공개 포트와 공유기 22·28198 전달 여부를 확인합니다.'),
    ('ssh_tailscale', 20, 'SSH·Tailscale 접근', 'SSH 공개키 전용 로그인과 Tailscale ACL·분실 기기 제거 상태를 확인합니다.'),
    ('container_hardening', 30, '컨테이너 격리', '비root·read-only·cap drop·no-new-privileges와 Docker 소켓 미노출을 확인합니다.'),
    ('image_versions', 40, '이미지·호스트 버전', 'Docker·macOS·Caddy·Supabase와 앱 이미지 태그·digest 고정 상태를 확인합니다.'),
    ('secrets', 50, '비밀·환경파일', '.env 권한 600, 빌드 제외, 브라우저 service key 미노출을 확인합니다.'),
    ('certificates', 60, 'HTTPS·인증서', '공개 도메인의 TLS 인증서 만료, HSTS와 보안 헤더를 확인합니다.'),
    ('disk_logs', 70, '디스크·로그', '호스트·Docker VM·로그·백업 용량과 로그 회전 상태를 확인합니다.'),
    ('restart_health', 80, '재시작·서비스 상태', '반복 재시작, unhealthy 컨테이너와 최근 오류 추이를 확인합니다.'),
    ('backup_restore', 90, '백업·실제 복구', '3개 앱 3중 사본과 최근 월간 실제 복구 3/3을 확인합니다.'),
    ('recovery_keys', 100, '복구키·물리 보안', 'rclone crypt 복구키의 맥 밖 사본과 평문 보관 위험을 확인합니다.'),
    ('rpc_realtime', 110, 'DB·RPC·Realtime 표면', '불필요한 RPC·Edge 함수·Realtime publication과 RLS 예외를 확인합니다.'),
    ('cve_exceptions', 120, 'CVE 예외 재검토', '공개 경로·수정 가능 여부와 기존 예외 사유가 아직 유효한지 확인합니다.')
ON CONFLICT (item_key) DO UPDATE SET
    sort_order = EXCLUDED.sort_order,
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    active = TRUE;

CREATE TABLE IF NOT EXISTS public.system_service_reviews (
    review_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    next_due_at TIMESTAMPTZ,
    started_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    CHECK (
        (status = 'IN_PROGRESS' AND completed_at IS NULL AND next_due_at IS NULL)
        OR (status = 'COMPLETED' AND completed_at IS NOT NULL AND next_due_at IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_system_service_reviews_one_active
    ON public.system_service_reviews ((status)) WHERE status = 'IN_PROGRESS';
CREATE INDEX IF NOT EXISTS idx_system_service_reviews_completed
    ON public.system_service_reviews (completed_at DESC) WHERE status = 'COMPLETED';

CREATE TABLE IF NOT EXISTS public.system_service_review_items (
    review_id UUID NOT NULL REFERENCES public.system_service_reviews(review_id) ON DELETE CASCADE,
    item_key TEXT NOT NULL REFERENCES public.system_service_review_catalog(item_key),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PASS', 'ATTENTION', 'NA')),
    note TEXT NOT NULL DEFAULT '' CHECK (char_length(note) <= 240),
    checked_at TIMESTAMPTZ,
    checked_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    PRIMARY KEY (review_id, item_key)
);

CREATE TABLE IF NOT EXISTS public.system_service_scan_runs (
    run_key TEXT PRIMARY KEY CHECK (run_key ~ '^service-scan-[0-9]{8}T[0-9]{6}$'),
    status TEXT NOT NULL CHECK (status IN ('PASS', 'FAIL')),
    scanner_name TEXT NOT NULL DEFAULT 'trivy' CHECK (scanner_name ~ '^[a-z0-9_-]{2,30}$'),
    scanner_version TEXT NOT NULL CHECK (scanner_version ~ '^[A-Za-z0-9._+-]{1,40}$'),
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL,
    vulnerability_db_updated_at TIMESTAMPTZ,
    image_count SMALLINT NOT NULL CHECK (image_count BETWEEN 0 AND 100),
    critical_count INTEGER NOT NULL CHECK (critical_count BETWEEN 0 AND 1000000),
    high_count INTEGER NOT NULL CHECK (high_count BETWEEN 0 AND 1000000),
    fixable_count INTEGER NOT NULL CHECK (fixable_count BETWEEN 0 AND 1000000),
    urgent_count INTEGER NOT NULL CHECK (urgent_count BETWEEN 0 AND 1000000),
    attention_count INTEGER NOT NULL CHECK (attention_count BETWEEN 0 AND 1000000),
    detail_code TEXT NOT NULL DEFAULT '' CHECK (
        char_length(detail_code) <= 80 AND detail_code ~ '^[a-z0-9_,:-]*$'
    ),
    raw_report_sha256 TEXT NOT NULL CHECK (raw_report_sha256 ~ '^[a-f0-9]{64}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_system_service_scan_runs_finished
    ON public.system_service_scan_runs (finished_at DESC);

CREATE TABLE IF NOT EXISTS public.system_service_scan_images (
    run_key TEXT NOT NULL REFERENCES public.system_service_scan_runs(run_key) ON DELETE CASCADE,
    image_key TEXT NOT NULL CHECK (image_key ~ '^[a-f0-9]{12,64}$'),
    image_ref TEXT NOT NULL CHECK (
        char_length(image_ref) BETWEEN 1 AND 200
        AND image_ref ~ '^[A-Za-z0-9][A-Za-z0-9._/@:+-]*$'
    ),
    image_digest TEXT NOT NULL CHECK (image_digest ~ '^sha256:[a-f0-9]{64}$'),
    service_group TEXT NOT NULL CHECK (
        char_length(service_group) BETWEEN 1 AND 120
        AND service_group ~ '^[a-z0-9_,-]+$'
    ),
    exposure TEXT NOT NULL CHECK (exposure IN ('public', 'lan', 'internal', 'unknown')),
    container_count SMALLINT NOT NULL CHECK (container_count BETWEEN 1 AND 100),
    critical_count INTEGER NOT NULL CHECK (critical_count BETWEEN 0 AND 1000000),
    high_count INTEGER NOT NULL CHECK (high_count BETWEEN 0 AND 1000000),
    fixable_count INTEGER NOT NULL CHECK (fixable_count BETWEEN 0 AND 1000000),
    urgent_count INTEGER NOT NULL CHECK (urgent_count BETWEEN 0 AND 1000000),
    attention_count INTEGER NOT NULL CHECK (attention_count BETWEEN 0 AND 1000000),
    PRIMARY KEY (run_key, image_key)
);

CREATE INDEX IF NOT EXISTS idx_system_service_scan_images_attention
    ON public.system_service_scan_images (run_key, urgent_count DESC, attention_count DESC);

ALTER TABLE public.system_service_review_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_service_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_service_review_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_service_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_service_scan_images ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.system_service_review_catalog FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.system_service_reviews FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.system_service_review_items FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.system_service_scan_runs FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.system_service_scan_images FROM PUBLIC, anon, authenticated, service_role;

-- 호스트 검사기는 정규화된 숫자·이미지 식별자만 전달한다. 원본 JSON은 이 함수에 들어오지 않는다.
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
        fixable_count, urgent_count, attention_count, detail_code, raw_report_sha256
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
        detail_code = EXCLUDED.detail_code,
        raw_report_sha256 = EXCLUDED.raw_report_sha256;

    DELETE FROM public.system_service_scan_images WHERE run_key = v_run_key;
    INSERT INTO public.system_service_scan_images (
        run_key, image_key, image_ref, image_digest, service_group, exposure, container_count,
        critical_count, high_count, fixable_count, urgent_count, attention_count
    )
    SELECT
        v_run_key,
        image->>'image_key', image->>'image_ref', image->>'image_digest',
        image->>'service_group', image->>'exposure', (image->>'container_count')::SMALLINT,
        (image->>'critical_count')::INTEGER, (image->>'high_count')::INTEGER,
        (image->>'fixable_count')::INTEGER, (image->>'urgent_count')::INTEGER,
        (image->>'attention_count')::INTEGER
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
               fixable_count, urgent_count, attention_count, detail_code
        FROM public.system_service_scan_runs ORDER BY finished_at DESC LIMIT 1
    ) scan;

    SELECT COALESCE(jsonb_agg(to_jsonb(scan) ORDER BY scan.finished_at DESC), '[]'::JSONB)
    INTO v_scan_runs
    FROM (
        SELECT run_key, status, finished_at, image_count, critical_count, high_count,
               fixable_count, urgent_count, attention_count, detail_code
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

CREATE OR REPLACE FUNCTION public.admin_start_service_review_v1()
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_review_id UUID;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can start service reviews' USING ERRCODE = '42501';
    END IF;

    SELECT review_id INTO v_review_id
    FROM public.system_service_reviews WHERE status = 'IN_PROGRESS'
    ORDER BY started_at DESC LIMIT 1;
    IF v_review_id IS NOT NULL THEN RETURN v_review_id; END IF;

    INSERT INTO public.system_service_reviews (started_by)
    VALUES (auth.uid()) RETURNING review_id INTO v_review_id;
    INSERT INTO public.system_service_review_items (review_id, item_key)
    SELECT v_review_id, item_key FROM public.system_service_review_catalog WHERE active IS TRUE;
    RETURN v_review_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_set_service_review_item_v1(
    p_review_id UUID,
    p_item_key TEXT,
    p_status TEXT,
    p_note TEXT DEFAULT ''
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can update service reviews' USING ERRCODE = '42501';
    END IF;
    IF p_status NOT IN ('PENDING', 'PASS', 'ATTENTION', 'NA')
       OR char_length(COALESCE(p_note, '')) > 240 THEN
        RAISE EXCEPTION 'Invalid service review item' USING ERRCODE = '22023';
    END IF;

    UPDATE public.system_service_review_items item
    SET status = p_status,
        note = COALESCE(p_note, ''),
        checked_at = CASE WHEN p_status = 'PENDING' THEN NULL ELSE NOW() END,
        checked_by = CASE WHEN p_status = 'PENDING' THEN NULL ELSE auth.uid() END
    FROM public.system_service_reviews review
    WHERE item.review_id = p_review_id AND item.item_key = p_item_key
      AND review.review_id = item.review_id AND review.status = 'IN_PROGRESS';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Active service review item not found' USING ERRCODE = 'P0002';
    END IF;
    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_complete_service_review_v1(p_review_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pending INTEGER;
    v_attention INTEGER;
    v_completed TIMESTAMPTZ := NOW();
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can complete service reviews' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.system_service_reviews
                   WHERE review_id = p_review_id AND status = 'IN_PROGRESS') THEN
        RAISE EXCEPTION 'Active service review not found' USING ERRCODE = 'P0002';
    END IF;

    SELECT count(*) FILTER (WHERE status = 'PENDING'), count(*) FILTER (WHERE status = 'ATTENTION')
    INTO v_pending, v_attention
    FROM public.system_service_review_items WHERE review_id = p_review_id;
    IF v_pending > 0 THEN
        RAISE EXCEPTION 'Every checklist item must be reviewed' USING ERRCODE = '23514';
    END IF;

    UPDATE public.system_service_reviews
    SET status = 'COMPLETED', completed_at = v_completed,
        next_due_at = v_completed + INTERVAL '3 months', completed_by = auth.uid()
    WHERE review_id = p_review_id;

    RETURN jsonb_build_object(
        'review_id', p_review_id,
        'completed_at', v_completed,
        'next_due_at', v_completed + INTERVAL '3 months',
        'attention_count', v_attention
    );
END;
$$;

REVOKE ALL ON FUNCTION public.record_service_scan_v1(JSONB) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_service_scan_v1(JSONB) TO service_role;
REVOKE ALL ON FUNCTION public.admin_get_service_management_v1(INTEGER) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_get_service_management_v1(INTEGER) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_start_service_review_v1() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_start_service_review_v1() TO authenticated;
REVOKE ALL ON FUNCTION public.admin_set_service_review_item_v1(UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_set_service_review_item_v1(UUID, TEXT, TEXT, TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.admin_complete_service_review_v1(UUID) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_complete_service_review_v1(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- 다했니 쿠키 → 아지트 "다했니 포인트" 연동 (2026-09-16)
--
-- 계획: DAHANDIN_COOKIE_SYNC_PLAN.md
-- 요약:
--   · 교사마다 자기 다했니 API 키를 입력한다(공용 키 아님). 키는 엣지 함수가 AES-GCM 으로
--     암호화해 저장하고, 평문·암호문 모두 클라이언트로 돌려주지 않는다(마지막 4자리만 노출).
--   · 학생 이름·다했니 코드를 매칭해 두고, 누적 쿠키의 증가분(delta)만 "다했니 포인트"로 지급한다.
--   · 자동 정산(끔/매일/매주)을 반별로 설정한다. 실제 정산은 엣지 함수가 수행한다.
--   · 코어 point_engine_apply 는 건드리지 않는다. 전용 RPC 가 event_key 로 중복지급을 막고
--     metadata.source='dahandin_cookie' 로 대시보드 집계용 표식을 남긴다.
--
-- 보안: 키 복호화·다했니 호출·포인트 지급은 엣지 함수(service_role)만 한다.
--       교사는 자기 학급 설정·매칭·내역만 본다(RLS). 암호문 컬럼은 클라이언트가 못 읽는다(컬럼 권한).

BEGIN;

-- ─────────────────────────────────────────────────────────────
-- 1) 교사별 자격증명 (암호화 저장)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dahandin_teacher_credentials (
    teacher_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    key_ciphertext TEXT NOT NULL,   -- AES-256-GCM 암호문 (base64)
    key_iv TEXT NOT NULL,           -- 12바이트 IV (base64), 저장마다 새로 생성
    key_last4 TEXT,                 -- 화면 표시용 마지막 4자리
    key_valid BOOLEAN NOT NULL DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 2) 반별 연동 설정 (환율·켜짐·자동 정산 주기)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dahandin_class_settings (
    class_id UUID PRIMARY KEY REFERENCES public.classes(id) ON DELETE CASCADE,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    points_per_cookie INTEGER NOT NULL DEFAULT 10 CHECK (points_per_cookie BETWEEN 0 AND 1000),
    auto_schedule TEXT NOT NULL DEFAULT 'off' CHECK (auto_schedule IN ('off','daily','weekly')),
    schedule_weekday SMALLINT CHECK (schedule_weekday BETWEEN 0 AND 6), -- 0=일요일 (weekly 일 때)
    schedule_hour SMALLINT NOT NULL DEFAULT 17 CHECK (schedule_hour BETWEEN 0 AND 23), -- KST 시각
    last_run_on DATE,   -- 마지막 자동 정산 날짜(KST) — 같은 날 중복 실행 방지
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────
-- 3) 학생 ↔ 다했니 코드 매칭 + delta 기준선
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dahandin_student_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    dahandin_code TEXT NOT NULL,
    last_cookie INTEGER NOT NULL DEFAULT 0,  -- 마지막으로 포인트에 반영한 누적 쿠키
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (class_id, student_id),
    UNIQUE (class_id, dahandin_code)
);
CREATE INDEX IF NOT EXISTS idx_dahandin_links_class ON public.dahandin_student_links (class_id);

-- ─────────────────────────────────────────────────────────────
-- 4) 정산 실행 로그 + 학생별 상세 (대시보드용)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dahandin_sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    trigger TEXT NOT NULL DEFAULT 'manual' CHECK (trigger IN ('manual','auto')),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    ok_count INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    total_points_granted INTEGER NOT NULL DEFAULT 0,
    note TEXT
);
CREATE INDEX IF NOT EXISTS idx_dahandin_runs_class ON public.dahandin_sync_runs (class_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.dahandin_sync_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_id UUID NOT NULL REFERENCES public.dahandin_sync_runs(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    dahandin_code TEXT,
    prev_cookie INTEGER,
    new_cookie INTEGER,
    delta_cookie INTEGER,
    points_granted INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','skip','fail')),
    message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_dahandin_items_run ON public.dahandin_sync_items (run_id);
CREATE INDEX IF NOT EXISTS idx_dahandin_items_class ON public.dahandin_sync_items (class_id, created_at DESC);

-- ─────────────────────────────────────────────────────────────
-- 5) RLS
-- ─────────────────────────────────────────────────────────────
ALTER TABLE public.dahandin_teacher_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dahandin_class_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dahandin_student_links       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dahandin_sync_runs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dahandin_sync_items          ENABLE ROW LEVEL SECURITY;

-- 자격증명: 본인 것만 조회. 쓰기는 엣지 함수(service_role, RLS 우회)만 → authenticated 쓰기 정책 없음.
-- 암호문 컬럼은 아래 컬럼 권한으로 클라이언트 SELECT 를 차단한다.
DROP POLICY IF EXISTS dahandin_cred_select_own ON public.dahandin_teacher_credentials;
CREATE POLICY dahandin_cred_select_own ON public.dahandin_teacher_credentials
    FOR SELECT TO authenticated
    USING (teacher_id = auth.uid());

REVOKE ALL ON public.dahandin_teacher_credentials FROM authenticated;
GRANT SELECT (teacher_id, key_last4, key_valid, verified_at, created_at, updated_at)
    ON public.dahandin_teacher_credentials TO authenticated;

-- 학급 소유 여부 헬퍼(담임 또는 ADMIN)
CREATE OR REPLACE FUNCTION public.dahandin_can_manage_class(p_class_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT public.auth_user_role() = 'ADMIN'
        OR EXISTS (
            SELECT 1 FROM public.classes c
            WHERE c.id = p_class_id AND c.teacher_id = auth.uid()
        );
$$;

-- 반 설정: 담임/ADMIN 이 자기 학급 것을 CRUD
DROP POLICY IF EXISTS dahandin_settings_all ON public.dahandin_class_settings;
CREATE POLICY dahandin_settings_all ON public.dahandin_class_settings
    FOR ALL TO authenticated
    USING (public.dahandin_can_manage_class(class_id))
    WITH CHECK (public.dahandin_can_manage_class(class_id));

-- 학생 매칭: 담임/ADMIN 이 자기 학급 것을 CRUD
DROP POLICY IF EXISTS dahandin_links_all ON public.dahandin_student_links;
CREATE POLICY dahandin_links_all ON public.dahandin_student_links
    FOR ALL TO authenticated
    USING (public.dahandin_can_manage_class(class_id))
    WITH CHECK (public.dahandin_can_manage_class(class_id));

-- 정산 로그·상세: 담임/ADMIN 조회만(쓰기는 service_role)
DROP POLICY IF EXISTS dahandin_runs_select ON public.dahandin_sync_runs;
CREATE POLICY dahandin_runs_select ON public.dahandin_sync_runs
    FOR SELECT TO authenticated
    USING (public.dahandin_can_manage_class(class_id));

DROP POLICY IF EXISTS dahandin_items_select ON public.dahandin_sync_items;
CREATE POLICY dahandin_items_select ON public.dahandin_sync_items
    FOR SELECT TO authenticated
    USING (public.dahandin_can_manage_class(class_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dahandin_class_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.dahandin_student_links TO authenticated;
GRANT SELECT ON public.dahandin_sync_runs TO authenticated;
GRANT SELECT ON public.dahandin_sync_items TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 6) 포인트 지급 RPC (service_role 전용)
--    코어 point_engine_apply 를 건드리지 않고, event_key 로 중복지급을 막는다.
--    학생 내역에는 reason '다했니 포인트' 로, 대시보드 집계는 metadata.source 로 한다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.award_dahandin_cookie_points_v1(
    p_student_id UUID,
    p_amount INTEGER,
    p_event_key TEXT,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_runtime_role TEXT := current_setting('role', true);
    v_meta JSONB;
BEGIN
    -- 엣지 함수(service_role)만 호출할 수 있다.
    IF auth.uid() IS NOT NULL
       OR v_runtime_role NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
        RAISE EXCEPTION '[보안] 다했니 포인트 지급 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_amount IS NULL OR p_amount <= 0 THEN
        RAISE EXCEPTION '지급 포인트는 1 이상이어야 합니다.' USING ERRCODE = '22023';
    END IF;

    v_meta := COALESCE(p_metadata, '{}'::JSONB) || jsonb_build_object('source', 'dahandin_cookie');

    RETURN public.point_engine_apply(
        p_student_id,
        p_amount,
        '다했니 포인트',
        'private_adjustment',   -- 코어 화이트리스트에 있는 유형(대시보드 구분은 metadata.source)
        p_event_key,
        NULL,
        NULL,
        v_meta
    );
END;
$$;

REVOKE ALL ON FUNCTION public.award_dahandin_cookie_points_v1(UUID, INTEGER, TEXT, JSONB)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_dahandin_cookie_points_v1(UUID, INTEGER, TEXT, JSONB)
    TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 7) 자동 정산 대상 학급 판정 (service_role 전용)
--    cron 이 주기적으로 부르면, 지금 정산할 학급 목록을 KST 기준으로 돌려준다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.dahandin_due_classes_v1()
RETURNS TABLE (class_id UUID)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_runtime_role TEXT := current_setting('role', true);
    v_now_kst TIMESTAMP := (NOW() AT TIME ZONE 'Asia/Seoul');
    v_today DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;
    v_hour INTEGER := EXTRACT(HOUR FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::INTEGER;
    v_dow INTEGER := EXTRACT(DOW FROM (NOW() AT TIME ZONE 'Asia/Seoul'))::INTEGER; -- 0=일
BEGIN
    IF auth.uid() IS NOT NULL
       OR v_runtime_role NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
        RAISE EXCEPTION '[보안] 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT s.class_id
    FROM public.dahandin_class_settings s
    WHERE s.enabled
      AND s.auto_schedule <> 'off'
      AND (s.last_run_on IS DISTINCT FROM v_today)
      AND v_hour >= s.schedule_hour
      AND (
            s.auto_schedule = 'daily'
            OR (s.auto_schedule = 'weekly' AND s.schedule_weekday = v_dow)
      );
END;
$$;

REVOKE ALL ON FUNCTION public.dahandin_due_classes_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dahandin_due_classes_v1() TO service_role;

-- ─────────────────────────────────────────────────────────────
-- 8) 대시보드 조회 RPC (담임/ADMIN)
--    요약 + 일자별 추이 + 학생별 합계 + 최근 실행을 한 번에 돌려준다.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_dahandin_dashboard_v1(
    p_class_id UUID,
    p_days INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_days INTEGER := LEAST(GREATEST(COALESCE(p_days, 30), 1), 180);
    v_since DATE := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE - (v_days - 1);
    v_result JSONB;
BEGIN
    IF NOT public.dahandin_can_manage_class(p_class_id) THEN
        RAISE EXCEPTION '[보안] 이 학급을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH grants AS (
        SELECT pl.student_id, pl.amount, pl.created_at,
               (pl.created_at AT TIME ZONE 'Asia/Seoul')::DATE AS day_kst
        FROM public.point_logs pl
        JOIN public.students st ON st.id = pl.student_id
        WHERE st.class_id = p_class_id
          AND pl.metadata->>'source' = 'dahandin_cookie'
          AND (pl.created_at AT TIME ZONE 'Asia/Seoul')::DATE >= v_since
    ),
    daily AS (
        SELECT day_kst, SUM(amount)::INTEGER AS points, COUNT(*)::INTEGER AS grants
        FROM grants GROUP BY day_kst ORDER BY day_kst
    ),
    per_student AS (
        SELECT g.student_id, st.name, SUM(g.amount)::INTEGER AS points, COUNT(*)::INTEGER AS grants
        FROM grants g JOIN public.students st ON st.id = g.student_id
        GROUP BY g.student_id, st.name ORDER BY SUM(g.amount) DESC
    ),
    runs AS (
        SELECT r.id, r.trigger, r.started_at, r.finished_at,
               r.ok_count, r.fail_count, r.total_points_granted, r.note
        FROM public.dahandin_sync_runs r
        WHERE r.class_id = p_class_id
        ORDER BY r.started_at DESC LIMIT 20
    )
    SELECT jsonb_build_object(
        'class_id', p_class_id,
        'days', v_days,
        'summary', jsonb_build_object(
            'total_points', COALESCE((SELECT SUM(points) FROM daily), 0),
            'total_grants', COALESCE((SELECT SUM(grants) FROM daily), 0),
            'student_count', COALESCE((SELECT COUNT(*) FROM per_student), 0),
            'linked_count', COALESCE((SELECT COUNT(*) FROM public.dahandin_student_links l
                                       WHERE l.class_id = p_class_id AND l.active), 0)
        ),
        'settings', (
            SELECT to_jsonb(cs) - 'class_id'
            FROM public.dahandin_class_settings cs WHERE cs.class_id = p_class_id
        ),
        'daily', COALESCE((SELECT jsonb_agg(to_jsonb(daily)) FROM daily), '[]'::JSONB),
        'per_student', COALESCE((SELECT jsonb_agg(to_jsonb(per_student)) FROM per_student), '[]'::JSONB),
        'recent_runs', COALESCE((SELECT jsonb_agg(to_jsonb(runs)) FROM runs), '[]'::JSONB)
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_dahandin_dashboard_v1(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_dahandin_dashboard_v1(UUID, INTEGER) TO authenticated;

COMMIT;

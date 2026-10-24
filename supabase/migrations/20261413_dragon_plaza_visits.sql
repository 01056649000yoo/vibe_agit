-- 우리반 수호룡 광장(2026-10-24 선생님 결정): "내 아지트를 누군가 보고 있다"는 신호용 방문 기록 + 기본 켜짐.
--
--  1) `hideout_visits`: 친구 아지트를 연 사람을 **이번 주(월요일 시작, 한국 시간)** 단위로 한 줄씩 남긴다.
--     광장에서 들어오든 `친구 아지트` 목록에서 들어오든 같은 곳(`record_hideout_visit_v1`)에 쌓인다.
--  2) `get_my_hideout_visitors_v1`: **내 아지트에 온 친구**만, 이름 목록으로 돌려준다. 횟수·순위는 돌려주지 않는다(신호일 뿐).
--  3) 같은 학급 안에서만, 나 자신은 기록하지 않는다. 같은 친구가 10분 안에 다시 열어도 한 번으로 센다(화면을 껐다 켜는 것 방지).
--  4) 새 모듈 `dragon-plaza` 를 기본 켜짐으로: 설정 안 한 학급(NULL)은 앱이 켜진 것으로 읽고, 모듈 목록을 저장한 학급에는 이름을 더한다.
BEGIN;

CREATE TABLE public.hideout_visits (
    owner_student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    visitor_student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    week_start DATE NOT NULL,
    first_visit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_visit_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    visit_count INTEGER NOT NULL DEFAULT 1 CHECK (visit_count >= 1),
    PRIMARY KEY (owner_student_id, visitor_student_id, week_start),
    CHECK (owner_student_id <> visitor_student_id)
);
CREATE INDEX idx_hideout_visits_owner_week ON public.hideout_visits (owner_student_id, week_start, last_visit_at DESC);
ALTER TABLE public.hideout_visits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.hideout_visits FROM PUBLIC, anon, authenticated;

-- 이번 주 월요일(한국 시간)
CREATE OR REPLACE FUNCTION public.hideout_week_start_v1(p_at TIMESTAMPTZ DEFAULT NOW())
RETURNS DATE LANGUAGE sql IMMUTABLE SET search_path TO 'pg_catalog'
AS $$ SELECT date_trunc('week', p_at AT TIME ZONE 'Asia/Seoul')::DATE $$;
REVOKE ALL ON FUNCTION public.hideout_week_start_v1(TIMESTAMPTZ) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hideout_week_start_v1(TIMESTAMPTZ) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_hideout_visit_v1(p_owner_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_visitor UUID := public.auth_student_id();
    v_class UUID := public.auth_user_class_id();
    v_week DATE := public.hideout_week_start_v1();
    v_changed INTEGER;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_visitor IS NULL OR v_class IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    -- 나 자신이거나 같은 학급 친구가 아니면 아무것도 남기지 않는다(오류로 화면을 막지도 않는다).
    IF p_owner_id IS NULL OR p_owner_id = v_visitor OR NOT EXISTS (
        SELECT 1 FROM public.students owner_row
        WHERE owner_row.id = p_owner_id AND owner_row.class_id = v_class
          AND owner_row.is_active IS DISTINCT FROM FALSE AND (owner_row.deleted_at IS NULL OR owner_row.deleted_at > NOW())
    ) THEN
        RETURN jsonb_build_object('success', TRUE, 'recorded', FALSE);
    END IF;
    INSERT INTO public.hideout_visits AS visit (owner_student_id, visitor_student_id, class_id, week_start)
    VALUES (p_owner_id, v_visitor, v_class, v_week)
    ON CONFLICT (owner_student_id, visitor_student_id, week_start) DO UPDATE
       SET visit_count = visit.visit_count + CASE WHEN visit.last_visit_at < NOW() - INTERVAL '10 minutes' THEN 1 ELSE 0 END,
           last_visit_at = NOW();
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    RETURN jsonb_build_object('success', TRUE, 'recorded', v_changed > 0);
END;
$fn$;
REVOKE ALL ON FUNCTION public.record_hideout_visit_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_hideout_visit_v1(UUID) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_hideout_visitors_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
    v_owner UUID := public.auth_student_id();
    v_week DATE := public.hideout_week_start_v1();
    v_items JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_owner IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'visitor_id', visitor.id, 'name', visitor.name, 'last_visit_at', visit.last_visit_at
           ) ORDER BY visit.last_visit_at DESC), '[]'::JSONB)
    INTO v_items
    FROM (
        SELECT item.* FROM public.hideout_visits item
        WHERE item.owner_student_id = v_owner AND item.week_start = v_week
        ORDER BY item.last_visit_at DESC LIMIT 60
    ) visit
    JOIN public.students visitor ON visitor.id = visit.visitor_student_id
     AND visitor.is_active IS DISTINCT FROM FALSE AND (visitor.deleted_at IS NULL OR visitor.deleted_at > NOW());
    RETURN jsonb_build_object('week_start', v_week, 'visitors', v_items);
END;
$fn$;
REVOKE ALL ON FUNCTION public.get_my_hideout_visitors_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_hideout_visitors_v1() TO authenticated, service_role;

-- 기본 켜짐: 모듈 목록을 저장한 학급에 광장을 더한다(설정 안 한 학급은 앱이 켜진 것으로 읽는다).
UPDATE public.classes
SET enabled_modules = array_append(enabled_modules, 'dragon-plaza')
WHERE deleted_at IS NULL AND enabled_modules IS NOT NULL AND NOT ('dragon-plaza' = ANY(enabled_modules));

COMMIT;

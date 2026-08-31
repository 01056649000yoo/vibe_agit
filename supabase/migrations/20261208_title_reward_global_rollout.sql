-- 칭호 보상을 전체 학급에 열되, 전역 OFF와 학급별 예외를 계속 유지한다.
-- 새 학급도 빠지지 않도록 학급 생성과 동시에 첫 공용 칭호 시즌을 만든다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.title_reward_rollout_state (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    globally_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    enabled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    enabled_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.title_reward_rollout_state(singleton, globally_enabled)
VALUES (TRUE, FALSE)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.title_reward_rollout_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.title_reward_rollout_state FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.title_reward_rollout_state TO service_role;

COMMENT ON TABLE public.title_reward_rollout_state IS
    '칭호 단계 보상의 전역 공개 스위치. 학급별 등록 행이 있으면 그 값이 전역값보다 우선한다.';

CREATE OR REPLACE FUNCTION public.create_title_season_for_new_class_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.dragon_growth_seasons (
        class_id, season_number, name, started_at, status, created_by
    ) VALUES (
        NEW.id,
        1,
        '1번째 시즌',
        COALESCE(NEW.season_started_at, NEW.created_at, NOW()),
        'active',
        NEW.teacher_id
    )
    ON CONFLICT (class_id, season_number) DO NOTHING;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.create_title_season_for_new_class_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_title_season_for_new_class_v1() TO service_role;

DROP TRIGGER IF EXISTS trg_create_title_season_for_new_class ON public.classes;
CREATE TRIGGER trg_create_title_season_for_new_class
    AFTER INSERT ON public.classes
    FOR EACH ROW EXECUTE FUNCTION public.create_title_season_for_new_class_v1();

-- 이전 배포와 학급 생성 사이에 생긴 누락이 있다면 같은 마이그레이션에서 채운다.
INSERT INTO public.dragon_growth_seasons (
    class_id, season_number, name, started_at, status, created_by
)
SELECT class_row.id, 1, '1번째 시즌',
       COALESCE(class_row.season_started_at, class_row.created_at, NOW()),
       'active', class_row.teacher_id
FROM public.classes class_row
WHERE NOT EXISTS (
    SELECT 1 FROM public.dragon_growth_seasons season WHERE season.class_id = class_row.id
)
ON CONFLICT (class_id, season_number) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_title_season_context_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'id', season.id,
        'class_id', season.class_id,
        'number', season.season_number,
        'name', season.name,
        'status', season.status,
        'started_at', season.started_at,
        'closing_started_at', season.closing_started_at,
        'closed_at', season.closed_at,
        'reward_policy', season.title_reward_policy,
        'rewards_enabled', COALESCE(rollout.enabled, global_state.globally_enabled, FALSE),
        'reward_global_enabled', COALESCE(global_state.globally_enabled, FALSE),
        'reward_class_override', rollout.enabled
    )
    FROM public.dragon_growth_seasons season
    LEFT JOIN public.title_reward_rollout_classes rollout ON rollout.class_id = season.class_id
    LEFT JOIN public.title_reward_rollout_state global_state ON global_state.singleton = TRUE
    WHERE season.class_id = p_class_id
    ORDER BY (season.status IN ('active', 'closing')) DESC, season.season_number DESC
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_title_season_context_v1(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_title_season_context_v1(UUID) TO service_role;

COMMENT ON FUNCTION public.get_title_season_context_v1(UUID) IS
    '학급의 최신 칭호 시즌과 보상 정책·전역 공개·학급별 우선 예외를 내부 RPC에 제공한다.';

CREATE OR REPLACE FUNCTION public.set_title_reward_rollout_global_v1(p_enabled BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION '관리자만 칭호 보상 전체 공개를 바꿀 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.title_reward_rollout_state (
        singleton, globally_enabled, enabled_by, enabled_at, updated_at
    ) VALUES (
        TRUE, p_enabled, auth.uid(), CASE WHEN p_enabled THEN v_now ELSE NULL END, v_now
    )
    ON CONFLICT (singleton) DO UPDATE
    SET globally_enabled = EXCLUDED.globally_enabled,
        enabled_by = EXCLUDED.enabled_by,
        enabled_at = CASE
            WHEN EXCLUDED.globally_enabled THEN v_now
            ELSE title_reward_rollout_state.enabled_at
        END,
        updated_at = v_now;

    RETURN jsonb_build_object(
        'globally_enabled', p_enabled,
        'updated_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_title_reward_rollout_global_v1(BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_title_reward_rollout_global_v1(BOOLEAN) TO authenticated, service_role;

COMMENT ON FUNCTION public.set_title_reward_rollout_global_v1(BOOLEAN) IS
    '관리자가 칭호 단계 보상을 모든 현재·미래 학급에 공개하거나 전역 중단한다. 학급별 명시값이 우선한다.';

NOTIFY pgrst, 'reload schema';
COMMIT;

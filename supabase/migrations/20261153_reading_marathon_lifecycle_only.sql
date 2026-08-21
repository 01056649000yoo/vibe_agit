-- 독서마라톤은 일반 기능 스위치가 아니라 시작과 종료가 있는 기간형 활동이다.
-- 이미 시작한 캠페인은 완주 또는 중간 종료 전까지 계속 운영하며 paused 상태를 만들지 않는다.

BEGIN;

-- 이전 버전의 사용 안 함 스위치가 만든 진행 중 캠페인을 기록 손실 없이 다시 운영 상태로 돌린다.
UPDATE public.reading_marathon_campaigns campaign
SET status = 'active',
    updated_at = clock_timestamp()
WHERE campaign.archived_at IS NULL
  AND campaign.started_at IS NOT NULL
  AND campaign.status = 'paused';

-- 일부 환경에 즉시 전환 RPC가 수동 적용됐더라도 더 이상 우회 경로로 남기지 않는다.
DROP FUNCTION IF EXISTS public.set_teacher_reading_marathon_enabled_v1(UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.enforce_reading_marathon_lifecycle_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF OLD.archived_at IS NULL
       AND OLD.started_at IS NOT NULL
       AND OLD.status IN ('active', 'paused')
       AND NEW.status = 'paused' THEN
        NEW.status := 'active';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_reading_marathon_lifecycle
    ON public.reading_marathon_campaigns;
CREATE TRIGGER trg_enforce_reading_marathon_lifecycle
BEFORE UPDATE OF status ON public.reading_marathon_campaigns
FOR EACH ROW
EXECUTE FUNCTION public.enforce_reading_marathon_lifecycle_v1();

REVOKE ALL ON FUNCTION public.enforce_reading_marathon_lifecycle_v1()
    FROM PUBLIC, anon, authenticated;

COMMIT;

-- 독서마라톤 사용 여부는 다른 설정 초안과 분리해 스위치를 누르는 즉시 저장한다.
-- 진행 기록·참가자·경기 설정은 건드리지 않고 현재 캠페인의 active/paused 상태만 바꾼다.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_teacher_reading_marathon_enabled_v1(
    p_class_id UUID,
    p_enabled BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_enabled IS NULL THEN
        RAISE EXCEPTION '사용 여부를 다시 선택해주세요.' USING ERRCODE = '22023';
    END IF;

    PERFORM 1
    FROM public.classes class
    WHERE class.id = p_class_id
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 독서마라톤을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT campaign.*
    INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = p_class_id
      AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC, campaign.id DESC
    LIMIT 1
    FOR UPDATE;

    IF v_campaign.id IS NULL OR v_campaign.started_at IS NULL THEN
        RAISE EXCEPTION '시작한 독서마라톤이 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF v_campaign.status = 'completed' THEN
        RAISE EXCEPTION '완주한 마라톤은 결과를 보관한 뒤 새 마라톤을 시작해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_enabled AND v_campaign.ends_on IS NOT NULL AND v_campaign.ends_on < CURRENT_DATE THEN
        RAISE EXCEPTION '종료일이 지난 마라톤은 다시 표시할 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.reading_marathon_campaigns campaign
    SET status = CASE WHEN p_enabled THEN 'active' ELSE 'paused' END,
        updated_at = clock_timestamp()
    WHERE campaign.id = v_campaign.id
      AND campaign.class_id = p_class_id;

    RETURN public.get_reading_marathon_snapshot_v2(p_class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_teacher_reading_marathon_enabled_v1(UUID, BOOLEAN)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_teacher_reading_marathon_enabled_v1(UUID, BOOLEAN)
    TO authenticated, service_role;

COMMIT;

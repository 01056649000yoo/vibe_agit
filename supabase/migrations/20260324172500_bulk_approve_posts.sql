-- bulk_approve_posts RPC 추가
-- 입력받은 JSON 배열을 순회하며 일괄로 글을 승인하고 포인트를 지급합니다.
CREATE OR REPLACE FUNCTION public.bulk_approve_posts(
    p_submissions JSONB
)
RETURNS void AS $$
DECLARE
    item JSONB;
    v_post_id UUID;
    v_student_id UUID;
    v_mission_id UUID;
    v_amount INTEGER;
    v_reason TEXT;
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    -- 권한 체크 (교사 또는 관리자)
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        IF current_setting('role') = 'service_role' THEN
            v_is_authorized := true;
        END IF;
    ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role IN ('ADMIN', 'TEACHER')) INTO v_is_authorized;
    END IF;

    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 일괄 승인 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    -- JSON 배열 순회
    FOR item IN SELECT * FROM jsonb_array_elements(p_submissions)
    LOOP
        v_post_id := (item->>'post_id')::UUID;
        v_student_id := (item->>'student_id')::UUID;
        v_mission_id := (item->>'mission_id')::UUID;
        v_amount := (item->>'amount')::INTEGER;
        v_reason := item->>'reason';

        -- 1. 글 승인 상태 업데이트
        UPDATE public.student_posts
        SET is_confirmed = true
        WHERE id = v_post_id;

        -- 2. 개별 포인트 적립 RPC 호출 (내부적으로 포인트 업데이트 및 로그 삽입 처리)
        PERFORM public.increment_student_points(
            v_student_id,
            v_amount,
            v_reason,
            v_post_id,
            v_mission_id
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 권한 부여
GRANT EXECUTE ON FUNCTION public.bulk_approve_posts(JSONB) TO anon, authenticated;

-- PostgREST 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

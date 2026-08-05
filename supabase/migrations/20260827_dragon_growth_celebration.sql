-- 작가 칭호 상승 시 수호룡 성장 연출을 기기마다 반복하지 않도록 서버에 확인 단계를 기록한다.
-- 실제 칭호와 관리용 테스트 칭호는 별도 키를 사용해 테스트 종료 후 실제 성장 알림을 막지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.acknowledge_my_dragon_growth()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_pet_data JSONB;
    v_title_status JSONB;
    v_writer_chars BIGINT := 0;
    v_writer_posts INTEGER := 0;
    v_writer_level_override INTEGER;
    v_actual_level INTEGER := 1;
    v_effective_level INTEGER := 1;
    v_acknowledgment_key TEXT;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT COALESCE(s.pet_data, '{}'::JSONB)
    INTO v_pet_data
    FROM public.students s
    WHERE s.id = v_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_title_status := public.get_my_title_status();
    v_writer_chars := COALESCE((v_title_status ->> 'writer_total_chars')::BIGINT, 0);
    v_writer_posts := COALESCE((v_title_status ->> 'writer_completed_posts')::INTEGER, 0);
    v_writer_level_override := NULLIF(v_title_status ->> 'writer_level_override', '')::INTEGER;

    v_actual_level := CASE
        WHEN v_writer_chars >= 26000 THEN 10
        WHEN v_writer_chars >= 15600 THEN 9
        WHEN v_writer_chars >= 10920 THEN 8
        WHEN v_writer_chars >= 5460 THEN 7
        WHEN v_writer_chars >= 3250 THEN 6
        WHEN v_writer_chars >= 1820 THEN 5
        WHEN v_writer_chars >= 910 THEN 4
        WHEN v_writer_chars >= 390 THEN 3
        WHEN v_writer_posts >= 1 THEN 2
        ELSE 1
    END;

    IF v_writer_level_override BETWEEN 1 AND 10 THEN
        v_effective_level := v_writer_level_override;
        v_acknowledgment_key := 'lastCelebratedTestWriterLevel';
    ELSE
        v_effective_level := v_actual_level;
        v_acknowledgment_key := 'lastCelebratedWriterLevel';
    END IF;

    v_pet_data := jsonb_set(
        v_pet_data,
        ARRAY[v_acknowledgment_key],
        to_jsonb(v_effective_level),
        true
    );

    UPDATE public.students
    SET pet_data = v_pet_data
    WHERE id = v_student_id;

    RETURN jsonb_build_object(
        'success', true,
        'level', v_effective_level,
        'is_test_override', v_writer_level_override IS NOT NULL,
        'pet_data', v_pet_data
    );
END;
$$;

REVOKE ALL ON FUNCTION public.acknowledge_my_dragon_growth() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.acknowledge_my_dragon_growth() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 관리용 작가 단계 오버라이드를 받은 테스트 학생도 3단계 재선택 흐름을 시험할 수 있게 한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_my_dragon_species(
    p_species TEXT,
    p_reselect BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_pet_data JSONB;
    v_current_species TEXT;
    v_title_status JSONB;
    v_writer_chars BIGINT := 0;
    v_writer_level_override INTEGER;
    v_now TEXT := to_char(clock_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF p_species NOT IN ('star', 'forest', 'ember', 'moon') THEN
        RAISE EXCEPTION '선택할 수 없는 수호룡입니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COALESCE(s.pet_data, '{}'::JSONB)
    INTO v_pet_data
    FROM public.students s
    WHERE s.id = v_student_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    v_current_species := NULLIF(v_pet_data ->> 'species', '');

    IF v_current_species IS NULL THEN
        v_pet_data := v_pet_data || jsonb_build_object(
            'species', p_species,
            'speciesSelectedAt', v_now
        );
    ELSIF v_current_species = p_species THEN
        RETURN jsonb_build_object('success', true, 'pet_data', v_pet_data, 'changed', false);
    ELSE
        IF NOT p_reselect THEN
            RAISE EXCEPTION '수호룡 변경은 작가 3단계의 다시 선택을 이용해야 합니다.' USING ERRCODE = 'P0001';
        END IF;
        IF NULLIF(v_pet_data ->> 'speciesReselectedAt', '') IS NOT NULL THEN
            RAISE EXCEPTION '수호룡 다시 선택 기회를 이미 사용했습니다.' USING ERRCODE = 'P0001';
        END IF;

        v_title_status := public.get_my_title_status();
        v_writer_chars := COALESCE((v_title_status ->> 'writer_total_chars')::BIGINT, 0);
        v_writer_level_override := NULLIF(v_title_status ->> 'writer_level_override', '')::INTEGER;
        IF v_writer_chars < 390 AND COALESCE(v_writer_level_override, 0) < 3 THEN
            RAISE EXCEPTION '작가 3단계부터 수호룡을 한 번 다시 선택할 수 있습니다.' USING ERRCODE = 'P0001';
        END IF;

        v_pet_data := v_pet_data || jsonb_build_object(
            'species', p_species,
            'speciesReselectedAt', v_now
        );
    END IF;

    UPDATE public.students
    SET pet_data = v_pet_data
    WHERE id = v_student_id;

    RETURN jsonb_build_object('success', true, 'pet_data', v_pet_data, 'changed', true);
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_dragon_species(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_dragon_species(TEXT, BOOLEAN) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

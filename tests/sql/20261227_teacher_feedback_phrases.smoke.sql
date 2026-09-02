-- 자주 쓰는 피드백 문장 열이 제대로 생겼고, 형태 제약이 실제로 막는지 본다.
-- check-migrations.mjs 가 바깥을 BEGIN/ROLLBACK 으로 감싸므로 교사 프로필은 그대로 남는다.

DO $$
DECLARE
    v_default TEXT;
    v_nullable TEXT;
    v_type TEXT;
BEGIN
    SELECT column_default, is_nullable, data_type
      INTO v_default, v_nullable, v_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'feedback_phrases';

    IF v_type IS NULL THEN
        RAISE EXCEPTION 'profiles.feedback_phrases 열이 만들어지지 않았습니다.';
    END IF;
    IF v_type <> 'jsonb' OR v_nullable <> 'NO' OR v_default NOT LIKE '%[]%' THEN
        RAISE EXCEPTION '열 정의가 기대와 다릅니다: type=%, nullable=%, default=%', v_type, v_nullable, v_default;
    END IF;
END;
$$;

DO $$
DECLARE
    v_teacher UUID;
    v_blocked BOOLEAN;
BEGIN
    SELECT id INTO v_teacher FROM public.profiles ORDER BY created_at LIMIT 1;
    IF v_teacher IS NULL THEN
        RAISE NOTICE '프로필이 없어 저장 시험은 건너뜁니다.';
        RETURN;
    END IF;

    -- 올바른 값은 저장된다.
    UPDATE public.profiles
       SET feedback_phrases = '["문단을 내용별로 나눠서 형식에 맞춰 다시 제출하세요.", "AI 맞춤법 검사 후 제출하세요."]'::JSONB
     WHERE id = v_teacher;

    IF (SELECT jsonb_array_length(feedback_phrases) FROM public.profiles WHERE id = v_teacher) <> 2 THEN
        RAISE EXCEPTION '올바른 문장 목록이 저장되지 않았습니다.';
    END IF;

    -- 배열이 아니면 막힌다.
    v_blocked := FALSE;
    BEGIN
        UPDATE public.profiles SET feedback_phrases = '"문장"'::JSONB WHERE id = v_teacher;
    EXCEPTION WHEN check_violation THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '배열이 아닌 값이 저장됐습니다.';
    END IF;

    -- 문자열이 아닌 원소가 섞이면 막힌다.
    v_blocked := FALSE;
    BEGIN
        UPDATE public.profiles SET feedback_phrases = '["괜찮은 문장", 12345]'::JSONB WHERE id = v_teacher;
    EXCEPTION WHEN check_violation THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '문자열이 아닌 원소가 저장됐습니다.';
    END IF;

    -- 21개는 막힌다(한도 20개).
    v_blocked := FALSE;
    BEGIN
        UPDATE public.profiles
           SET feedback_phrases = (SELECT jsonb_agg('문장 ' || step) FROM generate_series(1, 21) AS step)
         WHERE id = v_teacher;
    EXCEPTION WHEN check_violation THEN
        v_blocked := TRUE;
    END;
    IF NOT v_blocked THEN
        RAISE EXCEPTION '한도(20개)를 넘는 목록이 저장됐습니다.';
    END IF;
END;
$$;

SELECT '자주 쓰는 피드백 문장 열 검증 통과' AS smoke_result;

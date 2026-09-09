-- 서식 열이 올바른 모양만 받는지 본다. 데이터 변경은 모두 롤백된다.
DO $$
DECLARE
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM public.profiles WHERE role = 'TEACHER' LIMIT 1;
    IF v_id IS NULL THEN RAISE NOTICE '교사 계정이 없어 건너뜁니다.'; RETURN; END IF;

    -- 올바른 모양은 들어가야 한다.
    UPDATE public.profiles
    SET notice_templates = '[{"name":"오늘 알림","body":"[준비물]\n"},{"name":"","body":""},{"name":"","body":""}]'::JSONB
    WHERE id = v_id;

    -- 칸이 넘치면 막아야 한다.
    BEGIN
        UPDATE public.profiles
        SET notice_templates = '[{"name":"","body":""},{"name":"","body":""},{"name":"","body":""},{"name":"","body":""}]'::JSONB
        WHERE id = v_id;
        RAISE EXCEPTION '서식 4칸이 들어갔습니다 — 칸 수 제약이 없습니다.';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- 객체가 아니면 막아야 한다(옛 문자열 배열 형태가 섞이는 것을 막는다).
    BEGIN
        UPDATE public.profiles SET notice_templates = '["문자열"]'::JSONB WHERE id = v_id;
        RAISE EXCEPTION '문자열 서식이 들어갔습니다 — 형태 제약이 없습니다.';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- name·body 가 문자열이 아니면 막아야 한다.
    BEGIN
        UPDATE public.profiles SET notice_templates = '[{"name":1,"body":"x"}]'::JSONB WHERE id = v_id;
        RAISE EXCEPTION '숫자 이름이 들어갔습니다 — 형태 제약이 없습니다.';
    EXCEPTION WHEN check_violation THEN NULL;
    END;
END;
$$;

-- 어휘의 탑·인형뽑기 기본 켜짐 스모크(전부 롤백): 기본값·백필·예외(쓴 기록이 있는데 꺼진 학급은 그대로)·서버 입구 세 함수.
DO $$
DECLARE v_left INTEGER; v_default TEXT;
BEGIN
    SELECT column_default INTO v_default FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'classes' AND column_name = 'vocab_tower_enabled';
    IF v_default IS DISTINCT FROM 'true' THEN RAISE EXCEPTION '새 학급의 어휘의 탑 기본값이 true 가 아닙니다: %', v_default; END IF;

    SELECT count(*) INTO v_left FROM public.classes c
    WHERE c.deleted_at IS NULL AND c.vocab_tower_enabled IS NOT TRUE
      AND NOT EXISTS (SELECT 1 FROM public.vocab_tower_runs r WHERE r.class_id = c.id);
    IF v_left <> 0 THEN RAISE EXCEPTION '어휘의 탑을 쓴 적 없는데 꺼진 학급이 % 개 남았습니다', v_left; END IF;

    SELECT count(*) INTO v_left FROM public.classes c
    WHERE c.deleted_at IS NULL AND c.enabled_modules IS NOT NULL AND NOT ('vocab-tower' = ANY(c.enabled_modules))
      AND NOT EXISTS (SELECT 1 FROM public.vocab_tower_runs r WHERE r.class_id = c.id);
    IF v_left <> 0 THEN RAISE EXCEPTION '목록을 저장한 학급 중 어휘의 탑이 빠진 학급이 % 개입니다', v_left; END IF;

    SELECT count(*) INTO v_left FROM public.classes c
    WHERE c.deleted_at IS NULL AND c.enabled_modules IS NOT NULL AND NOT ('spelling-claw' = ANY(c.enabled_modules))
      AND NOT EXISTS (SELECT 1 FROM public.spelling_claw_plays p WHERE p.class_id = c.id);
    IF v_left <> 0 THEN RAISE EXCEPTION '목록을 저장한 학급 중 인형뽑기가 빠진 학급이 % 개입니다', v_left; END IF;

    -- 서버 입구 세 함수는 설정 안 한 학급(NULL)을 켜진 것으로 읽는다
    IF (SELECT count(*) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('get_my_spelling_claw_context_v1', 'spelling_claw_issue_quiz_v1', 'start_my_spelling_claw_play_v1')
        AND p.prosrc LIKE '%COALESCE(''spelling-claw'' = ANY(class.enabled_modules)%') <> 3 THEN
        RAISE EXCEPTION '인형뽑기 입구 세 함수가 NULL 을 켜짐으로 읽지 않습니다';
    END IF;
END $$;

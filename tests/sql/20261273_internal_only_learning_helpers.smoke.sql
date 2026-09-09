-- 내부 전용 학습 도우미가 클라이언트에 닫혀 있고 내부 경로는 살아 있는지,
-- 그리고 public 스키마에 RLS 를 끈 표가 다시 생기지 않았는지 한꺼번에 본다.
DO $$
DECLARE
    v_sigs TEXT[] := ARRAY[
        'public.learning_engine_retry_gate_v1(UUID, UUID, TEXT, TEXT, TEXT)',
        'public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT)',
        'public.vocab_tower_v2_retry_breakdown_v1(TEXT[], SMALLINT)'
    ];
    v_sig TEXT;
    v_bad INTEGER;
    v_names TEXT;
BEGIN
    -- 1) 클라이언트에서 부를 수 없어야 한다.
    FOREACH v_sig IN ARRAY v_sigs LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE')
           OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            RAISE EXCEPTION '내부 전용 함수 % 가 클라이언트에 열려 있습니다.', v_sig;
        END IF;
    END LOOP;

    -- 2) 내부에서 부르는 쪽은 소유자 권한으로 돌아야 한다. 아니면 학습 화면이 조용히 끊긴다.
    SELECT count(*), string_agg(p.proname, ', ')
    INTO v_bad, v_names
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname NOT IN ('learning_engine_retry_gate_v1', 'vocab_tower_v2_summit_status_v1',
                            'vocab_tower_v2_retry_breakdown_v1')
      AND (p.prosrc LIKE '%learning_engine_retry_gate_v1%'
           OR p.prosrc LIKE '%vocab_tower_v2_summit_status_v1%'
           OR p.prosrc LIKE '%vocab_tower_v2_retry_breakdown_v1%')
      AND (NOT p.prosecdef OR pg_get_userbyid(p.proowner) <> 'supabase_admin');
    IF v_bad > 0 THEN
        RAISE EXCEPTION '학습 도우미를 부르는 함수 %개가 소유자 권한으로 돌지 않습니다 (%) — 어휘탑 화면이 끊깁니다.', v_bad, v_names;
    END IF;

    -- 3) public 스키마의 모든 표에 RLS 가 켜져 있어야 한다. 새 표가 예외로 새는 것을 막는다.
    SELECT count(*), string_agg(c.relname, ', ')
    INTO v_bad, v_names
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity;
    IF v_bad > 0 THEN
        RAISE EXCEPTION 'RLS 가 꺼진 표 %개가 있습니다 (%). 표를 만들면 RLS 를 켠다.', v_bad, v_names;
    END IF;
END;
$$;

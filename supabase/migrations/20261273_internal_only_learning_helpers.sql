-- ============================================================================
-- 내부 전용 학습 도우미 함수의 클라이언트 실행 권한 회수 + 남은 RLS 예외 하나 정리
-- (2026-09-09 보안 점검 P2·P3 — 20261272 의 이어지는 조치)
--
-- 1) 내부 전용인데 클라이언트에 열려 있던 함수 3개
--
--    셋 다 `src/` 에 참조가 0건이고, 부르는 쪽은 모두 이 함수들과 같은 소유자
--    (`supabase_admin`)의 SECURITY DEFINER 라 소유자 권한으로 그대로 돈다.
--
--      learning_engine_retry_gate_v1      ← start_my_vocab_tower_master_base_v1,
--                                           get_my_vocab_tower_v2_overview_base_v1,
--                                           start_my_vocab_master_summit_v1
--      vocab_tower_v2_summit_status_v1    ← finish_my_vocab_tower_master_v1,
--                                           get_my_vocab_tower_v2_overview_base_v1,
--                                           finish_my_vocab_master_summit_v1,
--                                           start_my_vocab_master_summit_v1
--      vocab_tower_v2_retry_breakdown_v1  ← get_my_vocab_tower_v2_overview_base_v1
--
--    앞의 둘은 `p_student_id` 를 그대로 받으면서 "내 것인지" 검사가 없었다. 열려 있는 동안은
--    로그인한 학생이 다른 학생 UUID 로 그 아이의 학습 진도를 조회할 수 있었다.
--    소유 검사를 넣는 대신 **아예 닫는다** — 브라우저가 부르지 않으므로 그게 더 확실하다.
--
-- 2) `student_title_test_overrides` 만 RLS 가 꺼져 있었다
--
--    public 스키마에서 유일한 예외였다. 지금도 노출은 아니다 — anon·authenticated 에게
--    GRANT 가 없고, 이 표를 쓰는 함수 2개(get_title_activity_test_state_v1,
--    get_teacher_dragon_growth_dashboard)는 소유자 권한으로 돈다. GRANT 가 있는 세 역할
--    (postgres·service_role·supabase_admin)은 모두 BYPASSRLS 라 동작도 그대로다.
--    "표를 새로 만들면 RLS 를 켠다"는 규칙에 예외를 남기지 않기 위해 켠다.
-- ============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.learning_engine_retry_gate_v1(UUID, UUID, TEXT, TEXT, TEXT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.vocab_tower_v2_retry_breakdown_v1(TEXT[], SMALLINT)
    FROM PUBLIC, anon, authenticated;

-- 3) 교사 전용 함수에 남아 있던 불필요한 anon 실행 권한
--    교사는 구글 로그인 뒤 `authenticated` 이므로 anon 권한이 필요 없다.
--    함수 첫 줄이 `auth.uid() IS NULL` 이면 42501 을 던지므로 지금도 뚫리지는 않지만
--    (공개 anon 키 호출 → 401 '로그인이 필요합니다' 확인함), 열어 둘 이유가 없다.
--    authenticated 는 남긴다 — 교사가 실제로 부르는 함수다.
REVOKE ALL ON FUNCTION public.save_teacher_reading_marathon_v2(
    UUID, TEXT, INTEGER, TEXT, TEXT, INTEGER, JSONB, DATE, BOOLEAN, BOOLEAN, INTEGER
) FROM anon;

ALTER TABLE public.student_title_test_overrides ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
    v_sigs TEXT[] := ARRAY[
        'public.learning_engine_retry_gate_v1(UUID, UUID, TEXT, TEXT, TEXT)',
        'public.vocab_tower_v2_summit_status_v1(UUID, UUID, SMALLINT)',
        'public.vocab_tower_v2_retry_breakdown_v1(TEXT[], SMALLINT)'
    ];
    v_sig TEXT;
BEGIN
    FOREACH v_sig IN ARRAY v_sigs LOOP
        IF has_function_privilege('anon', v_sig, 'EXECUTE')
           OR has_function_privilege('authenticated', v_sig, 'EXECUTE') THEN
            RAISE EXCEPTION '% 가 아직 클라이언트에 열려 있습니다.', v_sig;
        END IF;
        IF NOT has_function_privilege('service_role', v_sig, 'EXECUTE') THEN
            RAISE EXCEPTION '% 의 service_role 권한까지 사라졌습니다.', v_sig;
        END IF;
    END LOOP;

    IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.student_title_test_overrides'::regclass) THEN
        RAISE EXCEPTION 'student_title_test_overrides 의 RLS 가 켜지지 않았습니다.';
    END IF;

    IF has_function_privilege('anon',
        'public.save_teacher_reading_marathon_v2(UUID, TEXT, INTEGER, TEXT, TEXT, INTEGER, JSONB, DATE, BOOLEAN, BOOLEAN, INTEGER)',
        'EXECUTE') THEN
        RAISE EXCEPTION '교사 전용 독서마라톤 저장 함수가 아직 anon 에 열려 있습니다.';
    END IF;
    IF NOT has_function_privilege('authenticated',
        'public.save_teacher_reading_marathon_v2(UUID, TEXT, INTEGER, TEXT, TEXT, INTEGER, JSONB, DATE, BOOLEAN, BOOLEAN, INTEGER)',
        'EXECUTE') THEN
        RAISE EXCEPTION '교사가 독서마라톤을 저장할 권한까지 사라졌습니다.';
    END IF;
END;
$$;

COMMIT;

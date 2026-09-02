-- 전체 공개 뒤 현재 학급 누락·미래 학급 자동 등록·직접 권한 차단을 확인한다.
-- migrate:check의 바깥 트랜잭션 안에서 실행되므로 생성한 시험 학급은 모두 롤백된다.

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.classes class
        LEFT JOIN public.vocab_tower_practice_policy_classes policy
          ON policy.class_id = class.id
         AND policy.policy_version = 2
        WHERE policy.class_id IS NULL
    ) THEN
        RAISE EXCEPTION 'all existing classes must use vocab practice policy 2 for new runs';
    END IF;

    IF has_table_privilege('anon', 'public.vocab_tower_practice_policy_classes', 'SELECT')
       OR has_table_privilege('authenticated', 'public.vocab_tower_practice_policy_classes', 'SELECT')
       OR has_table_privilege('service_role', 'public.vocab_tower_practice_policy_classes', 'SELECT')
       OR has_function_privilege('authenticated', 'public.register_vocab_tower_practice_policy_v2_for_class_v1()', 'EXECUTE') THEN
        RAISE EXCEPTION 'full rollout registry and helper must stay private';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_trigger trigger
        WHERE trigger.tgrelid = 'public.classes'::regclass
          AND trigger.tgname = 'register_vocab_tower_practice_policy_v2_for_class_v1'
          AND NOT trigger.tgisinternal
    ) THEN
        RAISE EXCEPTION 'future class policy registration trigger is missing';
    END IF;
END;
$$;

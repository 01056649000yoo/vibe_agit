-- 어휘의 탑 층별 난이도 정책 2를 모든 현재·미래 학급의 새 V2 개인 연습에 적용한다.
-- 이미 시작한 판은 실행 행에 저장된 정책 버전을 유지해 문제 구성이 중간에 바뀌지 않는다.

BEGIN;

INSERT INTO public.vocab_tower_practice_policy_classes (class_id, policy_version)
SELECT class.id, 2
FROM public.classes class
ON CONFLICT (class_id) DO UPDATE
SET policy_version = EXCLUDED.policy_version;

CREATE OR REPLACE FUNCTION public.register_vocab_tower_practice_policy_v2_for_class_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
    INSERT INTO public.vocab_tower_practice_policy_classes (class_id, policy_version)
    VALUES (NEW.id, 2)
    ON CONFLICT (class_id) DO UPDATE
    SET policy_version = EXCLUDED.policy_version;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.register_vocab_tower_practice_policy_v2_for_class_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS register_vocab_tower_practice_policy_v2_for_class_v1
    ON public.classes;
CREATE TRIGGER register_vocab_tower_practice_policy_v2_for_class_v1
AFTER INSERT ON public.classes
FOR EACH ROW EXECUTE FUNCTION public.register_vocab_tower_practice_policy_v2_for_class_v1();

COMMENT ON FUNCTION public.register_vocab_tower_practice_policy_v2_for_class_v1() IS
    '새 학급을 어휘의 탑 층별 난이도 정책 2에 자동 등록한다.';

COMMENT ON TABLE public.vocab_tower_practice_policy_classes IS
    '모든 학급의 새 V2 개인 연습에 적용할 층별 난이도 정책 버전. 브라우저 직접 접근은 허용하지 않는다.';

COMMIT;

-- 허용 목록에 이유를 적어 두었던 두 함수를 지운다. 이유를 다시 확인해 보니 조건이 끝났다.
--
--   get_my_role
--     이유: "구형 역할 조회. 앱은 부트스트랩 RPC 로 옮겼다.
--            외부 앱이 남아 있지 않은지 한 번 더 확인한 뒤 지운다."
--     → 그 확인을 했다. 연구소·샘링크·클래스룸툴·자비스 배포본 모두 참조 0건이다. 조건이 끝났다.
--
--   admin_dashboard_snapshot
--     이유: "관리자 화면이 쓰지 않지만 운영 점검 때 psql 로 직접 부른다."
--     → **이 이유는 사실이 아니었다.** 저장소의 어떤 스크립트·문서·점검 절차도 이 함수를 부르지 않는다
--       (허용 목록과 작업 기록에만 이름이 있다). 적어 둔 이유가 썩은 경우다.
--
-- 둘 다 저장소 참조 0건, DB 안에서 부르는 함수 0건, 다른 앱 배포본 0건, 실제 호출 기록 없음.

BEGIN;

DROP FUNCTION IF EXISTS public.get_my_role();
DROP FUNCTION IF EXISTS public.admin_dashboard_snapshot();

DO $$
BEGIN
    IF to_regprocedure('public.get_my_role()') IS NOT NULL
       OR to_regprocedure('public.admin_dashboard_snapshot()') IS NOT NULL THEN
        RAISE EXCEPTION '지우려던 함수가 남아 있습니다.';
    END IF;
    -- 역할 판정을 실제로 담당하는 것들은 그대로 살아 있어야 한다.
    IF to_regprocedure('public.auth_user_role()') IS NULL
       OR to_regprocedure('public.get_teacher_app_bootstrap_v1(boolean)') IS NULL THEN
        RAISE EXCEPTION '쓰고 있는 역할·부트스트랩 함수가 함께 사라졌습니다.';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- 학생이 자기 댓글을 스스로 승인할 수 있던 구형 검사 함수를 닫는다.
--
-- 20261180에서 댓글 판정을 service-role 전용 대기열로 옮겼지만, 20260916이 만든
-- `record_comment_ai_review`는 계속 `authenticated`에게 열려 있었다. 이 함수는
-- SECURITY DEFINER로 자기 pending 댓글을 곧바로 `approved`로 바꾸므로, 학생이
-- 브라우저에서 한 번 호출하면 AI 검사를 통째로 건너뛰고 친구들에게 공개됐다
-- (2026-08-26 운영 DB 롤백 트랜잭션에서 재현 확인).
--
-- 새 대기열 RPC가 유일한 판정 경로이므로 구형 함수는 남겨 둘 이유가 없다.
-- 함께 사문화된 v1 선점 함수도 같이 지운다. 댓글 원장과 상태는 건드리지 않는다.

BEGIN;

DROP FUNCTION IF EXISTS public.record_comment_ai_review(UUID, BOOLEAN, TEXT);
DROP FUNCTION IF EXISTS public.claim_comment_ai_review_v1(UUID, UUID);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN ('record_comment_ai_review', 'claim_comment_ai_review_v1')
    ) THEN
        RAISE EXCEPTION '구형 댓글 판정 함수가 남아 있습니다.';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

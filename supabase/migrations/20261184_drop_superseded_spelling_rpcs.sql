-- 새 판이 나온 뒤로 아무도 부르지 않는 맞춤법 RPC 두 개를 지운다.
--
-- 아지트 앱·검사·다른 DB 함수는 물론, 이 DB 를 함께 쓰는 맥미니의 다른 앱
-- (연구소·샘링크·자비스·클래스룸툴) 배포본까지 뒤져 참조가 없음을 확인했다(2026-08-26).
--   get_spelling_learning_workspace_v1     -> _v3 사용
--   record_spelling_promotion_decisions_v1 -> 후속 승격 RPC 로 대체
--
-- 아래는 일부러 남긴다.
--   get_student_spelling_entries_v1     — **연구소 배포본이 아직 직접 부른다.**
--       (`/app/.next` 안 `rpc("get_student_spelling_entries_v1")`) 게다가 `.catch(()=>[])`
--       라서 지우면 오류도 없이 학급 맞춤법 항목이 빈 목록으로 조용히 사라진다.
--       연구소를 `_v2` 로 옮긴 뒤에 지운다.
--   get_spelling_learning_workspace_v2  — _v3 가 내부에서 부른다.
--   get_teacher_assignment_submission_board_v1 · submit_teacher_feedback_v1 ·
--   admin_get_spelling_promotion_workspace_v2 · admin_reject_spelling_candidate_v1
--       — 아직 tests/sql 스모크가 직접 부른다. 그 검사를 함께 옮길 때 지운다.

BEGIN;

DROP FUNCTION IF EXISTS public.get_spelling_learning_workspace_v1(UUID);
DROP FUNCTION IF EXISTS public.record_spelling_promotion_decisions_v1(JSONB, TEXT);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public'
          AND p.proname IN (
              'get_spelling_learning_workspace_v1',
              'record_spelling_promotion_decisions_v1'
          )
    ) THEN
        RAISE EXCEPTION '사문화된 맞춤법 RPC 가 남아 있습니다.';
    END IF;

    -- 실제로 쓰는 판은 그대로 살아 있어야 한다.
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_spelling_learning_workspace_v3'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_spelling_learning_workspace_v2'
    ) OR NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_student_spelling_entries_v2'
    ) OR NOT EXISTS (
        -- 연구소 배포본이 아직 부르는 판이다. 같이 사라지면 학급 맞춤법 항목이 조용히 빈다.
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = 'get_student_spelling_entries_v1'
    ) THEN
        RAISE EXCEPTION '사용 중인 맞춤법 RPC 가 함께 사라졌습니다.';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

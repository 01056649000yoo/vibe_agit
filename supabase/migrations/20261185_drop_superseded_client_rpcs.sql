-- 새 판으로 옮긴 뒤 남아 있던 구형 RPC 네 개를 클라이언트 표면에서 지운다.
--
-- 앱은 모두 새 판을 쓴다.
--   get_teacher_assignment_submission_board_v1 -> _v2 (과제 범위 전광판)
--   submit_teacher_feedback_v1                 -> _v2
--   admin_get_spelling_promotion_workspace_v2  -> _v3
--   admin_reject_spelling_candidate_v1         -> admin_reject_weekly_spelling_entry_v1 등
--
-- 지우기 전에 확인한 것:
--   · 이 저장소(src·scripts·supabase)에 호출 없음
--   · DB 안의 다른 함수가 부르지 않음(pg_get_functiondef 전수 대조)
--   · 같은 DB 를 쓰는 다른 앱 배포본에도 없음
--     (연구소·샘링크·클래스룸툴·자비스 컨테이너 전수 검색)
--
-- 옛 스모크(20261015·20261167·20261176·20261178)에는 호출이 남아 있지만,
-- `check-migrations.mjs` 는 **아직 안 넣은** 마이그레이션의 스모크만 돌린다.
-- 넷 다 이미 적용된 상태라 다시 돌지 않으므로 그 기록은 그대로 둔다.
--
-- 앞으로 같은 일이 쌓이지 않도록 `npm run check:rpc-surface` 가 매 푸시마다 본다.

BEGIN;

DROP FUNCTION IF EXISTS public.get_teacher_assignment_submission_board_v1(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.submit_teacher_feedback_v1(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_get_spelling_promotion_workspace_v2(INTEGER, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS public.admin_reject_spelling_candidate_v1(TEXT, TEXT, TEXT);

DO $$
DECLARE
    v_missing TEXT;
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname IN (
            'get_teacher_assignment_submission_board_v1',
            'submit_teacher_feedback_v1',
            'admin_get_spelling_promotion_workspace_v2',
            'admin_reject_spelling_candidate_v1'
        )
    ) THEN
        RAISE EXCEPTION '구형 RPC 가 남아 있습니다.';
    END IF;

    -- 실제로 쓰는 새 판이 함께 사라지면 화면이 죽는다. 하나라도 없으면 멈춘다.
    SELECT string_agg(expected.name, ', ') INTO v_missing
    FROM (VALUES
        ('get_teacher_assignment_submission_board_v2'),
        ('submit_teacher_feedback_v2'),
        ('admin_get_spelling_promotion_workspace_v3'),
        ('admin_reject_weekly_spelling_entry_v1')
    ) AS expected(name)
    WHERE NOT EXISTS (
        SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname = expected.name
    );
    IF v_missing IS NOT NULL THEN
        RAISE EXCEPTION '쓰고 있는 새 판이 없습니다: %', v_missing;
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

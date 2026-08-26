-- 새 판으로 옮긴 뒤 남아 있던 옛 판 네 개를 지운다.
--
-- 앞의 셋은 판 번호가 없는 첫 판이라 `_vN` 끼리만 견주던 검사가 놓치고 있었다.
-- 첫 판에 번호를 안 붙이는 것이 이 저장소의 습관이라 오히려 이 경우가 흔하다.
--   save_teacher_self_writing_review     -> _v2 (앱은 _v2 만 부른다)
--   save_teacher_reading_marathon        -> _v2
--   save_teacher_reading_log_reviews_bulk-> _v2 (앱은 어느 쪽도 부르지 않는다)
--   record_spelling_search_batch_v1      -> _v2
--
-- 지우기 전에 확인한 것:
--   · 앱·스크립트에 호출 없음 (검사 파일에만 이름이 남아 있었다)
--   · DB 안의 다른 함수가 부르지 않음
--   · 같은 DB 를 쓰는 다른 앱 배포본에도 없음
--   · 20261145 에서 이미 authenticated 권한을 회수해 둔 상태였다
--
-- 남은 두 개는 지우지 않고 ops/rpc-surface-allowlist.json 에 이유를 적었다.
--   record_system_daily_metric_v1                   — 지표 스크립트의 되돌림 경로
--   teacher_assignment_submission_board_snapshot_v1 — 다른 RPC 가 내부에서 부름

BEGIN;

DROP FUNCTION IF EXISTS public.record_spelling_search_batch_v1(JSONB);
DROP FUNCTION IF EXISTS public.save_teacher_self_writing_review(UUID, TEXT);
DROP FUNCTION IF EXISTS public.save_teacher_reading_marathon(UUID, TEXT, INTEGER, DATE, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS public.save_teacher_reading_log_reviews_bulk(UUID[]);

DO $$
BEGIN
    IF to_regprocedure('public.record_spelling_search_batch_v1(jsonb)') IS NOT NULL
       OR to_regprocedure('public.save_teacher_self_writing_review(uuid,text)') IS NOT NULL
       OR to_regprocedure('public.save_teacher_reading_marathon(uuid,text,integer,date,boolean,boolean)') IS NOT NULL
       OR to_regprocedure('public.save_teacher_reading_log_reviews_bulk(uuid[])') IS NOT NULL THEN
        RAISE EXCEPTION '구형 함수가 남아 있습니다.';
    END IF;

    -- 앱이 실제로 부르는 새 판이 함께 사라지면 교사 화면이 죽는다.
    IF to_regprocedure('public.record_spelling_search_batch_v2(jsonb)') IS NULL
       OR to_regprocedure('public.save_teacher_self_writing_review_v2(uuid,text,text)') IS NULL
       OR to_regprocedure('public.save_teacher_reading_marathon_v2(uuid,text,integer,text,text,integer,jsonb,date,boolean,boolean)') IS NULL THEN
        RAISE EXCEPTION '쓰고 있는 새 판이 없습니다.';
    END IF;

    -- get_reading_marathon_snapshot 은 지우지 않는다. 앱은 _v2 를 부르지만
    -- finish_teacher_reading_marathon 등 DB 함수 셋이 아직 이 이름을 부른다.
    IF to_regprocedure('public.get_reading_marathon_snapshot(uuid)') IS NULL THEN
        RAISE EXCEPTION '내부에서 쓰는 독서 마라톤 스냅샷 함수가 사라졌습니다.';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

-- 연구소가 `_v2` 로 넘어간 것을 확인한 뒤 마지막 구형 판을 지운다.
--
-- 이 함수는 아지트 저장소에 참조가 하나도 없어서 죽은 줄 알았지만, 같은 DB 를 쓰는
-- 연구소(writing-helper) 배포본이 계속 부르고 있었다(2026-08-26). 게다가 그쪽은
-- `.catch(()=>[])` 라서 지웠다면 오류도 없이 학급 맞춤법 자료가 빈 목록이 됐을 것이다.
-- 그래서 지우지 않고 `ops/rpc-surface-allowlist.json` 에 이유를 적어 두었다.
--
-- 이제 연구소를 `_v2` 로 옮겨 배포했고, 배포된 컨테이너에서 `_v1` 참조 0건 ·
-- `_v2` 참조 2건을 확인했다. 샘링크·클래스룸툴·자비스에도 참조가 없다.

BEGIN;

DROP FUNCTION IF EXISTS public.get_student_spelling_entries_v1();

DO $$
BEGIN
    IF to_regprocedure('public.get_student_spelling_entries_v1()') IS NOT NULL THEN
        RAISE EXCEPTION '구형 학생 맞춤법 조회 함수가 남아 있습니다.';
    END IF;
    -- 아지트와 연구소가 함께 쓰는 판은 반드시 살아 있어야 한다.
    IF to_regprocedure('public.get_student_spelling_entries_v2()') IS NULL THEN
        RAISE EXCEPTION '쓰고 있는 _v2 가 없습니다.';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';
COMMIT;

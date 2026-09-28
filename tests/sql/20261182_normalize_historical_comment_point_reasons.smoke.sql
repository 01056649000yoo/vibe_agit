-- 20261215 파일에서 바뀜: 학생 포인트 내역은 comment_reward 를 사유 정규화 대신 목록에서 뺀다.
-- 바깥에서 BEGIN ... ROLLBACK으로 실행한다. 운영 포인트 원장 변경은 남지 않는다.

DO $$
DECLARE
    v_history_function TEXT := pg_get_functiondef(
        'public.get_my_point_history_v1(integer)'::regprocedure
    );
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.point_logs
        WHERE activity_type = 'comment_reward'
          AND reason IS DISTINCT FROM '친구 댓글 보상 · 이전 기록'
    ) THEN
        RAISE EXCEPTION '과거 댓글 포인트 사유가 일괄 정리되지 않았습니다.';
    END IF;
    IF EXISTS (
        SELECT 1
        FROM public.point_logs
        WHERE activity_type = 'comment_reward'
          AND reason ~* 'postid'
    ) THEN
        RAISE EXCEPTION '학생용 댓글 포인트 사유에 PostID가 남아 있습니다.';
    END IF;
    -- 20261215 이후 학생 내역은 과거 댓글 포인트를 사유만 바꿔 보여 주지 않고 아예 뺀다.
    IF v_history_function !~ $pattern$COALESCE\(point_log\.activity_type, 'etc'\) <> 'comment_reward'$pattern$ THEN
        RAISE EXCEPTION '학생 포인트 조회 RPC가 종료된 댓글 포인트를 숨기지 않습니다.';
    END IF;
    IF position('''version'', 2' IN v_history_function) = 0 THEN
        RAISE EXCEPTION '학생 포인트 조회 응답 버전이 갱신되지 않았습니다.';
    END IF;
END;
$$;

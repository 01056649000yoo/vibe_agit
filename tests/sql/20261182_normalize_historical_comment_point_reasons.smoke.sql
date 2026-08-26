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
    IF v_history_function !~ $pattern$WHEN point_log.activity_type = 'comment_reward'[[:space:]]+THEN '친구 댓글 보상 · 이전 기록'$pattern$ THEN
        RAISE EXCEPTION '학생 포인트 조회 RPC에 과거 댓글 사유 정규화가 없습니다.';
    END IF;
    IF position('''version'', 2' IN v_history_function) = 0 THEN
        RAISE EXCEPTION '학생 포인트 조회 응답 버전이 갱신되지 않았습니다.';
    END IF;
END;
$$;

-- ============================================================================
-- 📊 로그인 화면 현황을 거의 실시간으로
-- 작성일: 2026-09-13
--
-- 왜: `20261282` 는 한 시간에 한 번만 셌다. 교사가 가입하거나 학급을 만들어도 최대 한
--     시간 동안 첫 화면의 숫자가 그대로여서 "동기화가 안 된다" 는 제보를 받았다.
--
-- 왜 아예 방문마다 세지는 않나: 로그인 화면은 **누구나, 봇까지** 여는 화면이라 방문마다
--     네 표를 세면 조회가 방문 수만큼 늘고 아무나 늘릴 수 있다. 간격만 **60초**로 줄인다 —
--     트래픽이 아무리 몰려도 세는 일은 1분에 한 번이고, 화면에는 늦어도 1분 안에 반영된다.
--
-- 이 값이 바뀌면 화면 문구도 같이 봐야 한다: `tests/serviceStats.test.mjs`.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_service_stats_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_row public.service_stats%ROWTYPE;
BEGIN
    SELECT * INTO v_row FROM public.service_stats WHERE id = 1;

    -- 1분이 지났고, 지금 아무도 세고 있지 않을 때만 새로 센다.
    IF (v_row.computed_at IS NULL OR v_row.computed_at < now() - INTERVAL '60 seconds')
       AND pg_try_advisory_xact_lock(hashtext('service_stats_refresh')::BIGINT) THEN
        UPDATE public.service_stats SET
            teacher_count = (SELECT count(*) FROM public.profiles
                             WHERE role = 'TEACHER' AND is_approved AND approval_revoked_at IS NULL),
            class_count   = (SELECT count(*) FROM public.classes WHERE deleted_at IS NULL),
            student_count = (SELECT count(*) FROM public.students WHERE deleted_at IS NULL),
            post_count    = (SELECT count(*) FROM public.student_posts WHERE is_submitted),
            computed_at   = now()
        WHERE id = 1
        RETURNING * INTO v_row;
    END IF;

    RETURN jsonb_build_object(
        'teachers', COALESCE(v_row.teacher_count, 0),
        'classes',  COALESCE(v_row.class_count, 0),
        'students', COALESCE(v_row.student_count, 0),
        'posts',    COALESCE(v_row.post_count, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_service_stats_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_service_stats_v1() TO anon, authenticated;

-- 지금 바로 한 번 맞춰 둔다.
UPDATE public.service_stats SET computed_at = NULL WHERE id = 1;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 📊 로그인 화면에 보여 줄 서비스 현황 (교사·학급·학생·글)
-- 작성일: 2026-09-13
--
-- 목적: 첫 화면에서 "이 앱과 함께하고 있는 사람들" 을 숫자 넉 줄로 보여 준다.
--
-- **이것은 비로그인(anon) 에게 여는 길이다.** 그래서 두 가지를 지킨다.
--
--   1) 총계만 나간다. 학교 이름·교사 이름·학급 이름은 함수 밖으로 한 글자도 못 나간다.
--      돌려주는 것은 정수 네 개와 계산 시각뿐이다.
--   2) 표를 직접 열지 않는다. service_stats 는 RLS 를 켜고 정책을 하나도 두지 않으며
--      anon·authenticated 의 권한을 걷는다. 오직 이 SECURITY DEFINER 함수로만 읽힌다.
--
-- 왜 그때그때 count(*) 하지 않고 한 줄짜리 표에 담아 두나:
--   로그인 화면은 **누구나, 봇까지** 여는 화면이다. 방문 한 번에 4개 표를 세면 조회가
--   방문 수만큼 늘어난다. 여기서는 한 시간에 한 번만 실제로 세고 나머지는 적어 둔 값을
--   읽는다 — 트래픽이 아무리 늘어도 세는 일은 시간당 한 번이다.
--   여럿이 동시에 들이닥쳐도 pg_try_advisory_xact_lock 으로 한 세션만 센다.
--
-- 숫자의 뜻(화면 문구와 같아야 한다. tests/serviceStats.test.mjs 가 두 곳을 함께 본다):
--   teachers — 승인되어 쓰고 있는 교사 (승인 취소된 사람은 뺀다)
--   classes  — 지우지 않은 학급
--   students — 지우지 않은 학생
--   posts    — 학생이 **제출한** 글 (쓰다 만 초안은 세지 않는다)
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.service_stats (
    id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    teacher_count INTEGER NOT NULL DEFAULT 0,
    class_count   INTEGER NOT NULL DEFAULT 0,
    student_count INTEGER NOT NULL DEFAULT 0,
    post_count    INTEGER NOT NULL DEFAULT 0,
    computed_at   TIMESTAMPTZ
);

COMMENT ON TABLE public.service_stats IS
    '로그인 화면에 보여 줄 총계 한 줄. get_service_stats_v1() 로만 읽는다.';

INSERT INTO public.service_stats (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.service_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_stats FROM anon, authenticated;

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

    -- 한 시간이 지났고, 지금 아무도 세고 있지 않을 때만 새로 센다.
    IF (v_row.computed_at IS NULL OR v_row.computed_at < now() - INTERVAL '1 hour')
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

COMMENT ON FUNCTION public.get_service_stats_v1() IS
    '로그인 화면용 총계 넷. 비로그인도 부를 수 있고 총계 외에는 아무것도 내보내지 않는다.';

REVOKE ALL ON FUNCTION public.get_service_stats_v1() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_service_stats_v1() TO anon, authenticated;

-- 처음 한 번은 여기서 채운다. 첫 방문자가 빈 숫자를 보지 않도록.
UPDATE public.service_stats SET
    teacher_count = (SELECT count(*) FROM public.profiles
                     WHERE role = 'TEACHER' AND is_approved AND approval_revoked_at IS NULL),
    class_count   = (SELECT count(*) FROM public.classes WHERE deleted_at IS NULL),
    student_count = (SELECT count(*) FROM public.students WHERE deleted_at IS NULL),
    post_count    = (SELECT count(*) FROM public.student_posts WHERE is_submitted),
    computed_at   = now()
WHERE id = 1;

COMMIT;

NOTIFY pgrst, 'reload schema';

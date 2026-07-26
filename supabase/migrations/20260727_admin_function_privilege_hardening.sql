-- ============================================================================
-- 🔐 함수 실행 권한 하드닝
-- 작성일: 2026-07-27
--
-- 발견 경위: 관리자 대시보드 보안 점검 중 침투 테스트(일반 교사 JWT로 직접 호출)에서 확인.
--
-- 핵심 원인:
--   Supabase 자체호스팅 스택은 public 스키마 함수에 대해 anon·authenticated 에게
--   EXECUTE 를 기본 부여한다. 따라서 `REVOKE ALL ... FROM PUBLIC` 만으로는
--   실행 권한이 회수되지 않는다. 역할을 명시해 REVOKE 해야 한다.
--
-- 조치:
--   [1] admin_withdraw_teacher_internal — 일반 교사가 직접 호출 가능했던 치명적 결함.
--       p_only_empty=FALSE 로 넘기면 임의 교사의 학급·학생·글·로그인 계정까지 삭제 가능했다.
--       역할 명시 REVOKE + 함수 내부에도 ADMIN 검사를 추가(이중 방어).
--   [2] 모든 admin_* 함수에서 anon(비로그인) 실행 권한 회수.
--   [3] cleanup_expired_deletions — 누구나 호출해 전체 휴지통(3일 복구분)을 즉시 영구 삭제 가능했다.
--   [4] get_class_activity_stats — 임의 class_id 로 다른 학급 학생 포인트 통계 조회 가능했다.
--   [5] test_auth_update — auth.users.raw_app_meta_data 를 쓰는 시험용 잔재. 삭제.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- [1] 내부 탈퇴 함수 — 치명적 권한 상승 차단
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_withdraw_teacher_internal(
    p_teacher_id UUID,
    p_only_empty BOOLEAN
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_count INTEGER;
    v_post_count INTEGER;
    v_class_count INTEGER;
BEGIN
    -- [보안] 호출 경로와 무관하게 스스로 방어한다.
    -- 이 함수는 admin_force_teacher_withdrawal / admin_bulk_force_teacher_withdrawal 의
    -- 내부 구현이지만, 실행 권한이 잘못 열려도 여기서 막힌다.
    IF public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can withdraw a teacher';
    END IF;

    IF p_teacher_id IS NULL THEN
        RAISE EXCEPTION 'Teacher id is required';
    END IF;

    IF auth.uid() = p_teacher_id THEN
        RAISE EXCEPTION 'Admins cannot delete their own account';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = p_teacher_id AND role IN ('TEACHER', 'ADMIN')
    ) THEN
        RETURN json_build_object('deleted', false, 'reason', 'NOT_FOUND');
    END IF;

    SELECT count(*)::INTEGER INTO v_class_count
    FROM public.classes WHERE teacher_id = p_teacher_id AND deleted_at IS NULL;

    SELECT count(s.id)::INTEGER INTO v_student_count
    FROM public.classes c
    JOIN public.students s ON s.class_id = c.id AND s.deleted_at IS NULL
    WHERE c.teacher_id = p_teacher_id AND c.deleted_at IS NULL;

    SELECT count(sp.id)::INTEGER INTO v_post_count
    FROM public.classes c
    JOIN public.student_posts sp ON sp.class_id = c.id
    WHERE c.teacher_id = p_teacher_id;

    IF p_only_empty AND (v_student_count > 0 OR v_post_count > 0) THEN
        RETURN json_build_object(
            'deleted', false,
            'reason', 'HAS_DATA',
            'student_count', v_student_count,
            'post_count', v_post_count,
            'class_count', v_class_count
        );
    END IF;

    DELETE FROM public.point_logs WHERE teacher_id = p_teacher_id;
    DELETE FROM public.classes WHERE teacher_id = p_teacher_id;
    DELETE FROM public.profiles WHERE id = p_teacher_id;
    DELETE FROM auth.users WHERE id = p_teacher_id;

    RETURN json_build_object(
        'deleted', true,
        'teacher_id', p_teacher_id,
        'removed_classes', v_class_count
    );
END;
$$;

-- 역할을 명시해서 회수해야 실제로 막힌다 (FROM PUBLIC 만으로는 부족)
REVOKE ALL ON FUNCTION public.admin_withdraw_teacher_internal(UUID, BOOLEAN) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- [2] admin_* 함수에서 비로그인(anon) 실행 권한 회수
--     내부 ADMIN 검사가 있어 실제 피해는 없었으나 불필요한 공격면이다.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT p.oid::regprocedure AS sig
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'public' AND p.proname LIKE 'admin\_%'
    LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- [3] 휴지통 영구 삭제 — 관리자 전용으로 제한
--     기존에는 아무나 호출해 3일 복구 유예분을 즉시 날릴 수 있었다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_expired_deletions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    -- service_role(예약 작업)과 ADMIN 만 허용.
    -- auth.uid() 가 NULL 이면 서버 측 배치 호출로 본다.
    IF auth.uid() IS NOT NULL AND public.auth_user_role() <> 'ADMIN' THEN
        RAISE EXCEPTION 'Only admins can purge expired deletions';
    END IF;

    DELETE FROM public.students WHERE deleted_at < now() - interval '3 days';
    DELETE FROM public.classes WHERE deleted_at < now() - interval '3 days';
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_expired_deletions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_deletions() TO service_role;

-- ----------------------------------------------------------------------------
-- [4] 학급 통계 — 남의 학급 조회 차단
--     담당 교사 / 그 학급 학생 / 관리자만 허용한다.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_class_activity_stats(p_class_id uuid)
RETURNS TABLE(student_id uuid, score_all bigint, score_week bigint, score_month bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_class_id IS NULL THEN
        RETURN;
    END IF;

    IF public.auth_user_role() <> 'ADMIN'
       AND NOT EXISTS (SELECT 1 FROM public.classes c WHERE c.id = p_class_id AND c.teacher_id = auth.uid())
       AND public.auth_user_class_id() IS DISTINCT FROM p_class_id
    THEN
        RAISE EXCEPTION 'Not allowed to read stats for this class';
    END IF;

    RETURN QUERY
    SELECT
        s.id AS student_id,
        COALESCE(SUM(pl.amount) FILTER (WHERE pl.amount > 0), 0) AS score_all,
        COALESCE(SUM(pl.amount) FILTER (WHERE pl.amount > 0 AND pl.created_at >= NOW() - INTERVAL '7 days'), 0) AS score_week,
        COALESCE(SUM(pl.amount) FILTER (WHERE pl.amount > 0 AND pl.created_at >= NOW() - INTERVAL '30 days'), 0) AS score_month
    FROM public.students s
    LEFT JOIN public.point_logs pl ON s.id = pl.student_id
    WHERE s.class_id = p_class_id AND s.deleted_at IS NULL
    GROUP BY s.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_activity_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_class_activity_stats(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- [5] 시험용 잔재 제거
--     auth.users.raw_app_meta_data 를 수정하는 함수가 누구에게나 열려 있었다.
--     app_metadata 는 RLS 가 신뢰하는 role·class_id·student_id 를 담는다.
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.test_auth_update();

NOTIFY pgrst, 'reload schema';

-- 지운 학생이 실제로 지워지게 한다 — 세 가지(2026-09-21, 교사 요청).
--
-- [1] 가장 급한 것 — 3일 지난 학생이 안 지워지고 남아 있다.
--   `purge_expired_students(p_class_id)` 는 **교사가 그 학급의 `복구함` 을 열 때만** 돈다.
--   실수로 지운 게 아니면 그 창을 열 일이 없으니, 아무도 안 열면 영영 안 돈다.
--   2026-09-21 실측: 16개 학급 23명이 3일을 넘겨 남아 있고, 가장 오래된 것은 **197일** 째였다.
--   개인정보처리방침의 "교사가 삭제하는 즉시 영구 삭제" 와 어긋난다 — 기능 고장이기 전에 약속 위반이다.
--   고침: 학급을 가리지 않고 도는 `purge_expired_students_all_v1()` 을 두고 매일 03:20 에 cron 으로 돈다.
--   가드는 `dahandin_prune_old_logs`(20261328)와 같다 — `session_user` 로 보고 브라우저는 막는다.
--
-- [2] 한 명이 막히면 학급 전체가 묶이던 것.
--   기존 `purge_expired_students` 는 `DELETE ... WHERE class_id=...` **한 문장**이라, 한 학생이
--   무언가에 걸리면 그 학급의 대기 학생이 **모두** 안 지워졌다. 그리고 부르는 쪽
--   (`fetchDeletedStudents`)이 오류를 삼켜 교사 화면에는 "복구할 학생이 없어요" 로 보인다.
--   고침: 한 명씩 돌면서 실패한 학생만 건너뛰고, 지운 수를 돌려준다.
--
-- [3] 학생 삭제를 막을 수 있는 외래키 둘.
--   ⚠️ `RESTRICT` 는 `NO ACTION` 과 달리 **연쇄 삭제 중에도 즉시** 막는다. 학생을 지우면
--   point_logs 와 칭호 보상 기록이 **나란히** 딸려 지워지는데, 어느 쪽이 먼저 지워질지는 정해져
--   있지 않다. point_logs 가 먼저면 RESTRICT 가 터진다 — 같은 조건인데 되기도 하고 안 되기도 하는
--   종류의 고장이다. `NO ACTION` 은 문장이 끝날 때 보므로 연쇄 삭제는 통과하고, 홀로 지우려는
--   것은 그대로 막는다. 원장을 지키려던 뜻은 살고 삭제만 풀린다.
--   개인 문집은 그 학생의 것이므로 학생이 사라지면 함께 사라지는 게 방침과 맞다(CASCADE).
--   딸린 수록 글·발행본도 책에서 CASCADE 로 정리된다. **학급 문집은 주인이 비어 있어 건드리지 않는다.**
--   2026-09-21 실측: 지금 이것 때문에 막히는 학생은 0명이고, 개인 문집을 가진 학생도 0명이다.
--   즉 지금 고쳐도 사라지는 자료는 없다. 쓰이기 시작한 뒤에 고치면 그때는 자료가 걸린다.

BEGIN;

-- ---------------------------------------------------------------------------
-- [3] 삭제를 막던 외래키 둘
-- ---------------------------------------------------------------------------
ALTER TABLE public.student_title_reward_claims
    DROP CONSTRAINT IF EXISTS student_title_reward_claims_point_log_id_fkey;
ALTER TABLE public.student_title_reward_claims
    ADD CONSTRAINT student_title_reward_claims_point_log_id_fkey
    FOREIGN KEY (point_log_id) REFERENCES public.point_logs(id) ON DELETE NO ACTION;

ALTER TABLE public.class_agit_books
    DROP CONSTRAINT IF EXISTS class_agit_books_owner_student_fkey;
ALTER TABLE public.class_agit_books
    ADD CONSTRAINT class_agit_books_owner_student_fkey
    FOREIGN KEY (class_id, owner_student_id)
    REFERENCES public.students(class_id, id) ON DELETE CASCADE;

-- ---------------------------------------------------------------------------
-- [2] 한 명씩 지운다 — 한 명이 막혀도 나머지는 지워진다
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_students(p_class_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_student_id UUID;
    v_deleted_count INTEGER := 0;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.teacher_id = auth.uid()
          AND class.deleted_at IS NULL
    ) AND NOT public.is_admin() THEN
        RAISE EXCEPTION '권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    FOR v_student_id IN
        SELECT student.id FROM public.students student
        WHERE student.class_id = p_class_id
          AND student.deleted_at IS NOT NULL
          AND student.deleted_at < (NOW() - INTERVAL '3 days')
    LOOP
        BEGIN
            PERFORM set_config('app.writing_footprint_maintenance', 'on', true);
            DELETE FROM public.students WHERE id = v_student_id;
            v_deleted_count := v_deleted_count + 1;
        EXCEPTION WHEN OTHERS THEN
            -- 한 명이 걸려도 나머지는 지운다. 예전에는 여기서 학급 전체가 묶였다.
            RAISE WARNING '학생 % 영구 삭제 실패(건너뜀): %', v_student_id, SQLERRM;
        END;
        PERFORM set_config('app.writing_footprint_maintenance', 'off', true);
    END LOOP;

    PERFORM set_config('app.writing_footprint_maintenance', 'off', true);
    RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_students(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_students(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- [1] 교사가 창을 열지 않아도 매일 저절로 돈다
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_expired_students_all_v1()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_deleted_count INTEGER := 0;
BEGIN
    -- 브라우저·로그인 사용자는 막고 크론/백엔드만 허용한다. 판별은 실제 로그인 역할(session_user)로 한다
    -- (current_setting('role') 은 SET ROLE 하지 않으면 대개 'none' 이라 크론까지 막힌다 — 20261328 참조).
    IF auth.uid() IS NOT NULL
       OR session_user NOT IN ('service_role', 'supabase_admin', 'postgres') THEN
        RAISE EXCEPTION '[보안] 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    FOR v_student_id IN
        SELECT student.id FROM public.students student
        WHERE student.deleted_at IS NOT NULL
          AND student.deleted_at < (NOW() - INTERVAL '3 days')
    LOOP
        BEGIN
            PERFORM set_config('app.writing_footprint_maintenance', 'on', true);
            DELETE FROM public.students WHERE id = v_student_id;
            v_deleted_count := v_deleted_count + 1;
        EXCEPTION WHEN OTHERS THEN
            RAISE WARNING '학생 % 영구 삭제 실패(건너뜀): %', v_student_id, SQLERRM;
        END;
        PERFORM set_config('app.writing_footprint_maintenance', 'off', true);
    END LOOP;

    PERFORM set_config('app.writing_footprint_maintenance', 'off', true);
    RETURN v_deleted_count;
END;
$$;

REVOKE ALL ON FUNCTION public.purge_expired_students_all_v1() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_students_all_v1() TO service_role;

COMMENT ON FUNCTION public.purge_expired_students_all_v1() IS
    '3일 지난 삭제 대기 학생을 학급 가리지 않고 영구 삭제한다. 교사가 복구함을 열지 않아도 돌도록 매일 cron 으로 부른다.';

-- 다했니 정리(03:00)와 겹치지 않게 03:20 에 둔다.
SELECT cron.unschedule('purge-expired-students')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-expired-students');
SELECT cron.schedule(
    'purge-expired-students', '20 3 * * *',
    $job$SELECT public.purge_expired_students_all_v1()$job$
);

NOTIFY pgrst, 'reload schema';

COMMIT;

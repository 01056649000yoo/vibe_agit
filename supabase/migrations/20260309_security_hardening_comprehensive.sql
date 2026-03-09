-- ============================================================
-- 🛡️ [보안 강화] 종합 보안 필터링 및 권한 최적화
-- 작성일: 2026-03-09
-- 설명: Supabase 린터 경고 해결 (익명 접근 차단 & 함수 검색 경로 고정)
-- ============================================================

-- [1] 보안 최우선 함수: Search Path 고정 (보안상 취약점 해결)
-- ROLE mutable search_path를 public으로 고정하여 환경 변수 조작 공격 방지

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER AS $$
DECLARE
    v_is_admin BOOLEAN := false;
    v_caller_id UUID;
BEGIN
    IF COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true' THEN
        RETURN NEW;
    END IF;
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN RETURN NEW; END IF;
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN') INTO v_is_admin;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.role IS DISTINCT FROM OLD.role AND NOT v_is_admin THEN
            RAISE EXCEPTION '[보안] role 변경 권한이 없습니다.' USING ERRCODE = '42501';
        END IF;
        IF NEW.is_approved IS DISTINCT FROM OLD.is_approved AND NOT v_is_admin THEN
            RAISE EXCEPTION '[보안] 승인 상태 변경 권한이 없습니다.' USING ERRCODE = '42501';
        END IF;
    END IF;
    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'ADMIN' AND NOT v_is_admin THEN
            RAISE EXCEPTION '[보안] ADMIN 역할은 자체 할당할 수 없습니다.' USING ERRCODE = '42501';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.setup_teacher_profile(
    p_full_name TEXT DEFAULT NULL,
    p_email TEXT DEFAULT NULL,
    p_api_mode TEXT DEFAULT 'PERSONAL'
)
RETURNS JSON AS $$
DECLARE
    v_auth_id UUID;
    v_auto_approve BOOLEAN := false;
    v_existing RECORD;
    v_is_approved BOOLEAN;
    v_final_role TEXT;
BEGIN
    v_auth_id := auth.uid();
    IF v_auth_id IS NULL THEN
        RETURN json_build_object('success', false, 'error', '인증되지 않은 요청입니다.');
    END IF;
    SELECT * INTO v_existing FROM public.profiles WHERE id = v_auth_id;
    IF v_existing.role = 'ADMIN' THEN
        RETURN json_build_object('success', true, 'role', 'ADMIN', 'is_approved', true);
    END IF;
    BEGIN
        SELECT (value = to_jsonb(true)) INTO v_auto_approve
        FROM public.system_settings WHERE key = 'auto_approval';
    EXCEPTION WHEN OTHERS THEN
        v_auto_approve := false;
    END;
    v_is_approved := COALESCE(v_existing.is_approved, false) OR COALESCE(v_auto_approve, false);
    v_final_role := COALESCE(v_existing.role, 'TEACHER');
    IF v_final_role != 'ADMIN' THEN v_final_role := 'TEACHER'; END IF;
    PERFORM set_config('app.bypass_profile_protection', 'true', true);
    INSERT INTO public.profiles (id, role, email, full_name, is_approved, api_mode)
    VALUES (v_auth_id, v_final_role, COALESCE(p_email, ''), p_full_name, v_is_approved, COALESCE(p_api_mode, 'PERSONAL'))
    ON CONFLICT (id) DO UPDATE SET
        email = COALESCE(EXCLUDED.email, public.profiles.email),
        full_name = COALESCE(EXCLUDED.full_name, public.profiles.full_name),
        api_mode = COALESCE(EXCLUDED.api_mode, public.profiles.api_mode),
        role = CASE WHEN public.profiles.role = 'ADMIN' THEN 'ADMIN' ELSE 'TEACHER' END,
        is_approved = CASE
            WHEN public.profiles.is_approved = true THEN true
            WHEN v_auto_approve THEN true
            ELSE public.profiles.is_approved
        END;
    PERFORM set_config('app.bypass_profile_protection', '', true);
    RETURN json_build_object('success', true, 'role', v_final_role, 'is_approved', v_is_approved);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.cleanup_expired_deletions()
RETURNS void AS $$
BEGIN
    DELETE FROM public.students WHERE deleted_at < now() - interval '3 days';
    DELETE FROM public.classes WHERE deleted_at < now() - interval '3 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.handle_email_verification()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email_confirmed_at IS NOT NULL THEN
        UPDATE public.profiles SET email_verified = true WHERE id = NEW.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.increment_student_points(
    p_student_id UUID,
    p_amount INTEGER,
    p_reason TEXT DEFAULT '포인트 보상 🎁',
    p_post_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL
)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN
        v_is_authorized := true;
    ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN') INTO v_is_authorized;
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s
                JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id
                  AND (c.teacher_id = v_caller_id OR s.auth_id = v_caller_id)
                  AND s.deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 포인트를 변경할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.students SET total_points = COALESCE(total_points, 0) + p_amount WHERE id = p_student_id;
    INSERT INTO public.point_logs (student_id, reason, amount, post_id, mission_id) VALUES (p_student_id, p_reason, p_amount, p_post_id, p_mission_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.update_tower_max_floor(p_student_id UUID, p_class_id UUID, p_floor INTEGER)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN v_is_authorized := true;
    ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN') INTO v_is_authorized;
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id AND s.class_id = p_class_id AND s.deleted_at IS NULL
                  AND (s.auth_id = v_caller_id OR c.teacher_id = v_caller_id)
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 랭킹을 변경할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.vocab_tower_rankings (student_id, class_id, max_floor, updated_at)
    VALUES (p_student_id, p_class_id, p_floor, now())
    ON CONFLICT (student_id)
    DO UPDATE SET
        max_floor = GREATEST(vocab_tower_rankings.max_floor, EXCLUDED.max_floor),
        updated_at = now()
    WHERE vocab_tower_rankings.max_floor < EXCLUDED.max_floor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.mark_feedback_as_read(p_student_id UUID)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN v_is_authorized := true;
    ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN') INTO v_is_authorized;
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s LEFT JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = p_student_id AND s.deleted_at IS NULL
                  AND (s.auth_id = v_caller_id OR c.teacher_id = v_caller_id)
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 알림 상태를 변경할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.students SET last_feedback_check = timezone('utc'::text, now()) WHERE id = p_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.teacher_manage_points(
    target_student_id UUID,
    points_amount INTEGER,
    reason_text TEXT
)
RETURNS void AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN v_is_authorized := true;
    ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN') INTO v_is_authorized;
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.students s JOIN public.classes c ON c.id = s.class_id
                WHERE s.id = target_student_id AND c.teacher_id = v_caller_id AND s.deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학생의 포인트를 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.students SET total_points = COALESCE(total_points, 0) + points_amount WHERE id = target_student_id;
    INSERT INTO public.point_logs (student_id, reason, amount) VALUES (target_student_id, reason_text, points_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.add_student_with_bonus(
    p_class_id UUID,
    p_name TEXT,
    p_student_code TEXT,
    p_initial_points INTEGER DEFAULT 100
)
RETURNS UUID AS $$
DECLARE
    v_caller_id UUID;
    v_is_authorized BOOLEAN := false;
    new_student_id UUID;
BEGIN
    v_caller_id := auth.uid();
    IF v_caller_id IS NULL THEN v_is_authorized := true;
    ELSE
        SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_caller_id AND role = 'ADMIN') INTO v_is_authorized;
        IF NOT v_is_authorized THEN
            SELECT EXISTS (
                SELECT 1 FROM public.classes WHERE id = p_class_id AND teacher_id = v_caller_id AND deleted_at IS NULL
            ) INTO v_is_authorized;
        END IF;
    END IF;
    IF NOT v_is_authorized THEN
        RAISE EXCEPTION '[보안] 해당 학급에 학생을 추가할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    INSERT INTO public.students (class_id, name, student_code, total_points)
    VALUES (p_class_id, p_name, p_student_code, p_initial_points)
    RETURNING id INTO new_student_id;
    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (new_student_id, '신규 등록 기념 환영 포인트! 🎁', p_initial_points);
    RETURN new_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


-- [2] 익명 접근 차단 (RLS 강화)
-- 모든 정책에 TO authenticated 또는 TO service_role을 명시하여 anon(익명) 접근 차단

-- agit_honor_roll
DROP POLICY IF EXISTS "Honor_Roll_Select_v7" ON public.agit_honor_roll;
CREATE POLICY "Honor_Roll_Select_v7" ON public.agit_honor_roll FOR SELECT TO authenticated USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.class_id = agit_honor_roll.class_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

-- announcements
DROP POLICY IF EXISTS "Announcement_Read" ON public.announcements;
CREATE POLICY "Announcement_Read" ON public.announcements FOR SELECT TO authenticated USING (true);

-- classes
DROP POLICY IF EXISTS "classes_read_v7" ON public.classes;
CREATE POLICY "classes_read_v7" ON public.classes FOR SELECT TO authenticated USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- point_logs
DROP POLICY IF EXISTS "point_logs_read_v3" ON public.point_logs;
CREATE POLICY "point_logs_read_v3" ON public.point_logs FOR SELECT TO authenticated USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
    OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = student_id AND EXISTS (
            SELECT 1 FROM public.classes c WHERE c.id = s.class_id AND c.teacher_id = auth.uid()
        )
    )
);

-- post_comments (이미 TO authenticated가 적용되지 않은 예전 정책들 대응)
DROP POLICY IF EXISTS "Comment_Select_v7" ON public.post_comments;
CREATE POLICY "Comment_Select_v7" ON public.post_comments FOR SELECT TO authenticated USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE class_id IN (
            SELECT class_id FROM public.fn_get_students_for_rls_check()
            WHERE auth_id = auth.uid() AND deleted_at IS NULL
        )
    )
    OR (
        teacher_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.student_posts p
            JOIN public.writing_missions m ON p.mission_id = m.id
            WHERE p.id = post_id
            AND m.class_id IN (
                SELECT class_id FROM public.fn_get_students_for_rls_check()
                WHERE auth_id = auth.uid() AND deleted_at IS NULL
            )
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

-- students
DROP POLICY IF EXISTS "Student_Select_v6" ON public.students;
CREATE POLICY "Student_Select_v6" ON public.students FOR SELECT TO authenticated USING (
    public.is_admin()
    OR auth_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid())
    OR class_id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- student_posts
DROP POLICY IF EXISTS "student_posts_read_v6" ON public.student_posts;
CREATE POLICY "student_posts_read_v6" ON public.student_posts FOR SELECT TO authenticated USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE class_id IN (
            SELECT class_id FROM public.fn_get_students_for_rls_check()
            WHERE auth_id = auth.uid() AND deleted_at IS NULL
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "student_posts_modify_v6" ON public.student_posts;
CREATE POLICY "student_posts_modify_v6" ON public.student_posts FOR ALL TO authenticated USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

-- post_reactions
DROP POLICY IF EXISTS "Reaction_Select_v6" ON public.post_reactions;
CREATE POLICY "Reaction_Select_v6" ON public.post_reactions FOR SELECT TO authenticated USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE class_id IN (
            SELECT class_id FROM public.fn_get_students_for_rls_check()
            WHERE auth_id = auth.uid() AND deleted_at IS NULL
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

-- writing_missions
DROP POLICY IF EXISTS "Mission_Read_v6" ON public.writing_missions;
CREATE POLICY "Mission_Read_v6" ON public.writing_missions FOR SELECT TO authenticated USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR class_id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- profiles
DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
CREATE POLICY "profiles_select_self" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
CREATE POLICY "profiles_select_admin" ON public.profiles FOR SELECT TO authenticated USING (public.is_admin());

-- student_records
DROP POLICY IF EXISTS "Records_Select" ON public.student_records;
CREATE POLICY "Records_Select" ON public.student_records FOR SELECT TO authenticated USING (teacher_id = auth.uid() OR public.is_admin());

-- system_settings
DROP POLICY IF EXISTS "Settings_Read" ON public.system_settings;
CREATE POLICY "Settings_Read" ON public.system_settings FOR SELECT TO authenticated USING (auth.uid() IS NOT NULL OR public.is_admin());

-- teachers
DROP POLICY IF EXISTS "teachers_select_self" ON public.teachers;
CREATE POLICY "teachers_select_self" ON public.teachers FOR SELECT TO authenticated USING (auth.uid() = id);
DROP POLICY IF EXISTS "teachers_select_admin" ON public.teachers;
CREATE POLICY "teachers_select_admin" ON public.teachers FOR SELECT TO authenticated USING (public.is_admin());

-- 권한 부여 재조정 (익명 권한 최소화)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON public.classes, public.students, public.writing_missions, public.student_posts, 
             public.post_comments, public.post_reactions, public.point_logs, 
             public.announcements, public.agit_honor_roll TO authenticated;

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

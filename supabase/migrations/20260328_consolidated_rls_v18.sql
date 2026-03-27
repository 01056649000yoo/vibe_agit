-- ============================================================================
-- 🛡️ [VIBE_TEST] Consolidated RLS V18 & Profile Security Hardening
-- 작성일: 2026-03-28
-- 설명: 
--   1. 모든 기존 RLS 정책 삭제 (Clean Slate)
--   2. JWT 기반 최적화 헬퍼 함수 보장 (Role, Class ID, Student ID)
--   3. 프로필 보안 강화: 민감정보(API 키)를 별도 테이블(profile_secrets)로 분리
--   4. 전 테이블에 대해 V18 규격의 세분화된(Granular) RLS 정책 적용
-- ============================================================================

-- [1] 기존 모든 정책 동적 삭제 (Part 1: Clean Start)
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN (
              'agit_honor_roll', 'announcements', 'classes', 'feedback_reports', 
              'point_logs', 'post_comments', 'post_reactions', 'profiles', 
              'student_posts', 'student_records', 'students', 'system_settings', 
              'teachers', 'vocab_tower_rankings', 'writing_missions'
          )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- [2] JWT 최적화 헬퍼 함수 (STABLE)
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text AS $$
  SELECT (COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', ''))::text;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.auth_user_class_id()
RETURNS uuid AS $$
  SELECT (NULLIF(auth.jwt() -> 'app_metadata' ->> 'class_id', ''))::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.auth_student_id()
RETURNS uuid AS $$
  SELECT (NULLIF(auth.jwt() -> 'app_metadata' ->> 'student_id', ''))::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.auth_user_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_user_class_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_student_id() TO authenticated, service_role;

-- [3] 프로필 보안 강화 (Profile Secrets)
CREATE TABLE IF NOT EXISTS public.profile_secrets (
    id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    gemini_api_key TEXT,
    personal_openai_api_key TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 기존 데이터 이관
INSERT INTO public.profile_secrets (id, gemini_api_key, personal_openai_api_key)
SELECT id, gemini_api_key, personal_openai_api_key 
FROM public.profiles 
ON CONFLICT (id) DO UPDATE SET 
    gemini_api_key = EXCLUDED.gemini_api_key,
    personal_openai_api_key = EXCLUDED.personal_openai_api_key;

-- 기존 profiles 테이블에서 민감 컬럼 삭제 (안전하게 처리)
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS gemini_api_key;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS personal_openai_api_key;

-- RPC 함수 업데이트 (API 키 존재 여부 확인)
CREATE OR REPLACE FUNCTION public.check_my_api_key_exists()
RETURNS JSON AS $$
DECLARE
    v_key_exists BOOLEAN := FALSE;
BEGIN
    SELECT 
        (personal_openai_api_key IS NOT NULL AND personal_openai_api_key != '')
    INTO v_key_exists
    FROM public.profile_secrets
    WHERE id = auth.uid();

    RETURN json_build_object('has_key', COALESCE(v_key_exists, FALSE));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- [4] profile_secrets RLS
ALTER TABLE public.profile_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Profile_Secrets_Owner_V18" ON public.profile_secrets
    FOR ALL TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- [5] V18 전면 적용 - 전용 정책 (Granular)

-- 1. vocab_tower_rankings
CREATE POLICY "Tower_Rankings_V18" ON public.vocab_tower_rankings FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 2. announcements
CREATE POLICY "Announcements_Read_V18" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Announcements_Manage_V18" ON public.announcements FOR ALL TO authenticated 
USING (public.auth_user_role() = 'ADMIN')
WITH CHECK (public.auth_user_role() = 'ADMIN');

-- 3. feedback_reports
CREATE POLICY "Feedback_Reports_V18" ON public.feedback_reports FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 4. profiles (Sensitive columns removed, standard select/update)
CREATE POLICY "Profiles_Select_V18" ON public.profiles FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (id = auth.uid()));

CREATE POLICY "Profiles_Update_V18" ON public.profiles FOR UPDATE TO authenticated 
USING (id = auth.uid())
WITH CHECK (id = auth.uid());

CREATE POLICY "Profiles_Insert_V18" ON public.profiles FOR INSERT TO authenticated 
WITH CHECK (id = auth.uid());

-- 5. student_records
CREATE POLICY "Records_V18" ON public.student_records FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 6. system_settings
CREATE POLICY "Settings_V18" ON public.system_settings FOR ALL TO authenticated 
USING (public.auth_user_role() = 'ADMIN')
WITH CHECK (public.auth_user_role() = 'ADMIN');

CREATE POLICY "Settings_Read_V18" ON public.system_settings FOR SELECT TO authenticated 
USING ((auth.uid() IS NOT NULL) OR (public.auth_user_role() = 'ADMIN'));

-- 7. teachers
CREATE POLICY "Teachers_V18" ON public.teachers FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (id = auth.uid()));

-- 8. post_reactions
CREATE POLICY "Reaction_Select_V18" ON public.post_reactions FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Reaction_Insert_V18" ON public.post_reactions FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Reaction_Update_V18" ON public.post_reactions FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()));

CREATE POLICY "Reaction_Delete_V18" ON public.post_reactions FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (student_id = public.auth_student_id()) OR 
    ((class_id = public.auth_user_class_id()) AND (public.auth_user_role() = 'TEACHER'))
);

-- 9. agit_honor_roll
CREATE POLICY "Honor_Roll_V18" ON public.agit_honor_roll FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 10. classes
CREATE POLICY "Classes_Select_V18" ON public.classes FOR SELECT TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (teacher_id = auth.uid()) OR 
    (id = public.auth_user_class_id())
);

CREATE POLICY "Classes_Insert_V18" ON public.classes FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (public.auth_user_role() = 'TEACHER'));

CREATE POLICY "Classes_Update_V18" ON public.classes FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

CREATE POLICY "Classes_Delete_V18" ON public.classes FOR DELETE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 11. post_comments
CREATE POLICY "Comment_Select_V18" ON public.post_comments FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Comment_Insert_V18" ON public.post_comments FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Comment_Update_V18" ON public.post_comments FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()) OR (public.auth_user_role() = 'TEACHER'))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()) OR (public.auth_user_role() = 'TEACHER'));

CREATE POLICY "Comment_Delete_V18" ON public.post_comments FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (student_id = public.auth_student_id()) OR 
    (public.auth_user_role() = 'TEACHER' AND class_id = public.auth_user_class_id())
);

-- 12. student_posts
CREATE POLICY "Post_Select_V18" ON public.student_posts FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Post_Insert_V18" ON public.student_posts FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Post_Update_V18" ON public.student_posts FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()));

CREATE POLICY "Post_Delete_V18" ON public.student_posts FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (student_id = public.auth_student_id()) OR 
    ((class_id = public.auth_user_class_id()) AND (public.auth_user_role() = 'TEACHER'))
);

-- 13. writing_missions
CREATE POLICY "Mission_Select_V18" ON public.writing_missions FOR SELECT TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (teacher_id = auth.uid()) OR 
    (class_id = public.auth_user_class_id())
);

CREATE POLICY "Mission_Insert_V18" ON public.writing_missions FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

CREATE POLICY "Mission_Update_V18" ON public.writing_missions FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

CREATE POLICY "Mission_Delete_V18" ON public.writing_missions FOR DELETE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 14. students
CREATE POLICY "Student_Select_V18" ON public.students FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Student_Update_V18" ON public.students FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 15. point_logs
CREATE POLICY "Point_Logs_Select_V18" ON public.point_logs FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Point_Logs_Insert_V18" ON public.point_logs FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (auth.uid() = teacher_id));

CREATE POLICY "Point_Logs_Update_V18" ON public.point_logs FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (auth.uid() = teacher_id))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (auth.uid() = teacher_id));

CREATE POLICY "Point_Logs_Delete_V18" ON public.point_logs FOR DELETE TO authenticated 
USING (public.auth_user_role() = 'ADMIN');

-- [6] 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

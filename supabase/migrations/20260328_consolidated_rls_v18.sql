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
              'teachers', 'vocab_tower_rankings', 'vocab_tower_history',
              'agit_season_history', 'writing_missions', 'profile_secrets'
          )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- [2] JWT 최적화 헬퍼 함수 (STABLE)
CREATE OR REPLACE FUNCTION public.auth_user_role()
RETURNS text AS $$
DECLARE
  v_role text;
BEGIN
  -- 1. JWT app_metadata에서 먼저 확인 (최적화)
  v_role := (auth.jwt() -> 'app_metadata' ->> 'role')::text;
  IF v_role IS NOT NULL AND v_role != '' THEN
    RETURN v_role;
  END IF;

  -- 2. JWT에 없으면 profiles 테이블에서 직접 확인 (보안 정의자 권한으로 RLS 우회)
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  RETURN COALESCE(v_role, '')::text;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public;

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

-- [주의] 기존 profiles 테이블에서 민감 컬럼 삭제는 운영 단계에서 검증 후 실행 권장
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS gemini_api_key;
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS personal_openai_api_key;

-- [보완] RLS 성능 최적화를 위한 누락된 class_id 컬럼 추가 (Denormalization)
ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE;
ALTER TABLE public.point_logs ADD COLUMN IF NOT EXISTS class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE;

-- 기존 데이터에 class_id 채우기 (연결된 post/student 정보를 바탕으로)
-- post_comments
UPDATE public.post_comments pc
SET class_id = sp.class_id
FROM public.student_posts sp
WHERE pc.post_id = sp.id AND pc.class_id IS NULL;

-- point_logs
UPDATE public.point_logs pl
SET class_id = s.class_id
FROM public.students s
WHERE pl.student_id = s.id AND pl.class_id IS NULL;

-- RPC 함수 업데이트 (API 키 존재 여부 확인)
-- 기존 2222_add_check_api_key_rpc.sql를 대체함
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

DROP POLICY IF EXISTS "Profile_Secrets_Owner_V18" ON public.profile_secrets;
CREATE POLICY "Profile_Secrets_Owner_V18" ON public.profile_secrets
    FOR ALL TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- [5] V18 전면 적용 - 전용 정책 (Granular)

-- 1. vocab_tower_rankings
DROP POLICY IF EXISTS "Tower_Rankings_V18" ON public.vocab_tower_rankings;
CREATE POLICY "Tower_Rankings_V18" ON public.vocab_tower_rankings FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- 2. announcements
DROP POLICY IF EXISTS "Announcements_Read_V18" ON public.announcements;
CREATE POLICY "Announcements_Read_V18" ON public.announcements FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Announcements_Manage_V18" ON public.announcements;
CREATE POLICY "Announcements_Manage_V18" ON public.announcements FOR ALL TO authenticated 
USING (public.auth_user_role() = 'ADMIN')
WITH CHECK (public.auth_user_role() = 'ADMIN');

-- 3. feedback_reports
DROP POLICY IF EXISTS "Feedback_Reports_Select_V18" ON public.feedback_reports;
CREATE POLICY "Feedback_Reports_Select_V18" ON public.feedback_reports FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Feedback_Reports_Insert_V18" ON public.feedback_reports;
CREATE POLICY "Feedback_Reports_Insert_V18" ON public.feedback_reports FOR INSERT TO authenticated 
WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Feedback_Reports_Update_V18" ON public.feedback_reports;
CREATE POLICY "Feedback_Reports_Update_V18" ON public.feedback_reports FOR UPDATE TO authenticated 
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

DROP POLICY IF EXISTS "Feedback_Reports_Delete_V18" ON public.feedback_reports;
CREATE POLICY "Feedback_Reports_Delete_V18" ON public.feedback_reports FOR DELETE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 4. profiles
DROP POLICY IF EXISTS "Profiles_Select_V18" ON public.profiles;
CREATE POLICY "Profiles_Select_V18" ON public.profiles FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (id = auth.uid()));

DROP POLICY IF EXISTS "Profiles_Update_V18" ON public.profiles;
CREATE POLICY "Profiles_Update_V18" ON public.profiles FOR UPDATE TO authenticated 
USING ((id = auth.uid()) OR (public.auth_user_role() = 'ADMIN'))
WITH CHECK ((id = auth.uid()) OR (public.auth_user_role() = 'ADMIN'));

DROP POLICY IF EXISTS "Profiles_Insert_V18" ON public.profiles;
CREATE POLICY "Profiles_Insert_V18" ON public.profiles FOR INSERT TO authenticated 
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Profiles_Delete_V18" ON public.profiles;
CREATE POLICY "Profiles_Delete_V18" ON public.profiles FOR DELETE TO authenticated 
USING (public.auth_user_role() = 'ADMIN');

-- 5. student_records
DROP POLICY IF EXISTS "Records_Select_V18" ON public.student_records;
CREATE POLICY "Records_Select_V18" ON public.student_records FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Records_Insert_V18" ON public.student_records;
CREATE POLICY "Records_Insert_V18" ON public.student_records FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Records_Update_V18" ON public.student_records;
CREATE POLICY "Records_Update_V18" ON public.student_records FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Records_Delete_V18" ON public.student_records;
CREATE POLICY "Records_Delete_V18" ON public.student_records FOR DELETE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 6. system_settings
DROP POLICY IF EXISTS "Settings_V18" ON public.system_settings;
CREATE POLICY "Settings_V18" ON public.system_settings FOR ALL TO authenticated 
USING (public.auth_user_role() = 'ADMIN')
WITH CHECK (public.auth_user_role() = 'ADMIN');

DROP POLICY IF EXISTS "Settings_Read_V18" ON public.system_settings;
CREATE POLICY "Settings_Read_V18" ON public.system_settings FOR SELECT TO authenticated 
USING ((auth.uid() IS NOT NULL) OR (public.auth_user_role() = 'ADMIN'));

-- 7. teachers
DROP POLICY IF EXISTS "Teachers_Select_V18" ON public.teachers;
CREATE POLICY "Teachers_Select_V18" ON public.teachers FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (id = auth.uid()));

DROP POLICY IF EXISTS "Teachers_Insert_V18" ON public.teachers;
CREATE POLICY "Teachers_Insert_V18" ON public.teachers FOR INSERT TO authenticated 
WITH CHECK (id = auth.uid());

DROP POLICY IF EXISTS "Teachers_Update_V18" ON public.teachers;
CREATE POLICY "Teachers_Update_V18" ON public.teachers FOR UPDATE TO authenticated 
USING ((id = auth.uid()) OR (public.auth_user_role() = 'ADMIN'))
WITH CHECK ((id = auth.uid()) OR (public.auth_user_role() = 'ADMIN'));

DROP POLICY IF EXISTS "Teachers_Delete_V18" ON public.teachers;
CREATE POLICY "Teachers_Delete_V18" ON public.teachers FOR DELETE TO authenticated 
USING (public.auth_user_role() = 'ADMIN');

-- 8. post_reactions
DROP POLICY IF EXISTS "Reaction_Select_V18" ON public.post_reactions;
CREATE POLICY "Reaction_Select_V18" ON public.post_reactions FOR SELECT TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Reaction_Insert_V18" ON public.post_reactions;
CREATE POLICY "Reaction_Insert_V18" ON public.post_reactions FOR INSERT TO authenticated 
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Reaction_Update_V18" ON public.post_reactions;
CREATE POLICY "Reaction_Update_V18" ON public.post_reactions FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()));

DROP POLICY IF EXISTS "Reaction_Delete_V18" ON public.post_reactions;
CREATE POLICY "Reaction_Delete_V18" ON public.post_reactions FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (student_id = public.auth_student_id()) OR 
    ((class_id = public.auth_user_class_id()) AND (public.auth_user_role() = 'TEACHER'))
);

-- 9. agit_honor_roll
DROP POLICY IF EXISTS "Honor_Roll_V18" ON public.agit_honor_roll;
CREATE POLICY "Honor_Roll_V18" ON public.agit_honor_roll FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- 10. classes
DROP POLICY IF EXISTS "Classes_Select_V18" ON public.classes;
CREATE POLICY "Classes_Select_V18" ON public.classes FOR SELECT TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (teacher_id = auth.uid()) OR 
    (id = public.auth_user_class_id())
);

DROP POLICY IF EXISTS "Classes_Insert_V18" ON public.classes;
CREATE POLICY "Classes_Insert_V18" ON public.classes FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (public.auth_user_role() = 'TEACHER'));

DROP POLICY IF EXISTS "Classes_Update_V18" ON public.classes;
CREATE POLICY "Classes_Update_V18" ON public.classes FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Classes_Delete_V18" ON public.classes;
CREATE POLICY "Classes_Delete_V18" ON public.classes FOR DELETE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 11. post_comments
DROP POLICY IF EXISTS "Comment_Select_V18" ON public.post_comments;
CREATE POLICY "Comment_Select_V18" ON public.post_comments FOR SELECT TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Comment_Insert_V18" ON public.post_comments;
CREATE POLICY "Comment_Insert_V18" ON public.post_comments FOR INSERT TO authenticated 
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Comment_Update_V18" ON public.post_comments;
CREATE POLICY "Comment_Update_V18" ON public.post_comments FOR UPDATE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (student_id = public.auth_student_id()) OR 
    ((public.auth_user_role() = 'TEACHER') AND (class_id = public.auth_user_class_id()))
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (student_id = public.auth_student_id()) OR 
    ((public.auth_user_role() = 'TEACHER') AND (class_id = public.auth_user_class_id()))
);

DROP POLICY IF EXISTS "Comment_Delete_V18" ON public.post_comments;
CREATE POLICY "Comment_Delete_V18" ON public.post_comments FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (student_id = public.auth_student_id()) OR 
    ((public.auth_user_role() = 'TEACHER') AND (class_id = public.auth_user_class_id()))
);

-- 12. student_posts
DROP POLICY IF EXISTS "Post_Select_V18" ON public.student_posts;
CREATE POLICY "Post_Select_V18" ON public.student_posts FOR SELECT TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Post_Insert_V18" ON public.student_posts;
CREATE POLICY "Post_Insert_V18" ON public.student_posts FOR INSERT TO authenticated 
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Post_Update_V18" ON public.student_posts;
CREATE POLICY "Post_Update_V18" ON public.student_posts FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()));

DROP POLICY IF EXISTS "Post_Delete_V18" ON public.student_posts;
CREATE POLICY "Post_Delete_V18" ON public.student_posts FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (student_id = public.auth_student_id()) OR 
    ((class_id = public.auth_user_class_id()) AND (public.auth_user_role() = 'TEACHER'))
);

-- 13. writing_missions
DROP POLICY IF EXISTS "Mission_Select_V18" ON public.writing_missions;
CREATE POLICY "Mission_Select_V18" ON public.writing_missions FOR SELECT TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (teacher_id = auth.uid()) OR 
    (class_id = public.auth_user_class_id())
);

DROP POLICY IF EXISTS "Mission_Insert_V18" ON public.writing_missions;
CREATE POLICY "Mission_Insert_V18" ON public.writing_missions FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Mission_Update_V18" ON public.writing_missions;
CREATE POLICY "Mission_Update_V18" ON public.writing_missions FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

DROP POLICY IF EXISTS "Mission_Delete_V18" ON public.writing_missions;
CREATE POLICY "Mission_Delete_V18" ON public.writing_missions FOR DELETE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 14. students
DROP POLICY IF EXISTS "Student_Select_V18" ON public.students;
CREATE POLICY "Student_Select_V18" ON public.students FOR SELECT TO authenticated 
USING (
  (EXISTS (SELECT 1 FROM public.teachers WHERE id = auth.uid())) OR 
  (class_id = public.auth_user_class_id())
);

DROP POLICY IF EXISTS "Student_Insert_V18" ON public.students;
CREATE POLICY "Student_Insert_V18" ON public.students FOR INSERT TO authenticated 
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Student_Update_V18" ON public.students;
CREATE POLICY "Student_Update_V18" ON public.students FOR UPDATE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Student_Delete_V18" ON public.students;
CREATE POLICY "Student_Delete_V18" ON public.students FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- 15. point_logs
DROP POLICY IF EXISTS "Point_Logs_Select_V18" ON public.point_logs;
CREATE POLICY "Point_Logs_Select_V18" ON public.point_logs FOR SELECT TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Point_Logs_Insert_V18" ON public.point_logs;
CREATE POLICY "Point_Logs_Insert_V18" ON public.point_logs FOR INSERT TO authenticated 
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Point_Logs_Update_V18" ON public.point_logs;
CREATE POLICY "Point_Logs_Update_V18" ON public.point_logs FOR UPDATE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "Point_Logs_Delete_V18" ON public.point_logs;
CREATE POLICY "Point_Logs_Delete_V18" ON public.point_logs FOR DELETE TO authenticated 
USING (public.auth_user_role() = 'ADMIN');

-- 16. vocab_tower_history
DROP POLICY IF EXISTS "Tower_History_V18" ON public.vocab_tower_history;
CREATE POLICY "Tower_History_V18" ON public.vocab_tower_history FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- 17. agit_season_history
DROP POLICY IF EXISTS "Season_History_V18" ON public.agit_season_history;
CREATE POLICY "Season_History_V18" ON public.agit_season_history FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') OR 
    (class_id = public.auth_user_class_id()) OR
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- [6] 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

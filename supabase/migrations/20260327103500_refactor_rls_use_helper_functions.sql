-- ============================================================================
-- 🛡️ [성능 최적화 최종] V12: STABLE 헬퍼 함수를 적용한 RLS 전면 리팩토링
-- 작성일: 2026-03-27
-- 설명: 모든 RLS 정책에서 매 행마다 JWT를 파싱하던 부분을 STABLE 함수로 교체하여
--       성능을 극대화합니다. (_V12 접미사 사용)
-- ============================================================================

-- [1] 기존 모든 정책 동적 삭제 (Clean Slate)
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

-- [2] V12: public.auth_user_role() 및 public.auth_user_class_id() 적용한 정책 생성

-- 1. agit_honor_roll
CREATE POLICY "Honor_Roll_V12" ON public.agit_honor_roll FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 2. announcements
CREATE POLICY "Announcements_Read_V12" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Announcements_Manage_V12" ON public.announcements FOR ALL TO authenticated 
USING (public.auth_user_role() = 'ADMIN')
WITH CHECK (public.auth_user_role() = 'ADMIN');

-- 3. classes
CREATE POLICY "Classes_V12" ON public.classes FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (id = public.auth_user_class_id()));

-- 4. feedback_reports
CREATE POLICY "Feedback_Reports_V12" ON public.feedback_reports FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 5. point_logs
CREATE POLICY "Point_Logs_V11" ON public.point_logs FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 6. post_comments
CREATE POLICY "Comment_V12" ON public.post_comments FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 7. post_reactions
CREATE POLICY "Reaction_V12" ON public.post_reactions FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 8. profiles
CREATE POLICY "Profiles_V12" ON public.profiles FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (id = auth.uid()));

-- 9. student_posts
CREATE POLICY "Post_V12" ON public.student_posts FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 10. student_records
CREATE POLICY "Records_V12" ON public.student_records FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (teacher_id = auth.uid()));

-- 11. students
CREATE POLICY "Student_V12" ON public.students FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 12. system_settings
CREATE POLICY "Settings_V12" ON public.system_settings FOR ALL TO authenticated 
USING (public.auth_user_role() = 'ADMIN')
WITH CHECK (public.auth_user_role() = 'ADMIN');
CREATE POLICY "Settings_Read_V12" ON public.system_settings FOR SELECT TO authenticated 
USING (auth.uid() IS NOT NULL OR (public.auth_user_role() = 'ADMIN'));

-- 13. teachers
CREATE POLICY "Teachers_V12" ON public.teachers FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (id = auth.uid()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (id = auth.uid()));

-- 14. vocab_tower_rankings
CREATE POLICY "Tower_Rankings_V12" ON public.vocab_tower_rankings FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 15. writing_missions
CREATE POLICY "Mission_V12" ON public.writing_missions FOR ALL TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

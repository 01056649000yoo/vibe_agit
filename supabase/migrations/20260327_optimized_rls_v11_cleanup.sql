-- ============================================================================
-- 🛡️ [RLS 최적화 최종 끝판왕] V11: 전면 초기화 및 초경량 JWT 전용 정책 (Zero-EXISTS)
-- 작성일: 2026-03-27
-- 설명: 기존의 모든 정책(v1~v10)을 완전히 삭제하고, 
--       오직 JWT app_metadata 기반의 단 한 줄의 조건으로 모든 권한을 통제합니다.
-- ============================================================================

-- [1] 모든 테이블의 기존 정책 완전 삭제 (Clean Slate)
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND tablename IN (
              'agit_honor_roll', 'student_posts', 'post_comments', 'post_reactions', 
              'students', 'writing_missions', 'classes', 'point_logs', 
              'vocab_tower_rankings', 'student_records', 'announcements', 'profiles',
              'system_settings', 'teachers', 'feedback_reports', 'student_records', 'announcements'
          )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- [2] 보충 조치: 모든 대상 테이블에 class_id 컬럼 및 인덱스 보장
DO $$
BEGIN
    -- [생략: 이전과 동일한 컬럼 보강 로직]
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_posts' AND column_name='class_id') THEN ALTER TABLE public.student_posts ADD COLUMN class_id uuid REFERENCES public.classes(id); END IF;
    CREATE INDEX IF NOT EXISTS idx_student_posts_class_id ON public.student_posts(class_id);
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='point_logs' AND column_name='class_id') THEN ALTER TABLE public.point_logs ADD COLUMN class_id uuid REFERENCES public.classes(id); END IF;
    CREATE INDEX IF NOT EXISTS idx_point_logs_class_id ON public.point_logs(class_id);
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='post_comments' AND column_name='class_id') THEN ALTER TABLE public.post_comments ADD COLUMN class_id uuid REFERENCES public.classes(id); END IF;
    CREATE INDEX IF NOT EXISTS idx_post_comments_class_id ON public.post_comments(class_id);
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='post_reactions' AND column_name='class_id') THEN ALTER TABLE public.post_reactions ADD COLUMN class_id uuid REFERENCES public.classes(id); END IF;
    CREATE INDEX IF NOT EXISTS idx_post_reactions_class_id ON public.post_reactions(class_id);
END $$;

-- [3] V11 초경량 JWT 전용 정책 (Zero-is_admin, Zero-EXISTS)

-- 1~9번 (생략: 이전과 동일하나 is_admin 제거 확인)
CREATE POLICY "Honor_Roll_V11" ON public.agit_honor_roll FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)) WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid));
CREATE POLICY "Post_V11" ON public.student_posts FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)) WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid));
CREATE POLICY "Comment_V11" ON public.post_comments FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)) WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid));
CREATE POLICY "Reaction_V11" ON public.post_reactions FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)) WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid));
CREATE POLICY "Student_V11" ON public.students FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)) WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid));
CREATE POLICY "Mission_V11" ON public.writing_missions FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)) WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid));
CREATE POLICY "Classes_V11" ON public.classes FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)) WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid));
CREATE POLICY "Point_Logs_V11" ON public.point_logs FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)) WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid));
CREATE POLICY "Tower_Rankings_V11" ON public.vocab_tower_rankings FOR ALL TO authenticated USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)) WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid));

-- 10. student_records (is_admin -> JWT)
CREATE POLICY "Records_V11" ON public.student_records FOR ALL TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (teacher_id = auth.uid()))
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (teacher_id = auth.uid()));

-- 11. announcements (is_admin -> JWT)
CREATE POLICY "Announcements_Read_V11" ON public.announcements FOR SELECT TO authenticated USING (true);
CREATE POLICY "Announcements_Admin_V11" ON public.announcements FOR ALL TO authenticated 
USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN');

-- 12. profiles (is_admin -> JWT)
CREATE POLICY "Profiles_V11" ON public.profiles FOR ALL TO authenticated 
USING ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (id = auth.uid()))
WITH CHECK ((auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN') OR (id = auth.uid()));

-- 13. system_settings (is_admin -> JWT)
CREATE POLICY "Settings_V11" ON public.system_settings FOR ALL TO authenticated 
USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN');
CREATE POLICY "Settings_Read_V11" ON public.system_settings FOR SELECT TO authenticated 
USING (auth.uid() IS NOT NULL OR (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN'));

-- 14. teachers (is_admin -> JWT)
CREATE POLICY "Teachers_V11" ON public.teachers FOR ALL TO authenticated 
USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN' OR id = auth.uid())
WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN' OR id = auth.uid());

-- 15. feedback_reports (is_admin -> JWT)
CREATE POLICY "Feedback_Reports_V11" ON public.feedback_reports FOR ALL TO authenticated 
USING (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN' OR teacher_id = auth.uid())
WITH CHECK (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN' OR teacher_id = auth.uid());

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

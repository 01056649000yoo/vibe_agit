-- ============================================================================
-- 🛡️ [RLS 최적화 최종] 초경량 JWT 전용 RLS 정책 적용 (v10 - Pure JWT)
-- 작성일: 2026-03-27
-- 설명: EXISTS, JOIN, 함수 호출을 100% 제거하고 
--       오직 JWT app_metadata 기반의 직관적인 비교만 사용하여 물리적인 최저 지연시간을 구현합니다.
-- ============================================================================

-- [1] 모든 구형 정책 및 함수 호출 삭제
-- (주의: 기존 v6, v7, v8, v9 정책들을 모두 정리합니다)

-- [2] 보충 조치: 2단계에서 누락된 테이블의 class_id 보강 트리거 (안전용)
-- 이미 실행되었다면 문제가 없으나, student_posts/point_logs 등에 class_id가 없는 경우를 대비합니다.
DO $$
BEGIN
    -- student_posts 보강
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='student_posts' AND column_name='class_id') THEN
        ALTER TABLE public.student_posts ADD COLUMN class_id uuid REFERENCES public.classes(id);
        CREATE INDEX IF NOT EXISTS idx_student_posts_class_id ON public.student_posts(class_id);
    END IF;

    -- point_logs 보강
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='point_logs' AND column_name='class_id') THEN
        ALTER TABLE public.point_logs ADD COLUMN class_id uuid REFERENCES public.classes(id);
        CREATE INDEX IF NOT EXISTS idx_point_logs_class_id ON public.point_logs(class_id);
    END IF;
END $$;

-- 1. agit_honor_roll
DROP POLICY IF EXISTS "Honor_Roll_Select" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Select_v7" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Select_v8" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Select_v9" ON public.agit_honor_roll;
CREATE POLICY "Honor_Roll_Read_v10" ON public.agit_honor_roll FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);
CREATE POLICY "Honor_Roll_Insert_v10" ON public.agit_honor_roll FOR INSERT TO authenticated WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 2. student_posts
DROP POLICY IF EXISTS "Post_Select" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Insert" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_read_v6" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_read_v8" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_read_v9" ON public.student_posts;
CREATE POLICY "Post_Read_v10" ON public.student_posts FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);
CREATE POLICY "Post_Insert_v10" ON public.student_posts FOR INSERT TO authenticated WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 3. post_comments
DROP POLICY IF EXISTS "Comment_Select" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Insert" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_v7" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_v8" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_v9" ON public.post_comments;
CREATE POLICY "Comment_Read_v10" ON public.post_comments FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);
CREATE POLICY "Comment_Insert_v10" ON public.post_comments FOR INSERT TO authenticated WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 4. post_reactions
DROP POLICY IF EXISTS "Reaction_Select" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Insert" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Select_v6" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Select_v8" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Select_v9" ON public.post_reactions;
CREATE POLICY "Reaction_Read_v10" ON public.post_reactions FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);
CREATE POLICY "Reaction_Insert_v10" ON public.post_reactions FOR INSERT TO authenticated WITH CHECK (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 5. students
-- (기존의 fn_get_students_for_rls_check 호출 완전 제거)
DROP POLICY IF EXISTS "Student_Select" ON public.students;
DROP POLICY IF EXISTS "Student_Select_v6" ON public.students;
DROP POLICY IF EXISTS "Student_Select_v8" ON public.students;
DROP POLICY IF EXISTS "Student_Select_v9" ON public.students;
CREATE POLICY "Student_Read_v10" ON public.students FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 6. writing_missions
DROP POLICY IF EXISTS "Mission_Read" ON public.writing_missions;
DROP POLICY IF EXISTS "Mission_Read_v6" ON public.writing_missions;
DROP POLICY IF EXISTS "Mission_Read_v8" ON public.writing_missions;
DROP POLICY IF EXISTS "Mission_Read_v9" ON public.writing_missions;
CREATE POLICY "Mission_Read_v10" ON public.writing_missions FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 7. classes
DROP POLICY IF EXISTS "Classes_Select" ON public.classes;
DROP POLICY IF EXISTS "classes_read_v7" ON public.classes;
DROP POLICY IF EXISTS "classes_read_v8" ON public.classes;
DROP POLICY IF EXISTS "classes_read_v9" ON public.classes;
CREATE POLICY "Classes_Read_v10" ON public.classes FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 8. vocab_tower_rankings
DROP POLICY IF EXISTS "Tower_Rankings_Read" ON public.vocab_tower_rankings;
DROP POLICY IF EXISTS "Tower_Rankings_Read_v8" ON public.vocab_tower_rankings;
DROP POLICY IF EXISTS "Tower_Rankings_Read_v9" ON public.vocab_tower_rankings;
CREATE POLICY "Tower_Rankings_Read_v10" ON public.vocab_tower_rankings FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 9. point_logs
DROP POLICY IF EXISTS "Log_Select" ON public.point_logs;
DROP POLICY IF EXISTS "point_logs_read_v3" ON public.point_logs;
DROP POLICY IF EXISTS "point_logs_read_v8" ON public.point_logs;
DROP POLICY IF EXISTS "point_logs_read_v9" ON public.point_logs;
CREATE POLICY "Point_Logs_Read_v10" ON public.point_logs FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

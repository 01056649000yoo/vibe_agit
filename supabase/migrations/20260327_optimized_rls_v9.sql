-- ============================================================================
-- 🛡️ [RLS 최적화 3단계] 초경량 JWT 전용 RLS 정책 적용 (v9)
-- 작성일: 2026-03-27
-- 설명: EXISTS, JOIN, 함수 호출을 완전히 제거하고 
--       오직 JWT app_metadata 기반의 직관적인 비교만 사용하여 성능을 극대화합니다.
-- ============================================================================

-- [1] 기존 v7/v8 정책들 삭제
-- (주의: 구형 정책들이 남아있으면 OR 조건으로 작동하여 성능을 갉아먹으므로 반드시 삭제)

-- 1. agit_honor_roll
DROP POLICY IF EXISTS "Honor_Roll_Select" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Select_v7" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Select_v8" ON public.agit_honor_roll;
CREATE POLICY "Honor_Roll_Select_v9" ON public.agit_honor_roll FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 2. student_posts (2단계에서 추가한 class_id 활용)
DROP POLICY IF EXISTS "Post_Select" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_read_v6" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_read_v8" ON public.student_posts;
CREATE POLICY "student_posts_read_v9" ON public.student_posts FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 3. post_comments (2단계에서 추가한 class_id 활용)
DROP POLICY IF EXISTS "Comment_Select" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_v7" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_v8" ON public.post_comments;
CREATE POLICY "Comment_Select_v9" ON public.post_comments FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 4. post_reactions (2단계에서 추가한 class_id 활용)
DROP POLICY IF EXISTS "Reaction_Select" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Select_v6" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Select_v8" ON public.post_reactions;
CREATE POLICY "Reaction_Select_v9" ON public.post_reactions FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 5. students
DROP POLICY IF EXISTS "Student_Select" ON public.students;
DROP POLICY IF EXISTS "Student_Select_v6" ON public.students;
DROP POLICY IF EXISTS "Student_Select_v8" ON public.students;
CREATE POLICY "Student_Select_v9" ON public.students FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (id = (auth.jwt() -> 'app_metadata' ->> 'student_id')::uuid) -- 본인
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid) -- 같은 반 친구
);

-- 6. writing_missions
DROP POLICY IF EXISTS "Mission_Read" ON public.writing_missions;
DROP POLICY IF EXISTS "Mission_Read_v6" ON public.writing_missions;
DROP POLICY IF EXISTS "Mission_Read_v8" ON public.writing_missions;
CREATE POLICY "Mission_Read_v9" ON public.writing_missions FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 7. classes
DROP POLICY IF EXISTS "Classes_Select" ON public.classes;
DROP POLICY IF EXISTS "classes_read_v7" ON public.classes;
DROP POLICY IF EXISTS "classes_read_v8" ON public.classes;
CREATE POLICY "classes_read_v9" ON public.classes FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 8. point_logs
DROP POLICY IF EXISTS "Log_Select" ON public.point_logs;
DROP POLICY IF EXISTS "point_logs_read_v3" ON public.point_logs;
DROP POLICY IF EXISTS "point_logs_read_v8" ON public.point_logs;
CREATE POLICY "point_logs_read_v9" ON public.point_logs FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (student_id = (auth.jwt() -> 'app_metadata' ->> 'student_id')::uuid) -- 본인 로그
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid) -- 같은 반(교사용)
);

-- 9. vocab_tower_rankings
DROP POLICY IF EXISTS "Tower_Rankings_Read" ON public.vocab_tower_rankings;
DROP POLICY IF EXISTS "Tower_Rankings_Read_v8" ON public.vocab_tower_rankings;
CREATE POLICY "Tower_Rankings_Read_v9" ON public.vocab_tower_rankings FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- [2] 보조 테이블 인덱스 강화
-- RLS에서 class_id를 직접 비교하므로 모든 테이블의 class_id에 인덱스 보장
CREATE INDEX IF NOT EXISTS idx_point_logs_class_id ON public.point_logs(class_id);

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

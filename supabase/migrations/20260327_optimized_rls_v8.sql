-- ============================================================================
-- 🛡️ [RLS 최적화 3단계] 고성능 JWT Claims 기반 RLS 정책 전면 적용 (v8)
-- 작성일: 2026-03-27
-- 설명: 1단계(JWT Hook)와 2단계(class_id 보강)를 활용하여 
--       모든 SELECT 정책에서 무거운 Join과 함수 호출을 제거합니다.
-- ============================================================================

-- [1] 기존의 무거운 정책들 삭제
-- (주의: 이전에 사용하던 정책 명칭을 정확히 타겟팅합니다)

-- 1. agit_honor_roll
DROP POLICY IF EXISTS "Honor_Roll_Select_v7" ON public.agit_honor_roll;
CREATE POLICY "Honor_Roll_Select_v8" ON public.agit_honor_roll FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- 2. student_posts
DROP POLICY IF EXISTS "student_posts_read_v6" ON public.student_posts;
CREATE POLICY "student_posts_read_v8" ON public.student_posts FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        WHERE m.id = mission_id 
        AND (
            m.class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid -- 학생: 본인 반 글만
            OR m.teacher_id = auth.uid() -- 교사: 본인 관리 글만
            OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = m.class_id AND c.teacher_id = auth.uid()) -- 교사: 담당 반 글만
        )
    )
);

-- 3. post_comments (2단계에서 추가한 class_id 활용)
DROP POLICY IF EXISTS "Comment_Select_v7" ON public.post_comments;
CREATE POLICY "Comment_Select_v8" ON public.post_comments FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid) -- 학생: 같은 반 댓글만
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid()) -- 교사: 담당 반 댓글만
);

-- 4. post_reactions (2단계에서 추가한 class_id 활용)
DROP POLICY IF EXISTS "Reaction_Select_v6" ON public.post_reactions;
CREATE POLICY "Reaction_Select_v8" ON public.post_reactions FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- 5. students
DROP POLICY IF EXISTS "Student_Select_v6" ON public.students;
CREATE POLICY "Student_Select_v8" ON public.students FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (auth_id = auth.uid()) -- 본인 정보
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid) -- 학생: 같은 반 친구 정보
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid()) -- 교사: 담당 반 학생 정보
);

-- 6. writing_missions
DROP POLICY IF EXISTS "Mission_Read_v6" ON public.writing_missions;
CREATE POLICY "Mission_Read_v8" ON public.writing_missions FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (teacher_id = auth.uid())
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- 7. classes
DROP POLICY IF EXISTS "classes_read_v7" ON public.classes;
CREATE POLICY "classes_read_v8" ON public.classes FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (teacher_id = auth.uid())
    OR (id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
);

-- 8. point_logs
DROP POLICY IF EXISTS "point_logs_read_v3" ON public.point_logs;
CREATE POLICY "point_logs_read_v8" ON public.point_logs FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (student_id = (auth.jwt() -> 'app_metadata' ->> 'student_id')::uuid) -- 본인 로그
    OR EXISTS ( -- 교사: 본인 담당 학생의 로그만
        SELECT 1 FROM public.students s
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = student_id AND c.teacher_id = auth.uid()
    )
);

-- 9. vocab_tower_rankings
DROP POLICY IF EXISTS "Tower_Rankings_Read" ON public.vocab_tower_rankings;
CREATE POLICY "Tower_Rankings_Read_v8" ON public.vocab_tower_rankings FOR SELECT TO authenticated USING (
    (auth.jwt() -> 'app_metadata' ->> 'role' = 'ADMIN')
    OR (class_id = (auth.jwt() -> 'app_metadata' ->> 'class_id')::uuid)
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- [2] INSERT/UPDATE/DELETE 정책 간소화 (필요한 경우만 수정)
-- 성능에 미치는 영향은 SELECT가 가장 크므로, 우선 SELECT 정책 위주로 최적화했습니다.

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 🛡️ [RLS 복구 및 최적화] V13: 교사 접근 권한 복구 및 STABLE 헬퍼 고도화
-- 작성일: 2026-03-27
-- 설명: V11~V12에서 너무 엄격하게 제한되었던 교사의 학생 데이터 접근 권한을 복구합니다.
--       교사는 자신이 담당하는 반(classes.teacher_id = auth.uid())의 모든 데이터를
--       조회 및 관리할 수 있도록 정책을 수정합니다.
-- ============================================================================

-- [1] 교사 반 관리 여부 확인 헬퍼 함수 추가 (STABLE)
CREATE OR REPLACE FUNCTION public.auth_user_is_teacher_of(p_class_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.classes 
    WHERE id = p_class_id AND teacher_id = auth.uid()
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION public.auth_user_is_teacher_of(uuid) TO authenticated;

-- [2] 기존 V12 정책 삭제 및 V13 정책 적용
-- 대상 테이블 목록: student_posts, students, post_comments, post_reactions, 
--                 agit_honor_roll, writing_missions, point_logs, vocab_tower_rankings

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND policyname LIKE '%_V11' OR policyname LIKE '%_V12'
          AND tablename IN (
              'student_posts', 'students', 'post_comments', 'post_reactions', 
              'agit_honor_roll', 'writing_missions', 'point_logs', 'vocab_tower_rankings', 'classes'
          )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- [3] V13: 교사 권한 포함 초경량 정책 생성

-- 1. student_posts (게시글)
DROP POLICY IF EXISTS "Post_V12" ON public.student_posts;
CREATE POLICY "Post_V13" ON public.student_posts FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_role() = 'TEACHER' AND public.auth_user_is_teacher_of(class_id))
);

-- 2. students (학생 정보)
DROP POLICY IF EXISTS "Student_V12" ON public.students;
CREATE POLICY "Student_V13" ON public.students FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_role() = 'TEACHER' AND public.auth_user_is_teacher_of(class_id))
);

-- 3. post_comments (댓글)
DROP POLICY IF EXISTS "Comment_V12" ON public.post_comments;
CREATE POLICY "Comment_V13" ON public.post_comments FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_role() = 'TEACHER' AND public.auth_user_is_teacher_of(class_id))
);

-- 4. post_reactions (반응)
DROP POLICY IF EXISTS "Reaction_V12" ON public.post_reactions;
CREATE POLICY "Reaction_V13" ON public.post_reactions FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_role() = 'TEACHER' AND public.auth_user_is_teacher_of(class_id))
);

-- 5. writing_missions (미션)
DROP POLICY IF EXISTS "Mission_V12" ON public.writing_missions;
CREATE POLICY "Mission_V13" ON public.writing_missions FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (teacher_id = auth.uid())
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_role() = 'TEACHER' AND public.auth_user_is_teacher_of(class_id))
);

-- 6. agit_honor_roll (명예의 전당)
DROP POLICY IF EXISTS "Honor_Roll_V12" ON public.agit_honor_roll;
CREATE POLICY "Honor_Roll_V13" ON public.agit_honor_roll FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_role() = 'TEACHER' AND public.auth_user_is_teacher_of(class_id))
);

-- 7. point_logs (포인트 로그)
DROP POLICY IF EXISTS "Point_Logs_V11" ON public.point_logs;
CREATE POLICY "Point_Logs_V13" ON public.point_logs FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_role() = 'TEACHER' AND public.auth_user_is_teacher_of(class_id))
);

-- 8. vocab_tower_rankings (어휘의 탑 랭킹)
DROP POLICY IF EXISTS "Tower_Rankings_V12" ON public.vocab_tower_rankings;
CREATE POLICY "Tower_Rankings_V13" ON public.vocab_tower_rankings FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_role() = 'TEACHER' AND public.auth_user_is_teacher_of(class_id))
);

-- 9. classes (학급)
DROP POLICY IF EXISTS "Classes_V12" ON public.classes;
CREATE POLICY "Classes_V13" ON public.classes FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (teacher_id = auth.uid())
    OR (id = public.auth_user_class_id())
);

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

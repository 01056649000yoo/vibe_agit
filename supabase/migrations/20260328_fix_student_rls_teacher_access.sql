-- ──────────────────────────────────────────────────────────────────
-- [마이그레이션] V14: 교사 데이터 접근 권한 보강 (JWT 의존성 제거)
-- 작성일: 2026-03-28
-- 설명: V13 정책이 JWT app_metadata의 role에 의존하여, 역할 정보가 누락된 교사의 접근이
--       제한되는 문제를 해결합니다. auth_user_is_teacher_of() 함수를 직접 활용하여
--       담당 학급 데이터에 대한 강력한 접근 권한을 보장합니다.
-- ──────────────────────────────────────────────────────────────────

-- [1] V13 정책 삭제 후 V14 적용
DO $$ 
DECLARE 
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tablename, policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
          AND policyname LIKE '%_V13'
          AND tablename IN (
              'student_posts', 'students', 'post_comments', 'post_reactions', 
              'agit_honor_roll', 'writing_missions', 'point_logs', 'vocab_tower_rankings', 'classes'
          )
    ) LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
    END LOOP;
END $$;

-- [2] V14: 교사 학급 담당 여부 기반 강력 권한 부여

-- 1. students (학생 정보 - 핵심 해결과제)
CREATE POLICY "Student_V14" ON public.students FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_is_teacher_of(class_id)) -- JWT role 체크 제거하여 안정성 확보
);

-- 2. student_posts (게시글)
CREATE POLICY "Post_V14" ON public.student_posts FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_is_teacher_of(class_id))
);

-- 3. post_comments (댓글)
CREATE POLICY "Comment_V14" ON public.post_comments FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_is_teacher_of(class_id))
);

-- 4. post_reactions (반응)
CREATE POLICY "Reaction_V14" ON public.post_reactions FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_is_teacher_of(class_id))
);

-- 5. writing_missions (미션)
CREATE POLICY "Mission_V14" ON public.writing_missions FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (teacher_id = auth.uid())
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_is_teacher_of(class_id))
);

-- 6. agit_honor_roll (명예의 전당)
CREATE POLICY "Honor_Roll_V14" ON public.agit_honor_roll FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_is_teacher_of(class_id))
);

-- 7. point_logs (포인트 로그)
CREATE POLICY "Point_Logs_V14" ON public.point_logs FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_is_teacher_of(class_id))
);

-- 8. vocab_tower_rankings (어휘의 탑 랭킹)
CREATE POLICY "Tower_Rankings_V14" ON public.vocab_tower_rankings FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (class_id = public.auth_user_class_id())
    OR (public.auth_user_is_teacher_of(class_id))
);

-- 9. classes (학급)
CREATE POLICY "Classes_V14" ON public.classes FOR ALL TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (teacher_id = auth.uid())
    OR (id = public.auth_user_class_id())
);

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

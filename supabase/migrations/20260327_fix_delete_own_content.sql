-- ====================================================================
-- 🛡️ [보안 강화 V17] 게시물/댓글/반응 삭제 권한 분리 및 성능 최적화
-- 작성일: 2026-03-27
--
-- 변경 사항:
--   1. ALL 정책을 폐기하고 SELECT/INSERT/UPDATE/DELETE로 명확히 분리
--   2. DELETE 권한을 '본인' 또는 '담당 교사'로 제한
--   3. EXISTS 서브쿼리를 제거하고 auth_user_class_id() 헬퍼 함수를 사용하여 성능 최적화
-- ====================================================================

-- 1. post_comments (댓글) 정책 재구성
DROP POLICY IF EXISTS "Comment_V12" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_V17" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Insert_V17" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Update_V17" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Delete_V17" ON public.post_comments;

CREATE POLICY "Comment_Select_V17" ON public.post_comments
FOR SELECT USING (
  -- 같은 반 학생들의 댓글은 볼 수 있음 (V12 로직 계승)
  class_id = public.auth_user_class_id()
  OR student_id = (SELECT id FROM public.students WHERE auth_id = auth.uid() LIMIT 1)
  OR teacher_id = auth.uid()
);

CREATE POLICY "Comment_Insert_V17" ON public.post_comments
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "Comment_Update_V17" ON public.post_comments
FOR UPDATE USING (
  -- 본인(학생/교사) 또는 관리자만 수정 가능
  student_id = (SELECT id FROM public.students WHERE auth_id = auth.uid() LIMIT 1)
  OR teacher_id = auth.uid()
  OR public.auth_user_role() = 'ADMIN'
);

CREATE POLICY "Comment_Delete_V17" ON public.post_comments
FOR DELETE USING (
  -- 본인(학생/교사) 또는 해당 반 교사 또는 관리자만 삭제 가능
  student_id = (SELECT id FROM public.students WHERE auth_id = auth.uid() LIMIT 1)
  OR teacher_id = auth.uid()
  OR (public.auth_user_role() = 'TEACHER' AND class_id = public.auth_user_class_id())
  OR public.auth_user_role() = 'ADMIN'
);


-- 2. post_reactions (반응) 정책 재구성
DROP POLICY IF EXISTS "Reaction_V12" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Select_V17" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Insert_V17" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Update_V17" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Delete_V17" ON public.post_reactions;

CREATE POLICY "Reaction_Select_V17" ON public.post_reactions
FOR SELECT USING (true);

CREATE POLICY "Reaction_Insert_V17" ON public.post_reactions
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "Reaction_Update_V17" ON public.post_reactions
FOR UPDATE USING (
  student_id = (SELECT id FROM public.students WHERE auth_id = auth.uid() LIMIT 1)
  OR public.auth_user_role() = 'ADMIN'
);

CREATE POLICY "Reaction_Delete_V17" ON public.post_reactions
FOR DELETE USING (
  student_id = (SELECT id FROM public.students WHERE auth_id = auth.uid() LIMIT 1)
  OR public.auth_user_role() = 'ADMIN'
);


-- 3. student_posts (글) 정책 재구성
DROP POLICY IF EXISTS "Post_V12" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Select_V17" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Insert_V17" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Update_V17" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Delete_V17" ON public.student_posts;

CREATE POLICY "Post_Select_V17" ON public.student_posts
FOR SELECT USING (
  class_id = public.auth_user_class_id()
  OR student_id = (SELECT id FROM public.students WHERE auth_id = auth.uid() LIMIT 1)
);

CREATE POLICY "Post_Insert_V17" ON public.student_posts
FOR INSERT WITH CHECK (
  auth.uid() IS NOT NULL
);

CREATE POLICY "Post_Update_V17" ON public.student_posts
FOR UPDATE USING (
  student_id = (SELECT id FROM public.students WHERE auth_id = auth.uid() LIMIT 1)
  OR public.auth_user_role() = 'ADMIN'
);

CREATE POLICY "Post_Delete_V17" ON public.student_posts
FOR DELETE USING (
  -- 본인 또는 해당 반 교사 또는 관리자만 삭제 가능
  student_id = (SELECT id FROM public.students WHERE auth_id = auth.uid() LIMIT 1)
  OR (public.auth_user_role() = 'TEACHER' AND class_id = public.auth_user_class_id())
  OR public.auth_user_role() = 'ADMIN'
);


-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

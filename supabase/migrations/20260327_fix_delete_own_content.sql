-- ============================================================================
-- 🛡️ [보안 강화] V17: 게시물/댓글/반응 삭제 권한 본인 한정 (Granular RLS)
-- 작성일: 2026-03-27
-- 설명: 같은 반 학생이 서로의 글/댓글/반응을 삭제할 수 없도록 ALL 정책을 분리합니다.
--       DELETE 및 UPDATE 권한을 본인 또는 ADMIN/교사(관리용)로 제한합니다.
-- ============================================================================

-- [1] STABLE 헬퍼 함수 추가: JWT에서 student_id 추출
-- 쿼리 성능을 위해 매 행마다 서브쿼리를 실행하는 대신 JWT 메타데이터를 활용합니다.
CREATE OR REPLACE FUNCTION public.auth_student_id()
RETURNS uuid AS $$
  SELECT (NULLIF(auth.jwt() -> 'app_metadata' ->> 'student_id', ''))::uuid;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.auth_student_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_student_id() TO service_role;

-- [2] 기존 V12 ALL 정책 삭제
DROP POLICY IF EXISTS "Comment_V12" ON public.post_comments;
DROP POLICY IF EXISTS "Reaction_V12" ON public.post_reactions;
DROP POLICY IF EXISTS "Post_V12" ON public.student_posts;

-- [3] post_comments 테이블 정책 세분화
-- 조회: 관리자 또는 같은 반 학생/교사
CREATE POLICY "Comment_Select_V17" ON public.post_comments FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 삽입: 관리자 또는 같은 반 학생/교사
CREATE POLICY "Comment_Insert_V17" ON public.post_comments FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 수정: 관리자 또는 작성자 본인 (학생/교사)
CREATE POLICY "Comment_Update_V17" ON public.post_comments FOR UPDATE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (student_id = public.auth_student_id()) 
    OR (teacher_id = auth.uid())
)
WITH CHECK (
    (public.auth_user_role() = 'ADMIN') 
    OR (student_id = public.auth_student_id()) 
    OR (teacher_id = auth.uid())
);

-- 삭제: 관리자, 작성자 본인, 또는 해당 학급의 담당 교사(관리용)
CREATE POLICY "Comment_Delete_V17" ON public.post_comments FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (student_id = public.auth_student_id()) 
    OR (teacher_id = auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        LEFT JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_comments.post_id 
          AND (c.teacher_id = auth.uid() OR m.teacher_id = auth.uid())
    )
);

-- [4] post_reactions 테이블 정책 세분화
-- 조회 및 삽입
CREATE POLICY "Reaction_Select_V17" ON public.post_reactions FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Reaction_Insert_V17" ON public.post_reactions FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 수정 및 삭제: 관리자 또는 본인
CREATE POLICY "Reaction_Update_V17" ON public.post_reactions FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()));

CREATE POLICY "Reaction_Delete_V17" ON public.post_reactions FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (student_id = public.auth_student_id())
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        LEFT JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_reactions.post_id 
          AND (c.teacher_id = auth.uid() OR m.teacher_id = auth.uid())
    )
);

-- [5] student_posts 테이블 정책 세분화
-- 조회 및 삽입
CREATE POLICY "Post_Select_V17" ON public.student_posts FOR SELECT TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

CREATE POLICY "Post_Insert_V17" ON public.student_posts FOR INSERT TO authenticated 
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (class_id = public.auth_user_class_id()));

-- 수정: 관리자 또는 본인
CREATE POLICY "Post_Update_V17" ON public.student_posts FOR UPDATE TO authenticated 
USING ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()))
WITH CHECK ((public.auth_user_role() = 'ADMIN') OR (student_id = public.auth_student_id()));

-- 삭제: 관리자, 작성자 본인, 또는 담당 교사
CREATE POLICY "Post_Delete_V17" ON public.student_posts FOR DELETE TO authenticated 
USING (
    (public.auth_user_role() = 'ADMIN') 
    OR (student_id = public.auth_student_id())
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = student_posts.mission_id 
          AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

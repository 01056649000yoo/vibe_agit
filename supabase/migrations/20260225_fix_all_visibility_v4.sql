-- ============================================================================
-- 🚀 [최고 수준 안정화] 학생 데이터 및 연관 데이터 가시성 확보 패치 (v4)
-- 작성일: 2026-02-23 (보안 권한 회복)
-- ============================================================================

-- 1. [핵심] RLS 우회용 SECURITY DEFINER 함수 집합 생성
-- 이렇게 함수로 분리하면 RLS 간 서로 맞물려(재귀적 평가) 데이터가 빈 배열로 반환되는
-- 고질적인 Supabase/PostgreSQL 가시성 버그를 100% 방지할 수 있습니다.

CREATE OR REPLACE FUNCTION public.check_is_my_student_id(target_student_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.students 
        WHERE id = target_student_id AND auth_id = auth.uid() AND deleted_at IS NULL
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

CREATE OR REPLACE FUNCTION public.check_is_peer_of_student(target_student_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    my_class_id UUID;
    peer_class_id UUID;
BEGIN
    SELECT class_id INTO my_class_id FROM public.students WHERE auth_id = auth.uid() AND deleted_at IS NULL LIMIT 1;
    IF my_class_id IS NULL THEN RETURN FALSE; END IF;
    
    SELECT class_id INTO peer_class_id FROM public.students WHERE id = target_student_id AND deleted_at IS NULL;
    RETURN my_class_id = peer_class_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

CREATE OR REPLACE FUNCTION public.get_my_class_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT class_id FROM public.students 
        WHERE auth_id = auth.uid() AND deleted_at IS NULL 
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

-- 2. 학생(Students) 테이블 권한 복구
DROP POLICY IF EXISTS "Student_Select" ON public.students;
DROP POLICY IF EXISTS "Student_Select_v2" ON public.students;
DROP POLICY IF EXISTS "Student_Select_v3" ON public.students;

CREATE POLICY "Student_Select_v4" ON public.students FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid())
    OR (deleted_at IS NULL AND class_id = public.get_my_class_id())
);

-- 3. 학생 게시글(Student_Posts) 테이블 권한 복구 (내 글쓰기 통계, 아지트 글 목록)
DROP POLICY IF EXISTS "Post_Select" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Insert" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Update" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Delete" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_all_v2" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_class_read_v2" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_final_v1" ON public.student_posts;

-- 쓰기, 수정, 삭제: 본인, 교사, 관리자
CREATE POLICY "student_posts_modify_v4" ON public.student_posts
FOR ALL USING (
    public.is_admin()
    OR public.check_is_my_student_id(student_id)
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

-- 읽기: 본인, 같은 반(우리반) 친구들, 교사, 관리자
CREATE POLICY "student_posts_read_v4" ON public.student_posts
FOR SELECT USING (
    public.is_admin()
    OR public.check_is_my_student_id(student_id)
    OR public.check_is_peer_of_student(student_id)
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

-- 4. 글쓰기 미션(Writing_Missions) 테이블 권한 복구
DROP POLICY IF EXISTS "Mission_Read" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_final_v1" ON public.writing_missions;

CREATE POLICY "Mission_Read_v4" ON public.writing_missions FOR SELECT USING (
    public.is_admin() 
    OR teacher_id = auth.uid() 
    OR class_id = public.get_my_class_id()
);

CREATE POLICY "Mission_Manage_v4" ON public.writing_missions FOR ALL USING (
    public.is_admin() 
    OR teacher_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- 5. 댓글 및 반응 (Post_Comments, Post_Reactions) 테이블 가시성 확보
-- (댓글)
DROP POLICY IF EXISTS "Comment_Select" ON public.post_comments;
CREATE POLICY "Comment_Select_v4" ON public.post_comments FOR SELECT USING (
    public.is_admin()
    OR public.check_is_my_student_id(student_id)
    OR public.check_is_peer_of_student(student_id)
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

-- (반응)
DROP POLICY IF EXISTS "Reaction_Select" ON public.post_reactions;
CREATE POLICY "Reaction_Select_v4" ON public.post_reactions FOR SELECT USING (
    public.is_admin()
    OR public.check_is_my_student_id(student_id)
    OR public.check_is_peer_of_student(student_id)
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

-- 변경 사항 적용 및 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

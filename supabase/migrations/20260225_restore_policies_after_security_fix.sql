-- ============================================================================
-- 🛠️ [긴급 복구] 보안 강화 작업 중 중단된 RLS 정책 재적용
-- 원인: DROP VIEW ... CASCADE 명령이 해당 뷰를 참조하는 모든 RLS 정책을 삭제함
-- 해결: 삭제된 모든 정책을 보안 강화된 신규 뷰(vw_students_rls_bypass) 기반으로 복구
-- ============================================================================

-- 1. 보안 함수 실행 권한 부여 (뷰가 함수를 호출하므로 명시적 권한 필요)
GRANT EXECUTE ON FUNCTION public.fn_get_students_for_rls_check() TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_get_students_for_rls_check() TO service_role;


-- 2. [Classes] 학급 조회 정책 복구
DROP POLICY IF EXISTS "classes_read_v6" ON public.classes;
CREATE POLICY "classes_read_v6" ON public.classes FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR id IN (
        SELECT class_id FROM public.vw_students_rls_bypass 
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);


-- 3. [Writing_Missions] 글쓰기 미션 조회 정책 복구 (이게 없어서 학생들 미션이 안 보임)
DROP POLICY IF EXISTS "Mission_Read_v5" ON public.writing_missions;
CREATE POLICY "Mission_Read_v5" ON public.writing_missions FOR SELECT USING (
    public.is_admin() 
    OR teacher_id = auth.uid() 
    OR class_id IN (SELECT class_id FROM public.vw_students_rls_bypass WHERE auth_id = auth.uid() AND deleted_at IS NULL)
);


-- 4. [Students] 학생 테이블 조회 정책 복구 (친구 아지트 구경용)
DROP POLICY IF EXISTS "Student_Select_v5" ON public.students;
CREATE POLICY "Student_Select_v5" ON public.students FOR SELECT USING (
    public.is_admin()
    OR auth_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid())
    OR class_id IN (SELECT class_id FROM public.vw_students_rls_bypass WHERE auth_id = auth.uid() AND deleted_at IS NULL)
);


-- 5. [Student_Posts] 학생 게시글 조회 및 수정 정책 복구
DROP POLICY IF EXISTS "student_posts_read_v5" ON public.student_posts;
CREATE POLICY "student_posts_read_v5" ON public.student_posts FOR SELECT USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.vw_students_rls_bypass 
        WHERE class_id IN (SELECT class_id FROM public.vw_students_rls_bypass WHERE auth_id = auth.uid() AND deleted_at IS NULL)
    )
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

DROP POLICY IF EXISTS "student_posts_modify_v5" ON public.student_posts;
CREATE POLICY "student_posts_modify_v5" ON public.student_posts FOR ALL USING (
    public.is_admin()
    OR student_id IN (SELECT id FROM public.vw_students_rls_bypass WHERE auth_id = auth.uid() AND deleted_at IS NULL)
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);


-- 6. [Comments/Reactions] 댓글 및 반응 정책 복구
DROP POLICY IF EXISTS "Comment_Select_v5" ON public.post_comments;
CREATE POLICY "Comment_Select_v5" ON public.post_comments FOR SELECT USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.vw_students_rls_bypass 
        WHERE class_id IN (SELECT class_id FROM public.vw_students_rls_bypass WHERE auth_id = auth.uid() AND deleted_at IS NULL)
    )
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "Reaction_Select_v5" ON public.post_reactions;
CREATE POLICY "Reaction_Select_v5" ON public.post_reactions FOR SELECT USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.vw_students_rls_bypass 
        WHERE class_id IN (SELECT class_id FROM public.vw_students_rls_bypass WHERE auth_id = auth.uid() AND deleted_at IS NULL)
    )
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);


-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

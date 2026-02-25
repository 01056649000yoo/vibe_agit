-- ============================================================
-- 🚑 [긴급 복구] 학생 데이터 가시성 완전 복구
-- 작성일: 2026-02-25
--
-- 원인: vw_students_rls_bypass 뷰 제거 후 기존 RLS 정책들이 무효화됨
-- 해결: fn_get_students_for_rls_check() 함수 직접 호출로 전환
-- ============================================================

-- GRANT 확인 (함수 실행 권한)
GRANT EXECUTE ON FUNCTION public.fn_get_students_for_rls_check() TO authenticated, anon;

-- ── [Classes] 학급 조회 ──────────────────────────────────────
DROP POLICY IF EXISTS "classes_read_v6" ON public.classes;
DROP POLICY IF EXISTS "classes_read_v7" ON public.classes;
CREATE POLICY "classes_read_v7" ON public.classes FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- ── [Writing_Missions] 글쓰기 미션 조회 ─────────────────────
DROP POLICY IF EXISTS "Mission_Read_v5" ON public.writing_missions;
DROP POLICY IF EXISTS "Mission_Read_v6" ON public.writing_missions;
CREATE POLICY "Mission_Read_v6" ON public.writing_missions FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR class_id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- ── [Students] 학생 목록 조회 ────────────────────────────────
DROP POLICY IF EXISTS "Student_Select_v5" ON public.students;
DROP POLICY IF EXISTS "Student_Select_v6" ON public.students;
CREATE POLICY "Student_Select_v6" ON public.students FOR SELECT USING (
    public.is_admin()
    OR auth_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid())
    OR class_id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);

-- ── [Student_Posts] 게시글 읽기 ─────────────────────────────
DROP POLICY IF EXISTS "student_posts_read_v5" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_read_v6" ON public.student_posts;
CREATE POLICY "student_posts_read_v6" ON public.student_posts FOR SELECT USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE class_id IN (
            SELECT class_id FROM public.fn_get_students_for_rls_check()
            WHERE auth_id = auth.uid() AND deleted_at IS NULL
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

-- ── [Student_Posts] 게시글 수정/삭제 ────────────────────────
DROP POLICY IF EXISTS "student_posts_modify_v5" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_modify_v6" ON public.student_posts;
CREATE POLICY "student_posts_modify_v6" ON public.student_posts FOR ALL USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

-- ── [Comments] 댓글 읽기 ─────────────────────────────────────
DROP POLICY IF EXISTS "Comment_Select_v5" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_v6" ON public.post_comments;
CREATE POLICY "Comment_Select_v6" ON public.post_comments FOR SELECT USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE class_id IN (
            SELECT class_id FROM public.fn_get_students_for_rls_check()
            WHERE auth_id = auth.uid() AND deleted_at IS NULL
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

-- ── [Reactions] 반응 읽기 ─────────────────────────────────────
DROP POLICY IF EXISTS "Reaction_Select_v5" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Select_v6" ON public.post_reactions;
CREATE POLICY "Reaction_Select_v6" ON public.post_reactions FOR SELECT USING (
    public.is_admin()
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE class_id IN (
            SELECT class_id FROM public.fn_get_students_for_rls_check()
            WHERE auth_id = auth.uid() AND deleted_at IS NULL
        )
    )
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

NOTIFY pgrst, 'reload schema';

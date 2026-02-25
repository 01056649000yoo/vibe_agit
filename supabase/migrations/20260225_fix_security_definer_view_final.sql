-- ============================================================================
-- 🛡️ [보안 린터 해결] SECURITY DEFINER View 경고 완전 해소
-- 작성일: 2026-02-25
--
-- 문제:
--   vw_students_rls_bypass 뷰가 SECURITY DEFINER 함수를 감싸므로
--   Supabase 보안 린터(0010_security_definer_view) 경고 발생
--
-- 해결:
--   모든 RLS 정책에서 뷰(vw_students_rls_bypass) 참조를
--   함수(fn_get_students_for_rls_check()) 직접 호출로 교체
--   → 뷰 없이도 RLS 무한 루프 방지 가능
--   → 뷰 자체를 제거하여 경고 해소
-- ============================================================================


-- ──────────────────────────────────────────────────────────────────
-- [Classes] 학급 조회 정책
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "classes_read_v6" ON public.classes;
CREATE POLICY "classes_read_v7" ON public.classes FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);


-- ──────────────────────────────────────────────────────────────────
-- [Writing_Missions] 글쓰기 미션 조회 정책
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Mission_Read_v5" ON public.writing_missions;
CREATE POLICY "Mission_Read_v6" ON public.writing_missions FOR SELECT USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR class_id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);


-- ──────────────────────────────────────────────────────────────────
-- [Students] 학생 테이블 조회 정책
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Student_Select_v5" ON public.students;
CREATE POLICY "Student_Select_v6" ON public.students FOR SELECT USING (
    public.is_admin()
    OR auth_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid())
    OR class_id IN (
        SELECT class_id FROM public.fn_get_students_for_rls_check()
        WHERE auth_id = auth.uid() AND deleted_at IS NULL
    )
);


-- ──────────────────────────────────────────────────────────────────
-- [Student_Posts] 학생 게시글 조회 및 수정 정책
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "student_posts_read_v5" ON public.student_posts;
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

DROP POLICY IF EXISTS "student_posts_modify_v5" ON public.student_posts;
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


-- ──────────────────────────────────────────────────────────────────
-- [Comments/Reactions] 댓글 및 반응 정책
-- ──────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "Comment_Select_v5" ON public.post_comments;
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

DROP POLICY IF EXISTS "Reaction_Select_v5" ON public.post_reactions;
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


-- ──────────────────────────────────────────────────────────────────
-- 뷰 제거 (모든 RLS 정책이 함수를 직접 참조하므로 뷰 불필요)
-- 경고: 다른 정책/뷰가 이 뷰를 참조하지 않는지 확인 후 실행
-- ──────────────────────────────────────────────────────────────────
DROP VIEW IF EXISTS public.vw_students_rls_bypass;


-- ──────────────────────────────────────────────────────────────────
-- 스키마 캐시 갱신
-- ──────────────────────────────────────────────────────────────────
NOTIFY pgrst, 'reload schema';


-- ====================================================================
-- ✅ 검증 방법
--
-- 1. Supabase 린터에서 SECURITY DEFINER view 경고 사라짐 확인
-- 2. 교사 계정 → 학급 정상 조회 확인
-- 3. 학생 계정 → 미션 목록 정상 조회 확인
-- 4. 학생 계정 → 친구 게시글/댓글/반응 정상 조회 확인
-- ====================================================================

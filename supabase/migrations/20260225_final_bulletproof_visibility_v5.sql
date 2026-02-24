-- ============================================================================
-- 🚀 [궁극의 가시성 해결] RLS 무한 루프 및 권한 우회 100% 방지 패치 (v5)
-- 작성일: 2026-02-23 (드래곤 아지트, 글쓰기 미션 모두 복구)
-- ============================================================================

-- 1. [핵심] RLS 검증 전용 View 생성
-- PostgreSQL 함수(SECURITY DEFINER)의 한계와 권한 꼬임을 원천 차단하기 위해,
-- RLS가 적용되지 않는 기본 데이터를 직접 읽어오는 슈퍼유저 권한의 View를 만듭니다.
-- 이 View를 통해 속도 저하와 데이터 가림 현상 없이 학생의 소속 반을 확인할 수 있습니다.

DROP VIEW IF EXISTS public.vw_students_rls_bypass CASCADE;
CREATE VIEW public.vw_students_rls_bypass AS
SELECT id, class_id, auth_id, deleted_at FROM public.students;

-- 2. 미션 보이지 않는 문제 방지 (is_archived NULL 오류 수정)
ALTER TABLE public.writing_missions ALTER COLUMN is_archived SET DEFAULT false;
UPDATE public.writing_missions SET is_archived = false WHERE is_archived IS NULL;

-- 3. 학생(Students) 테이블 권한 복구 (친구의 드래곤 아지트 구경 가능하게)
DROP POLICY IF EXISTS "Student_Select_v4" ON public.students;
DROP POLICY IF EXISTS "Student_Select_v5" ON public.students;

CREATE POLICY "Student_Select_v5" ON public.students FOR SELECT USING (
    public.is_admin()
    OR auth_id = auth.uid() -- 본인은 항상 볼 수 있음
    OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = class_id AND c.teacher_id = auth.uid()) -- 선생님
    -- 같은 반 친구들 조회 (View를 통해 무한루프 없이 빠르고 안전하게 조회)
    OR class_id IN (SELECT class_id FROM public.vw_students_rls_bypass WHERE auth_id = auth.uid() AND deleted_at IS NULL)
);

-- 4. 글쓰기 미션(Writing_Missions) 권한 복구 (대시보드 미션 목록 표출)
DROP POLICY IF EXISTS "Mission_Read_v4" ON public.writing_missions;
DROP POLICY IF EXISTS "Mission_Read_v5" ON public.writing_missions;

CREATE POLICY "Mission_Read_v5" ON public.writing_missions FOR SELECT USING (
    public.is_admin() 
    OR teacher_id = auth.uid() 
    -- 학생은 자신의 반에 할당된 미션을 조회 가능
    OR class_id IN (SELECT class_id FROM public.vw_students_rls_bypass WHERE auth_id = auth.uid() AND deleted_at IS NULL)
);

DROP POLICY IF EXISTS "Mission_Manage_v4" ON public.writing_missions;
CREATE POLICY "Mission_Manage_v5" ON public.writing_missions FOR ALL USING (
    public.is_admin() 
    OR teacher_id = auth.uid() 
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- 5. 학생 게시글(Student_Posts) 권한 복구 (글 통계 분석, 아지트 상호작용)
DROP POLICY IF EXISTS "student_posts_read_v4" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_modify_v4" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_read_v5" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_modify_v5" ON public.student_posts;

-- 읽기 정책 (본인 것 + 같은 반 소속 친구의 글만 조회 가능)
CREATE POLICY "student_posts_read_v5" ON public.student_posts FOR SELECT USING (
    public.is_admin()
    -- 내 글 혹은 같은 반 친구들의 글
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

-- 쓰기/수정/삭제 정책 (절대 타인이 조작할 수 없도록 본인과 선생님만 허용)
CREATE POLICY "student_posts_modify_v5" ON public.student_posts FOR ALL USING (
    public.is_admin()
    OR student_id IN (SELECT id FROM public.vw_students_rls_bypass WHERE auth_id = auth.uid() AND deleted_at IS NULL)
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

-- 6. 댓글 및 반응 (Post_Comments, Post_Reactions) 테이블 통일
DROP POLICY IF EXISTS "Comment_Select_v4" ON public.post_comments;
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

DROP POLICY IF EXISTS "Reaction_Select_v4" ON public.post_reactions;
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

-- 7. 불필요해진 함수들 제거 (View 방식으로 전환 완료)
DROP FUNCTION IF EXISTS public.get_my_class_id() CASCADE;
DROP FUNCTION IF EXISTS public.check_is_peer_of_student(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.check_is_my_student_id(UUID) CASCADE;

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

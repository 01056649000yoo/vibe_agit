-- ============================================================================
-- 교사 댓글 기능 추가
-- 작성일: 2026-03-09
--
-- 변경사항:
--   1. post_comments 테이블에 teacher_id 컬럼 추가
--      - 학생 댓글: student_id 있음, teacher_id NULL
--      - 교사 댓글: student_id NULL, teacher_id 있음 (auth.users.id)
--   2. Comment_Insert RLS 정책 강화
--      - 교사는 반드시 teacher_id = auth.uid() (위조 불가)
--      - 교사는 자기 반 글에만 달 수 있음
--   3. Comment_Delete 정책에 교사 본인 댓글 삭제 허용 추가
-- ============================================================================

-- [1] teacher_id 컬럼 추가
ALTER TABLE public.post_comments
ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- teacher_id 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_post_comments_teacher_id
    ON public.post_comments(teacher_id)
    WHERE teacher_id IS NOT NULL;


-- [2] Comment_Insert 정책 강화 (학생 + 교사 모두 안전하게)
DROP POLICY IF EXISTS "Comment_Insert" ON public.post_comments;

CREATE POLICY "Comment_Insert" ON public.post_comments FOR INSERT WITH CHECK (
    -- 관리자
    public.is_admin()
    -- 학생 댓글: 반드시 본인의 student_id만 사용 가능
    OR (
        student_id IS NOT NULL
        AND teacher_id IS NULL
        AND EXISTS (
            SELECT 1 FROM public.students s
            WHERE s.id = student_id
              AND s.auth_id = auth.uid()
              AND s.deleted_at IS NULL
        )
    )
    -- 교사 댓글: teacher_id = auth.uid()로 위조 방지 + 자기 반 글에만 허용
    OR (
        teacher_id = auth.uid()
        AND student_id IS NULL
        AND EXISTS (
            SELECT 1 FROM public.student_posts p
            JOIN public.writing_missions m ON p.mission_id = m.id
            JOIN public.classes c ON m.class_id = c.id
            WHERE p.id = post_id
              AND c.teacher_id = auth.uid()
        )
    )
);


-- [3] Comment_Delete 정책 업데이트 (교사 본인 댓글 삭제 허용)
DROP POLICY IF EXISTS "Comment_Delete" ON public.post_comments;

CREATE POLICY "Comment_Delete" ON public.post_comments FOR DELETE USING (
    -- 관리자
    public.is_admin()
    -- 학생은 본인 댓글만 삭제 가능
    OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = student_id
          AND s.auth_id = auth.uid()
          AND s.deleted_at IS NULL
    )
    -- 교사는 자기 반 글에 달린 모든 댓글 삭제 가능 (관리 목적)
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id
          AND c.teacher_id = auth.uid()
    )
);


-- [4] Comment_Update 정책 업데이트 (교사는 본인 댓글만 수정)
DROP POLICY IF EXISTS "Comment_Update" ON public.post_comments;

CREATE POLICY "Comment_Update" ON public.post_comments FOR UPDATE USING (
    -- 관리자
    public.is_admin()
    -- 학생은 본인 댓글만 수정
    OR EXISTS (
        SELECT 1 FROM public.students s
        WHERE s.id = student_id
          AND s.auth_id = auth.uid()
          AND s.deleted_at IS NULL
    )
    -- 교사는 본인이 작성한 댓글만 수정 가능
    OR (teacher_id = auth.uid())
);


-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- [추가] Comment_Select 정책 업데이트
--
-- 기존 Comment_Select_v6 정책은 student_id IN (...) 조건으로만 판단하여
-- 교사 댓글(student_id = NULL)이 학생에게 보이지 않는 문제가 있었음.
-- → 교사 댓글(teacher_id IS NOT NULL)도 같은 반 학생에게 조회 가능하도록 추가
-- ============================================================================
DROP POLICY IF EXISTS "Comment_Select_v6" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Select_v7" ON public.post_comments;

CREATE POLICY "Comment_Select_v7" ON public.post_comments FOR SELECT USING (
    public.is_admin()
    -- 학생 댓글: 같은 반 학생이 쓴 댓글은 같은 반 학생 모두 볼 수 있음
    OR student_id IN (
        SELECT id FROM public.fn_get_students_for_rls_check()
        WHERE class_id IN (
            SELECT class_id FROM public.fn_get_students_for_rls_check()
            WHERE auth_id = auth.uid() AND deleted_at IS NULL
        )
    )
    -- 교사 댓글: teacher_id가 있는 댓글은 같은 반 학생 모두 볼 수 있음 (친구 아지트 포함)
    OR (
        teacher_id IS NOT NULL
        AND EXISTS (
            SELECT 1 FROM public.student_posts p
            JOIN public.writing_missions m ON p.mission_id = m.id
            WHERE p.id = post_id
            AND m.class_id IN (
                SELECT class_id FROM public.fn_get_students_for_rls_check()
                WHERE auth_id = auth.uid() AND deleted_at IS NULL
            )
        )
    )
    -- 교사: 자기 반 글에 달린 모든 댓글 볼 수 있음
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

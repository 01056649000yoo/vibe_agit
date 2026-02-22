-- ============================================================================
-- 🛡️ 종합 보안 패치 (2026-02-22)
-- 보안 감사 결과에 따른 RLS 정책 보강
-- ============================================================================

-- ==========================================================================
-- [패치 1] point_logs SELECT 정책 강화
-- 기존: auth.uid() IS NOT NULL → 모든 인증 사용자가 전체 로그 조회 가능
-- 수정: 본인/담당교사/관리자만 조회 가능
-- ==========================================================================
DROP POLICY IF EXISTS "Log_Select" ON point_logs;

CREATE POLICY "Log_Select" ON point_logs FOR SELECT USING (
    is_admin()
    -- 본인의 포인트 로그 (학생 auth_id 매칭)
    OR EXISTS (
        SELECT 1 FROM students s 
        WHERE s.id = student_id 
          AND s.auth_id = auth.uid() 
          AND s.deleted_at IS NULL
    )
    -- 담당 교사의 학생 포인트 로그
    OR EXISTS (
        SELECT 1 FROM students s 
        JOIN classes c ON c.id = s.class_id
        WHERE s.id = student_id 
          AND c.teacher_id = auth.uid()
          AND s.deleted_at IS NULL
    )
);

-- ==========================================================================
-- [패치 2] post_comments SELECT 정책 강화
-- 기존: USING (true) → 모든 사용자가 모든 학급의 댓글 조회 가능
-- 수정: 같은 학급 내 학생/담당교사/관리자만 조회 가능
-- ==========================================================================
DROP POLICY IF EXISTS "Comment_Select" ON post_comments;

CREATE POLICY "Comment_Select" ON post_comments FOR SELECT USING (
    is_admin()
    -- 같은 학급의 학생 (댓글이 달린 게시글의 미션 → 학급 → 같은 학급의 학생인지 확인)
    OR EXISTS (
        SELECT 1 FROM student_posts p
        JOIN writing_missions m ON p.mission_id = m.id
        JOIN students s ON s.class_id = m.class_id
        WHERE p.id = post_id 
          AND s.auth_id = auth.uid()
          AND s.deleted_at IS NULL
    )
    -- 담당 교사 (댓글이 달린 게시글의 미션 학급 교사)
    OR EXISTS (
        SELECT 1 FROM student_posts p
        JOIN writing_missions m ON p.mission_id = m.id
        JOIN classes c ON m.class_id = c.id
        WHERE p.id = post_id 
          AND c.teacher_id = auth.uid()
    )
);

-- ==========================================================================
-- [패치 3] post_reactions SELECT 정책 강화
-- 기존: USING (true) → 모든 사용자가 모든 학급의 반응 조회 가능
-- 수정: 같은 학급 내 학생/담당교사/관리자만 조회 가능
-- ==========================================================================
DROP POLICY IF EXISTS "Reaction_Select" ON post_reactions;

CREATE POLICY "Reaction_Select" ON post_reactions FOR SELECT USING (
    is_admin()
    -- 같은 학급의 학생
    OR EXISTS (
        SELECT 1 FROM student_posts p
        JOIN writing_missions m ON p.mission_id = m.id
        JOIN students s ON s.class_id = m.class_id
        WHERE p.id = post_id 
          AND s.auth_id = auth.uid()
          AND s.deleted_at IS NULL
    )
    -- 담당 교사
    OR EXISTS (
        SELECT 1 FROM student_posts p
        JOIN writing_missions m ON p.mission_id = m.id
        JOIN classes c ON m.class_id = c.id
        WHERE p.id = post_id 
          AND c.teacher_id = auth.uid()
    )
);

-- ==========================================================================
-- [패치 4] point_logs INSERT 정책 강화
-- 기존: auth.uid() IS NOT NULL → 아무 인증 사용자나 삽입 가능
-- 수정: 관리자/담당교사만 삽입 가능 (학생 포인트는 RPC를 통해서만)
-- ==========================================================================
DROP POLICY IF EXISTS "Log_Insert" ON point_logs;

CREATE POLICY "Log_Insert" ON point_logs FOR INSERT WITH CHECK (
    is_admin()
    -- 담당 교사 (해당 학생의 학급 교사)
    OR EXISTS (
        SELECT 1 FROM students s 
        JOIN classes c ON c.id = s.class_id
        WHERE s.id = student_id 
          AND c.teacher_id = auth.uid()
          AND s.deleted_at IS NULL
    )
);

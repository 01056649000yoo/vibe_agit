-- ============================================================================
-- 🛡️ [응급 복구] 관리자 권한 및 시스템 설정(system_settings) RLS 정책 복원
-- 작성일: 2026-02-22
--
-- 배경:
--   최근 보안 패치에서 public.is_admin() 함수가 CASCADE로 드롭되면서,
--   이 함수에 의존하던 여러 테이블의 RLS 정책들이 함께 삭제되었습니다.
--   이로 인해 관리자가 시스템 설정을 수정하려 할 때 403 Forbidden 에러가 발생합니다.
-- ============================================================================

-- [1] system_settings 테이블 정책 복구 및 권한 부여
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings_Read" ON public.system_settings;
CREATE POLICY "Settings_Read" ON public.system_settings 
    FOR SELECT USING (auth.uid() IS NOT NULL OR public.is_admin());

DROP POLICY IF EXISTS "Settings_Manage" ON public.system_settings;
CREATE POLICY "Settings_Manage" ON public.system_settings 
    FOR ALL USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 명시적 권한 부여 (PostgREST 접근 허용)
GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT SELECT ON TABLE public.system_settings TO anon;

-- [2] announcements (공지사항) 정책 복구
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Announcement_Read" ON public.announcements;
CREATE POLICY "Announcement_Read" ON public.announcements 
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Announcement_Manage" ON public.announcements;
CREATE POLICY "Announcement_Manage" ON public.announcements 
    FOR ALL USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- [3] feedback_reports (피드백 리포트) 정책 복구
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Feedback_Manage" ON public.feedback_reports;
CREATE POLICY "Feedback_Manage" ON public.feedback_reports 
    FOR ALL USING (teacher_id = auth.uid() OR public.is_admin());

-- [4] student_records (AI 분석 기록 등) 정책 복구
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Records_Manage" ON public.student_records;
CREATE POLICY "Records_Manage" ON public.student_records 
    FOR ALL USING (teacher_id = auth.uid() OR public.is_admin());

-- [5] point_logs (포인트 로그) 정책 복구
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Log_Select" ON public.point_logs;
CREATE POLICY "Log_Select" ON public.point_logs FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL)
    OR EXISTS (
        SELECT 1 FROM public.students s 
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = student_id AND c.teacher_id = auth.uid() AND s.deleted_at IS NULL
    )
);

DROP POLICY IF EXISTS "Log_Insert" ON public.point_logs;
CREATE POLICY "Log_Insert" ON public.point_logs FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.students s 
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = student_id AND c.teacher_id = auth.uid() AND s.deleted_at IS NULL
    )
);

-- [6] post_comments & post_reactions (반응 및 댓글) 정책 복구
DROP POLICY IF EXISTS "Comment_Insert" ON public.post_comments;
CREATE POLICY "Comment_Insert" ON public.post_comments FOR INSERT WITH CHECK (
    public.is_admin() OR auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Comment_Update" ON public.post_comments;
CREATE POLICY "Comment_Update" ON public.post_comments FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.auth_id = auth.uid() AND s.deleted_at IS NULL)
);

DROP POLICY IF EXISTS "Reaction_Select" ON public.post_reactions;
CREATE POLICY "Reaction_Select" ON public.post_reactions FOR SELECT USING (
    public.is_admin() OR auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Reaction_Insert" ON public.post_reactions;
CREATE POLICY "Reaction_Insert" ON public.post_reactions FOR INSERT WITH CHECK (
    public.is_admin() OR auth.uid() IS NOT NULL
);

-- [7] vocab_tower_rankings & history 정책 복구
DROP POLICY IF EXISTS "Tower_Rankings_Read" ON public.vocab_tower_rankings;
CREATE POLICY "Tower_Rankings_Read" ON public.vocab_tower_rankings FOR SELECT USING (
    public.is_admin() OR auth.uid() IS NOT NULL
);

DROP POLICY IF EXISTS "Tower_History_Read" ON public.vocab_tower_history;
CREATE POLICY "Tower_History_Read" ON public.vocab_tower_history FOR SELECT USING (
    public.is_admin() OR auth.uid() IS NOT NULL
);

-- 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

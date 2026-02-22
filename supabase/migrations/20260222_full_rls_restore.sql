-- ============================================================================
-- 🛡️ [전체 RLS 정책 복구] 보안 패치 CASCADE 삭제로 유실된 모든 정책 복원
-- 작성일: 2026-02-22
--
-- 배경:
--   20260224_final_security_fix.sql에서 is_admin() 함수를 DROP ... CASCADE로
--   삭제하면서, 이 함수를 참조하던 모든 테이블의 RLS 정책이 연쇄 삭제됨.
--   이후 profiles/teachers 테이블의 정책만 재생성하고 나머지를 누락함.
--   
--   이 스크립트는 integrated_schema_v6.0.sql의 원본 정책을 기반으로
--   모든 테이블의 RLS 정책을 완전히 복구합니다.
-- ============================================================================

-- ─── 사전 준비: is_admin() 함수 존재 확인 ───
-- (20260224_final_security_fix.sql에서 이미 생성되어 있어야 함)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND role = 'ADMIN'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

-- ─── get_my_class_id() 함수 확인 ───
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


-- ====================================================================
-- [1] PROFILES 테이블
-- ====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_self" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_admin" ON public.profiles;
DROP POLICY IF EXISTS "profiles_delete_admin" ON public.profiles;
DROP POLICY IF EXISTS "Profile_Select_Own" ON public.profiles;
DROP POLICY IF EXISTS "Profile_Insert_Own" ON public.profiles;
DROP POLICY IF EXISTS "Profile_Update_Own" ON public.profiles;
DROP POLICY IF EXISTS "Admin_Full_Access_Profiles" ON public.profiles;

CREATE POLICY "Profile_Select_Own" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Profile_Insert_Own" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "Profile_Update_Own" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admin_Full_Access_Profiles" ON public.profiles FOR ALL USING (public.is_admin());


-- ====================================================================
-- [2] TEACHERS 테이블
-- ====================================================================
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "teachers_select_self" ON public.teachers;
DROP POLICY IF EXISTS "teachers_select_admin" ON public.teachers;
DROP POLICY IF EXISTS "teachers_update_self" ON public.teachers;
DROP POLICY IF EXISTS "teachers_update_admin" ON public.teachers;
DROP POLICY IF EXISTS "teachers_delete_admin" ON public.teachers;
DROP POLICY IF EXISTS "teachers_insert_self" ON public.teachers;
DROP POLICY IF EXISTS "teachers_insert_admin" ON public.teachers;
DROP POLICY IF EXISTS "Teacher_Read" ON public.teachers;
DROP POLICY IF EXISTS "Teacher_Manage_Own" ON public.teachers;
DROP POLICY IF EXISTS "Admin_Manage_Teachers" ON public.teachers;

CREATE POLICY "Teacher_Read" ON public.teachers FOR SELECT USING (
    auth.uid() = id OR public.is_admin()
);
CREATE POLICY "Teacher_Manage_Own" ON public.teachers FOR ALL USING (auth.uid() = id);
CREATE POLICY "Admin_Manage_Teachers" ON public.teachers FOR ALL USING (public.is_admin());


-- ====================================================================
-- [3] CLASSES 테이블
-- ====================================================================
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Classes_Select" ON public.classes;
DROP POLICY IF EXISTS "Teacher_Manage_Own_Classes" ON public.classes;
DROP POLICY IF EXISTS "Admin_Manage_Classes" ON public.classes;

CREATE POLICY "Classes_Select" ON public.classes FOR SELECT USING (
    auth.uid() = teacher_id
    OR public.is_admin()
    OR (deleted_at IS NULL AND id = public.get_my_class_id())
);
CREATE POLICY "Teacher_Manage_Own_Classes" ON public.classes FOR ALL USING (auth.uid() = teacher_id);
CREATE POLICY "Admin_Manage_Classes" ON public.classes FOR ALL USING (public.is_admin());


-- ====================================================================
-- [4] STUDENTS 테이블 (활동지수 랭킹에 필수!)
-- ====================================================================
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Student_Select" ON public.students;
DROP POLICY IF EXISTS "Student_Update" ON public.students;
DROP POLICY IF EXISTS "Student_Insert" ON public.students;
DROP POLICY IF EXISTS "Student_Delete" ON public.students;

CREATE POLICY "Student_Select" ON public.students FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.classes c 
        WHERE c.id = class_id AND c.teacher_id = auth.uid()
    )
    OR (
        deleted_at IS NULL 
        AND auth_id IS NOT NULL 
        AND class_id = public.get_my_class_id()
    )
);

CREATE POLICY "Student_Update" ON public.students FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
    OR (auth.uid() = auth_id AND deleted_at IS NULL)
);

CREATE POLICY "Student_Insert" ON public.students FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

CREATE POLICY "Student_Delete" ON public.students FOR DELETE USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);


-- ====================================================================
-- [5] WRITING_MISSIONS 테이블
-- ====================================================================
ALTER TABLE public.writing_missions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Mission_Read" ON public.writing_missions;
DROP POLICY IF EXISTS "Mission_Manage" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_final_v1" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_unlimited_v1" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_access_v4" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_access_v3" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_access_v2" ON public.writing_missions;

CREATE POLICY "Mission_Read" ON public.writing_missions FOR SELECT USING (
    public.is_admin() 
    OR auth.uid() = teacher_id 
    OR EXISTS (
        SELECT 1 FROM public.students s 
        WHERE s.class_id = writing_missions.class_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

CREATE POLICY "Mission_Manage" ON public.writing_missions FOR ALL USING (
    auth.uid() = teacher_id
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
    OR public.is_admin()
);


-- ====================================================================
-- [6] STUDENT_POSTS 테이블
-- ====================================================================
ALTER TABLE public.student_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Post_Select" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Insert" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Update" ON public.student_posts;
DROP POLICY IF EXISTS "Post_Delete" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_final_v1" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_unlimited_v1" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_access_v4" ON public.student_posts;

CREATE POLICY "Post_Select" ON public.student_posts FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        JOIN public.classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.students self ON self.class_id = s.class_id
        WHERE s.id = student_id AND s.deleted_at IS NULL 
        AND self.auth_id = auth.uid() AND self.deleted_at IS NULL
    )
);

CREATE POLICY "Post_Insert" ON public.student_posts FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        JOIN public.classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

CREATE POLICY "Post_Update" ON public.student_posts FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        JOIN public.classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND c.teacher_id = auth.uid()
    )
    OR EXISTS (
        SELECT 1 FROM public.students s 
        WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

CREATE POLICY "Post_Delete" ON public.student_posts FOR DELETE USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        JOIN public.classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND c.teacher_id = auth.uid()
    )
);


-- ====================================================================
-- [7] POST_COMMENTS 테이블
-- ====================================================================
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Comment_Select" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Insert" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Update" ON public.post_comments;
DROP POLICY IF EXISTS "Comment_Delete" ON public.post_comments;

CREATE POLICY "Comment_Select" ON public.post_comments FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.students self ON self.class_id = s.class_id
        WHERE s.id = student_id AND s.deleted_at IS NULL 
        AND self.auth_id = auth.uid() AND self.deleted_at IS NULL
    )
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

CREATE POLICY "Comment_Insert" ON public.post_comments FOR INSERT WITH CHECK (
    public.is_admin() OR auth.uid() IS NOT NULL
);

CREATE POLICY "Comment_Update" ON public.post_comments FOR UPDATE USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL)
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

CREATE POLICY "Comment_Delete" ON public.post_comments FOR DELETE USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL)
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);


-- ====================================================================
-- [8] POST_REACTIONS 테이블
-- ====================================================================
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Reaction_Select" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Insert" ON public.post_reactions;
DROP POLICY IF EXISTS "Reaction_Delete" ON public.post_reactions;

CREATE POLICY "Reaction_Select" ON public.post_reactions FOR SELECT USING (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.students s
        JOIN public.students self ON self.class_id = s.class_id
        WHERE s.id = student_id AND s.deleted_at IS NULL 
        AND self.auth_id = auth.uid() AND self.deleted_at IS NULL
    )
    OR EXISTS (
        SELECT 1 FROM public.student_posts p
        JOIN public.writing_missions m ON p.mission_id = m.id
        JOIN public.classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

CREATE POLICY "Reaction_Insert" ON public.post_reactions FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL)
);

CREATE POLICY "Reaction_Delete" ON public.post_reactions FOR DELETE USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL)
);


-- ====================================================================
-- [9] POINT_LOGS 테이블 (활동지수에 핵심!)
-- ====================================================================
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Log_Select" ON public.point_logs;
DROP POLICY IF EXISTS "Log_Insert" ON public.point_logs;

CREATE POLICY "Log_Select" ON public.point_logs FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL)
    OR EXISTS (
        SELECT 1 FROM public.students s 
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = student_id AND c.teacher_id = auth.uid() AND s.deleted_at IS NULL
    )
);

CREATE POLICY "Log_Insert" ON public.point_logs FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (
        SELECT 1 FROM public.students s 
        JOIN public.classes c ON c.id = s.class_id
        WHERE s.id = student_id AND c.teacher_id = auth.uid() AND s.deleted_at IS NULL
    )
);


-- ====================================================================
-- [10] STUDENT_RECORDS 테이블
-- ====================================================================
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Records_Manage" ON public.student_records;
CREATE POLICY "Records_Manage" ON public.student_records FOR ALL USING (
    teacher_id = auth.uid() OR public.is_admin()
);


-- ====================================================================
-- [11] SYSTEM_SETTINGS 테이블
-- ====================================================================
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Settings_Read" ON public.system_settings;
DROP POLICY IF EXISTS "Settings_Manage" ON public.system_settings;

CREATE POLICY "Settings_Read" ON public.system_settings 
    FOR SELECT USING (auth.uid() IS NOT NULL OR public.is_admin());
CREATE POLICY "Settings_Manage" ON public.system_settings 
    FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

GRANT ALL ON TABLE public.system_settings TO authenticated;
GRANT SELECT ON TABLE public.system_settings TO anon;


-- ====================================================================
-- [12] FEEDBACK_REPORTS 테이블
-- ====================================================================
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Feedback_Manage" ON public.feedback_reports;
CREATE POLICY "Feedback_Manage" ON public.feedback_reports FOR ALL USING (
    teacher_id = auth.uid() OR public.is_admin()
);


-- ====================================================================
-- [13] ANNOUNCEMENTS 테이블
-- ====================================================================
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Announcement_Read" ON public.announcements;
DROP POLICY IF EXISTS "Announcement_Manage" ON public.announcements;

CREATE POLICY "Announcement_Read" ON public.announcements FOR SELECT USING (true);
CREATE POLICY "Announcement_Manage" ON public.announcements FOR ALL USING (public.is_admin());


-- ====================================================================
-- [14] VOCAB_TOWER_RANKINGS 테이블
-- ====================================================================
ALTER TABLE public.vocab_tower_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tower_Rankings_Read" ON public.vocab_tower_rankings;
CREATE POLICY "Tower_Rankings_Read" ON public.vocab_tower_rankings FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.students s 
        WHERE s.class_id = vocab_tower_rankings.class_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);


-- ====================================================================
-- [15] VOCAB_TOWER_HISTORY 테이블
-- ====================================================================
ALTER TABLE public.vocab_tower_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Tower_History_Read" ON public.vocab_tower_history;
DROP POLICY IF EXISTS "Tower_History_Manage" ON public.vocab_tower_history;

CREATE POLICY "Tower_History_Read" ON public.vocab_tower_history FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.students s 
        WHERE s.class_id = vocab_tower_history.class_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);
CREATE POLICY "Tower_History_Manage" ON public.vocab_tower_history FOR ALL USING (
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
    OR public.is_admin()
);


-- ====================================================================
-- [16] AGIT_HONOR_ROLL 테이블
-- ====================================================================
ALTER TABLE public.agit_honor_roll ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Honor_Roll_Select" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Insert" ON public.agit_honor_roll;
DROP POLICY IF EXISTS "Honor_Roll_Manage" ON public.agit_honor_roll;

CREATE POLICY "Honor_Roll_Select" ON public.agit_honor_roll FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.students s 
        WHERE s.class_id = agit_honor_roll.class_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

CREATE POLICY "Honor_Roll_Insert" ON public.agit_honor_roll FOR INSERT WITH CHECK (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL)
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);

CREATE POLICY "Honor_Roll_Manage" ON public.agit_honor_roll FOR ALL USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
);


-- ====================================================================
-- [17] AGIT_SEASON_HISTORY 테이블
-- ====================================================================
ALTER TABLE public.agit_season_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Season_History_Read" ON public.agit_season_history;
DROP POLICY IF EXISTS "Season_History_Manage" ON public.agit_season_history;

CREATE POLICY "Season_History_Read" ON public.agit_season_history FOR SELECT USING (
    public.is_admin()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
    OR EXISTS (
        SELECT 1 FROM public.students s 
        WHERE s.class_id = agit_season_history.class_id AND s.auth_id = auth.uid() AND s.deleted_at IS NULL
    )
);

CREATE POLICY "Season_History_Manage" ON public.agit_season_history FOR ALL USING (
    EXISTS (SELECT 1 FROM public.classes WHERE id = class_id AND teacher_id = auth.uid())
    OR public.is_admin()
);


-- ====================================================================
-- [18] 보호 트리거 재설정 (프로필 권한 탈취 방지)
-- ====================================================================
CREATE OR REPLACE FUNCTION public.protect_profile_sensitive_columns()
RETURNS TRIGGER AS $$
BEGIN
    IF COALESCE(current_setting('app.bypass_profile_protection', true), '') = 'true' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF NEW.role IS DISTINCT FROM OLD.role OR NEW.is_approved IS DISTINCT FROM OLD.is_approved THEN
            IF NOT public.is_admin() THEN
                RAISE EXCEPTION '[보안] 권한 및 승인 상태는 직접 변경할 수 없습니다.' 
                    USING ERRCODE = '42501';
            END IF;
        END IF;
    END IF;

    IF TG_OP = 'INSERT' THEN
        IF NEW.role = 'ADMIN' AND NOT public.is_admin() THEN
            RAISE EXCEPTION '[보안] ADMIN 역할은 자체 할당할 수 없습니다.'
                USING ERRCODE = '42501';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile ON public.profiles;
CREATE TRIGGER trg_protect_profile
    BEFORE INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.protect_profile_sensitive_columns();


-- ====================================================================
-- [19] 관리자 계정 확인
-- ====================================================================
UPDATE public.profiles SET role = 'ADMIN', is_approved = true 
WHERE email IN (
    'yshgg@naver.com', 
    '01056649000yoo@gmail.com', 
    '01056649000yoo@naver.com'
);


-- ====================================================================
-- 스키마 캐시 갱신
-- ====================================================================
NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- [VIBE_TEST 통합 마스터 스키마 v5.0]
-- 작성일: 2026-02-08
-- 설명: 모든 테이블, 함수, 보안 정책(RLS), 실시간 설정(Realtime)을 하나로 통합한 최종본입니다.
--       (포인트 컬럼 amount 통일 및 실시간 감시 테이블 확장 반영)
-- ====================================================================

-- 1. 정책 및 권한 초기화 (Clean Start)
-- --------------------------------------------------------------------
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename);
    END LOOP;
END $$;

-- 2. 테이블 스키마 정의
-- --------------------------------------------------------------------

-- [Profiles] 사용자 프로필
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('TEACHER', 'STUDENT', 'ADMIN')) DEFAULT 'TEACHER',
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_approved BOOLEAN DEFAULT false,
    email_verified BOOLEAN DEFAULT false,
    gemini_api_key TEXT,
    personal_openai_api_key TEXT,
    api_mode TEXT DEFAULT 'SYSTEM',
    ai_prompt_template TEXT,
    activity_ai_prompt TEXT,
    primary_class_id UUID,
    frequent_tags JSONB DEFAULT '[]'::jsonb,
    default_rubric JSONB,
    mission_default_settings JSONB,
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- [Teachers] 선생님 상세 정보
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    school_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Classes] 학급 정보
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    grade INTEGER,
    class_number INTEGER,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE,
    invite_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    -- 게임 및 아지트 설정
    dragon_feed_points INTEGER DEFAULT 80,
    dragon_degen_days INTEGER DEFAULT 14,
    game_config JSONB DEFAULT '{"degenerationDays": 14, "feedCost": 80}'::JSONB,
    agit_settings JSONB DEFAULT '{"targetScore": 100, "currentTemperature": 0, "activityGoals": {"post": 1, "comment": 5, "reaction": 5}}'::JSONB,
    -- 어휘의 탑 설정
    vocab_tower_enabled BOOLEAN DEFAULT false,
    vocab_tower_grade INTEGER DEFAULT 3,
    vocab_tower_daily_limit INTEGER DEFAULT 3,
    vocab_tower_time_limit INTEGER DEFAULT 40,
    vocab_tower_reward_points INTEGER DEFAULT 80,
    vocab_tower_reset_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    vocab_tower_ranking_reset_date TIMESTAMP WITH TIME ZONE
);

-- [Students] 학생 정보
CREATE TABLE IF NOT EXISTS public.students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    student_code TEXT UNIQUE NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    total_points INTEGER DEFAULT 0,
    inventory JSONB DEFAULT '[]'::jsonb,
    selected_items JSONB DEFAULT '{"background": "default", "desk": "default"}'::jsonb,
    pet_data JSONB DEFAULT '{"name": "드래곤", "level": 1, "exp": 0}'::jsonb,
    last_feedback_check TIMESTAMP WITH TIME ZONE DEFAULT '1970-01-01 00:00:00+00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- [Writing Missions] 글쓰기 미션
CREATE TABLE IF NOT EXISTS public.writing_missions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE,
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMP WITH TIME ZONE,
    mission_type TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    guide_questions JSONB DEFAULT '[]'::jsonb,
    question_count INTEGER DEFAULT 5,
    use_ai_questions BOOLEAN DEFAULT false,
    evaluation_rubric JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Student Posts] 학생이 쓴 글
CREATE TABLE IF NOT EXISTS public.student_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mission_id UUID REFERENCES public.writing_missions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    title TEXT,
    content TEXT NOT NULL,
    is_submitted BOOLEAN DEFAULT false,
    is_returned BOOLEAN DEFAULT false, -- 반려(다시 쓰기) 상태
    status TEXT DEFAULT 'submitted',
    original_content TEXT,
    original_title TEXT,
    first_submitted_at TIMESTAMPTZ,
    ai_one_line_review TEXT,
    student_answers JSONB DEFAULT '[]'::jsonb,
    initial_eval INT,
    final_eval INT,
    eval_comment TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Post Comments] 댓글
CREATE TABLE IF NOT EXISTS public.post_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.student_posts(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'approved',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Post Reactions] 좋아요/반응
CREATE TABLE IF NOT EXISTS public.post_reactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.student_posts(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_post_student_reaction UNIQUE (post_id, student_id)
);

-- [Point Logs] 포인트 내역 (points -> amount 로 통일)
CREATE TABLE IF NOT EXISTS public.point_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    amount INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [System Settings] 시스템 설정
CREATE TABLE IF NOT EXISTS public.system_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Feedback Reports] 의견 및 버그 제보
CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Announcements] 공지사항
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    target_role TEXT DEFAULT 'TEACHER',
    is_popup BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- [Student Records] 생기부/AI 분석 기록
CREATE TABLE IF NOT EXISTS public.student_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE NOT NULL,
    record_type TEXT DEFAULT 'record_assistant', -- 'record_assistant' | 'ai_comment'
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    mission_ids UUID[] DEFAULT '{}',
    byte_size INTEGER DEFAULT 0,
    activity_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Agit Honor Roll & Season History]
CREATE TABLE IF NOT EXISTS public.agit_honor_roll (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    achieved_date DATE DEFAULT (CURRENT_DATE AT TIME ZONE 'Asia/Seoul'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_daily_achievement UNIQUE (student_id, achieved_date)
);

CREATE TABLE IF NOT EXISTS public.agit_season_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    season_name TEXT,
    target_score INTEGER,
    surprise_gift TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    rankings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Vocab Tower Rankings & History]
CREATE TABLE IF NOT EXISTS public.vocab_tower_rankings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    max_floor INTEGER DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_tower_ranking UNIQUE (student_id)
);

CREATE TABLE IF NOT EXISTS public.vocab_tower_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    season_name TEXT,
    rankings JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. 함수 및 RPC 정의
-- --------------------------------------------------------------------

-- 관리자 여부 확인
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'ADMIN');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 만료된(3일 경과) 삭제 데이터 청소
CREATE OR REPLACE FUNCTION public.cleanup_expired_deletions()
RETURNS void AS $$
BEGIN
    -- 3일이 지난 학생 완전 삭제 (게시글 등 관련 데이터 자동 연쇄 삭제)
    DELETE FROM public.students WHERE deleted_at < now() - interval '3 days';
    -- 3일이 지난 학급 삭제
    DELETE FROM public.classes WHERE deleted_at < now() - interval '3 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 이메일 인증 상태 동기화
CREATE OR REPLACE FUNCTION public.handle_email_verification()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL THEN
    UPDATE public.profiles SET email_verified = true WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 학생 포인트 증가 및 로그 기록 (amount 컬럼 반영)
CREATE OR REPLACE FUNCTION public.increment_student_points(student_id UUID, points_to_add INTEGER)
RETURNS void AS $$
BEGIN
    UPDATE public.students SET total_points = COALESCE(total_points, 0) + points_to_add WHERE id = student_id;
    INSERT INTO public.point_logs (student_id, reason, amount) VALUES (student_id, '보너스 포인트 획득! 🏰', points_to_add);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 어휘의 탑 최고 층수 업데이트
CREATE OR REPLACE FUNCTION public.update_tower_max_floor(p_student_id UUID, p_class_id UUID, p_floor INTEGER)
RETURNS void AS $$
BEGIN
    INSERT INTO public.vocab_tower_rankings (student_id, class_id, max_floor, updated_at)
    VALUES (p_student_id, p_class_id, p_floor, now())
    ON CONFLICT (student_id)
    DO UPDATE SET
        max_floor = GREATEST(vocab_tower_rankings.max_floor, EXCLUDED.max_floor),
        updated_at = now()
    WHERE vocab_tower_rankings.max_floor < EXCLUDED.max_floor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. RLS (Row Level Security) 정책
-- --------------------------------------------------------------------

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage_Own_Profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Admin_Full_Access" ON profiles FOR ALL USING (is_admin());

-- Teachers & Classes
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teacher_Manage_Own_Data" ON teachers FOR ALL USING (auth.uid() = id);
CREATE POLICY "Anyone_Read_Classes" ON classes FOR SELECT USING (true);
CREATE POLICY "Teacher_Manage_Own_Classes" ON classes FOR ALL USING (auth.uid() = teacher_id);

-- Students, Posts, Comments, Reactions, Missions, Logs
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Student_Public_Access" ON students FOR ALL USING (
    deleted_at IS NULL 
    OR is_admin() 
    OR (auth.uid() IS NOT NULL AND EXISTS (SELECT 1 FROM public.classes WHERE id = students.class_id AND teacher_id = auth.uid()))
);
CREATE POLICY "Mission_Public_Read" ON writing_missions FOR SELECT USING (true);
CREATE POLICY "Mission_Teacher_Manage" ON writing_missions FOR ALL USING (auth.uid() = teacher_id);
CREATE POLICY "Post_Public_Access" ON student_posts FOR ALL USING (
    EXISTS (SELECT 1 FROM public.students WHERE id = student_id AND deleted_at IS NULL)
    OR is_admin()
) WITH CHECK (
    EXISTS (SELECT 1 FROM public.students WHERE id = student_id AND deleted_at IS NULL)
    OR is_admin()
);
CREATE POLICY "Comment_Public_Access" ON post_comments FOR ALL USING (
    EXISTS (SELECT 1 FROM public.students WHERE id = student_id AND deleted_at IS NULL)
    OR is_admin()
);
CREATE POLICY "Reaction_Public_Access" ON post_reactions FOR ALL USING (
    EXISTS (SELECT 1 FROM public.students WHERE id = student_id AND deleted_at IS NULL)
    OR is_admin()
);
CREATE POLICY "Log_Public_Access" ON point_logs FOR ALL USING (true);

-- Student Records (생기부 도우미)
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teacher_Manage_Class_Records" ON student_records FOR ALL USING (
    teacher_id = auth.uid() OR is_admin()
);

-- System Settings & Feedback Reports
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone_Read_Settings" ON system_settings FOR SELECT USING (true);
CREATE POLICY "Admin_Manage_Settings" ON system_settings FOR ALL USING (is_admin());
CREATE POLICY "Teacher_Manage_Own_Feedback" ON feedback_reports FOR ALL USING (teacher_id = auth.uid() OR is_admin());

-- Announcements
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Read_Announcements" ON announcements FOR SELECT USING (true);
CREATE POLICY "Admin_Manage_Announcements" ON announcements FOR ALL USING (is_admin());

-- Vocab Tower & Agit Tables
ALTER TABLE public.vocab_tower_rankings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vocab_tower_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agit_honor_roll ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agit_season_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Vocab_Public_Read" ON vocab_tower_rankings FOR SELECT USING (true);
CREATE POLICY "Vocab_Public_Update" ON vocab_tower_rankings FOR ALL USING (true);
CREATE POLICY "Agit_Public_Read" ON agit_honor_roll FOR SELECT USING (true);
CREATE POLICY "Agit_Public_Update" ON agit_honor_roll FOR ALL USING (true);
CREATE POLICY "History_Public_Read" ON agit_season_history FOR SELECT USING (true);
CREATE POLICY "History_Public_Read_Tower" ON vocab_tower_history FOR SELECT USING (true);

-- 5. 실시간(Realtime) 및 초기 설정
-- --------------------------------------------------------------------

-- 이메일 확인 트리거
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_email_verification();

-- 실시간 알림 활성화 (실시간 감시 대상 테이블 확장)
BEGIN;
    DROP PUBLICATION IF EXISTS supabase_realtime;
    CREATE PUBLICATION supabase_realtime FOR TABLE 
        public.point_logs, 
        public.student_posts, 
        public.students,
        public.classes,
        public.announcements;
COMMIT;

-- 초기 시스템 설정
INSERT INTO public.system_settings (key, value) VALUES 
('auto_approval', 'false'::jsonb),
('use_central_api', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 마스터 관리자 수동 승인
UPDATE public.profiles SET role = 'ADMIN', is_approved = true WHERE email = '01056649000yoo@gmail.com';

-- 권한 부여
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

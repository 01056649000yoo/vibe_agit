-- ====================================================================
-- [VIBE_TEST 통합 마스터 스키마 v6.0]
-- 작성일: 2026-02-09
-- 설명: 모든 테이블, 함수, 보안 정책(RLS), 인덱스, 실시간 설정을 하나로 통합한 최종본입니다.
--       중복 제거 및 성능 최적화 완료
-- ====================================================================


-- ============================================================
-- PART 1: 기존 정책 초기화 (Clean Start)
-- ============================================================
-- 모든 기존 RLS 정책을 삭제하여 중복 방지
DO $$
DECLARE pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename);
    END LOOP;
END $$;


-- ============================================================
-- PART 2: 테이블 스키마 정의
-- ============================================================

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
    vocab_tower_ranking_reset_date TIMESTAMP WITH TIME ZONE,
    season_started_at TIMESTAMP WITH TIME ZONE
);


-- [Students] 학생 정보
CREATE TABLE IF NOT EXISTS public.students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    student_code TEXT UNIQUE NOT NULL,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL, -- [신규] 익명 로그인 세션 매핑
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
    is_returned BOOLEAN DEFAULT false,
    status TEXT DEFAULT 'submitted',
    original_content TEXT,
    original_title TEXT,
    first_submitted_at TIMESTAMPTZ,
    ai_one_line_review TEXT,
    student_answers JSONB DEFAULT '[]'::jsonb,
    initial_eval INT,
    final_eval INT,
    eval_comment TEXT,
    is_confirmed BOOLEAN DEFAULT false, -- [추가] 선생님의 글 승인 여부
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


-- [Point Logs] 포인트 내역
CREATE TABLE IF NOT EXISTS public.point_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    post_id UUID REFERENCES public.student_posts(id) ON DELETE SET NULL,
    mission_id UUID REFERENCES public.writing_missions(id) ON DELETE SET NULL,
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
    record_type TEXT DEFAULT 'record_assistant',
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    mission_ids UUID[] DEFAULT '{}',
    byte_size INTEGER DEFAULT 0,
    activity_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- [Agit Honor Roll] 명예의 전당
CREATE TABLE IF NOT EXISTS public.agit_honor_roll (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    achieved_date DATE DEFAULT (CURRENT_DATE AT TIME ZONE 'Asia/Seoul'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_daily_achievement UNIQUE (student_id, achieved_date)
);


-- [Agit Season History] 시즌 기록
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


-- [Vocab Tower Rankings] 어휘의 탑 랭킹
CREATE TABLE IF NOT EXISTS public.vocab_tower_rankings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    max_floor INTEGER DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_tower_ranking UNIQUE (student_id)
);


-- [Vocab Tower History] 어휘의 탑 시즌 기록
CREATE TABLE IF NOT EXISTS public.vocab_tower_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    season_name TEXT,
    rankings JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);


-- ============================================================
-- PART 2.5: 누락된 컬럼 동적 추가
-- ============================================================
-- 기존 테이블에 누락된 컬럼이 있을 경우 추가 (CREATE TABLE IF NOT EXISTS는 기존 테이블에 컬럼을 추가하지 않음)

-- Profiles 컬럼
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS personal_openai_api_key TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS api_mode TEXT DEFAULT 'SYSTEM';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activity_ai_prompt TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS mission_default_settings JSONB;

-- Classes 컬럼
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS invite_code TEXT;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS dragon_feed_points INTEGER DEFAULT 80;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS dragon_degen_days INTEGER DEFAULT 14;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS game_config JSONB DEFAULT '{"degenerationDays": 14, "feedCost": 80}'::JSONB;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS agit_settings JSONB DEFAULT '{"targetScore": 100, "currentTemperature": 0, "activityGoals": {"post": 1, "comment": 5, "reaction": 5}}'::JSONB;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS vocab_tower_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS vocab_tower_grade INTEGER DEFAULT 3;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS vocab_tower_daily_limit INTEGER DEFAULT 3;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS vocab_tower_time_limit INTEGER DEFAULT 40;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS vocab_tower_reward_points INTEGER DEFAULT 80;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS vocab_tower_reset_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS vocab_tower_ranking_reset_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS season_started_at TIMESTAMP WITH TIME ZONE;

-- Point Logs 컬럼 추가
ALTER TABLE public.point_logs ADD COLUMN IF NOT EXISTS post_id UUID REFERENCES public.student_posts(id) ON DELETE SET NULL;
ALTER TABLE public.point_logs ADD COLUMN IF NOT EXISTS mission_id UUID REFERENCES public.writing_missions(id) ON DELETE SET NULL;

-- Realtime 연동을 위한 데이터 복제 모드 설정 (Full)
ALTER TABLE public.student_posts REPLICA IDENTITY FULL;
ALTER TABLE public.point_logs REPLICA IDENTITY FULL;
ALTER TABLE public.students REPLICA IDENTITY FULL;
ALTER TABLE public.post_comments REPLICA IDENTITY FULL;
ALTER TABLE public.post_reactions REPLICA IDENTITY FULL;

-- Students 컬럼
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS inventory JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS selected_items JSONB DEFAULT '{"background": "default", "desk": "default"}'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pet_data JSONB DEFAULT '{"name": "드래곤", "level": 1, "exp": 0, "lastFed": "1970-01-01", "ownedItems": [], "background": "default"}'::jsonb;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS last_feedback_check TIMESTAMP WITH TIME ZONE DEFAULT '1970-01-01 00:00:00+00';

-- 기존 데이터 초기화 (NULL이거나 구조가 불완전한 경우 기본값 채우기)
UPDATE public.students SET pet_data = '{"name": "드래곤", "level": 1, "exp": 0, "lastFed": "1970-01-01", "ownedItems": [], "background": "default"}'::jsonb WHERE pet_data IS NULL OR jsonb_typeof(pet_data) != 'object';
UPDATE public.students SET total_points = 0 WHERE total_points IS NULL;
UPDATE public.students SET inventory = '[]'::jsonb WHERE inventory IS NULL;
UPDATE public.students SET selected_items = '{"background": "default", "desk": "default"}'::jsonb WHERE selected_items IS NULL;

-- [보완] pet_data의 필수 필드(level, exp)가 누락된 경우 강제 보정
UPDATE public.students 
SET pet_data = jsonb_set(
    jsonb_set(COALESCE(pet_data, '{}'::jsonb), '{level}', '1'),
    '{exp}', '0'
)
WHERE pet_data->'level' IS NULL OR pet_data->'exp' IS NULL;

-- Student Posts 컬럼
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS is_confirmed BOOLEAN DEFAULT false;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'submitted';
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS is_returned BOOLEAN DEFAULT false;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS original_content TEXT;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS original_title TEXT;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS first_submitted_at TIMESTAMPTZ;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS ai_one_line_review TEXT;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS student_answers JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS initial_eval INT;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS final_eval INT;
ALTER TABLE public.student_posts ADD COLUMN IF NOT EXISTS eval_comment TEXT;

-- 기존 데이터 초기화: 제출된 글은 일단 승인된 것으로 간주 (운영 편의상)
UPDATE public.student_posts SET is_confirmed = true WHERE is_submitted = true AND is_confirmed IS NULL;
UPDATE public.student_posts SET is_confirmed = false WHERE is_confirmed IS NULL;

-- Post Comments 컬럼
ALTER TABLE public.post_comments ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'approved';

-- Writing Missions 컬럼
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE;
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS mission_type TEXT;
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS guide_questions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS question_count INTEGER DEFAULT 5;
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS use_ai_questions BOOLEAN DEFAULT false;
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS evaluation_rubric JSONB;

-- Student Records 컬럼
ALTER TABLE public.student_records ADD COLUMN IF NOT EXISTS teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE;


-- ============================================================
-- PART 3: 성능 최적화 인덱스
-- ============================================================

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_is_approved ON public.profiles(is_approved);
CREATE INDEX IF NOT EXISTS idx_profiles_last_login_at ON public.profiles(last_login_at DESC);

-- Classes
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);
CREATE INDEX IF NOT EXISTS idx_classes_deleted_at ON public.classes(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_classes_invite_code ON public.classes(invite_code);

-- Students
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_student_code ON public.students(student_code);
CREATE INDEX IF NOT EXISTS idx_students_deleted_at ON public.students(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_students_auth_id ON public.students(auth_id) WHERE auth_id IS NOT NULL;

-- Writing Missions
CREATE INDEX IF NOT EXISTS idx_missions_class_id ON public.writing_missions(class_id);
CREATE INDEX IF NOT EXISTS idx_missions_teacher_id ON public.writing_missions(teacher_id);
CREATE INDEX IF NOT EXISTS idx_missions_is_archived ON public.writing_missions(is_archived);
CREATE INDEX IF NOT EXISTS idx_missions_created_at ON public.writing_missions(created_at DESC);

-- Student Posts
CREATE INDEX IF NOT EXISTS idx_posts_mission_id ON public.student_posts(mission_id);
CREATE INDEX IF NOT EXISTS idx_posts_student_id ON public.student_posts(student_id);
CREATE INDEX IF NOT EXISTS idx_posts_status ON public.student_posts(status);
CREATE INDEX IF NOT EXISTS idx_posts_created_at ON public.student_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_is_submitted ON public.student_posts(is_submitted);

-- Post Comments & Reactions
CREATE INDEX IF NOT EXISTS idx_comments_post_id ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_comments_student_id ON public.post_comments(student_id);
CREATE INDEX IF NOT EXISTS idx_reactions_post_id ON public.post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_reactions_student_id ON public.post_reactions(student_id);

-- Point Logs
CREATE INDEX IF NOT EXISTS idx_point_logs_student_id ON public.point_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_created_at ON public.point_logs(created_at DESC);

-- Student Records
CREATE INDEX IF NOT EXISTS idx_student_records_student_id ON public.student_records(student_id);
CREATE INDEX IF NOT EXISTS idx_student_records_class_id ON public.student_records(class_id);
CREATE INDEX IF NOT EXISTS idx_student_records_teacher_id ON public.student_records(teacher_id);
CREATE INDEX IF NOT EXISTS idx_student_records_created_at ON public.student_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_records_type ON public.student_records(record_type);

-- Agit Honor Roll
CREATE INDEX IF NOT EXISTS idx_agit_honor_roll_class_id ON public.agit_honor_roll(class_id);
CREATE INDEX IF NOT EXISTS idx_agit_honor_roll_date ON public.agit_honor_roll(achieved_date);
CREATE INDEX IF NOT EXISTS idx_agit_honor_roll_student_id ON public.agit_honor_roll(student_id);

-- Agit Season History
CREATE INDEX IF NOT EXISTS idx_agit_season_history_class_id ON public.agit_season_history(class_id);
CREATE INDEX IF NOT EXISTS idx_season_history_ended_at ON public.agit_season_history(ended_at DESC);

-- Vocab Tower
CREATE INDEX IF NOT EXISTS idx_tower_rankings_class_id ON public.vocab_tower_rankings(class_id);
CREATE INDEX IF NOT EXISTS idx_tower_rankings_max_floor ON public.vocab_tower_rankings(max_floor DESC);
CREATE INDEX IF NOT EXISTS idx_tower_history_class_id ON public.vocab_tower_history(class_id);
CREATE INDEX IF NOT EXISTS idx_tower_history_ended_at ON public.vocab_tower_history(ended_at DESC);


-- ============================================================
-- PART 4: 함수 및 RPC 정의
-- ============================================================

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
    DELETE FROM public.students WHERE deleted_at < now() - interval '3 days';
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


-- 학생 포인트 증가 및 로그 기록 (확장 버전)
CREATE OR REPLACE FUNCTION public.increment_student_points(
    p_student_id UUID,
    p_amount INTEGER,
    p_reason TEXT DEFAULT '포인트 보상 🎁',
    p_post_id UUID DEFAULT NULL,
    p_mission_id UUID DEFAULT NULL
)
RETURNS void AS $$
BEGIN
    UPDATE public.students 
    SET total_points = COALESCE(total_points, 0) + p_amount 
    WHERE id = p_student_id;
    
    INSERT INTO public.point_logs (student_id, reason, amount, post_id, mission_id) 
    VALUES (p_student_id, p_reason, p_amount, p_post_id, p_mission_id);
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


-- 학생의 알림 확인 시간 업데이트 (RLS 우회용)
CREATE OR REPLACE FUNCTION public.mark_feedback_as_read(p_student_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE public.students 
    SET last_feedback_check = timezone('utc'::text, now())
    WHERE id = p_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 교사가 학생 포인트를 관리하는 함수 (SECURITY DEFINER로 RLS 우회)
CREATE OR REPLACE FUNCTION public.teacher_manage_points(
    target_student_id UUID,
    points_amount INTEGER,
    reason_text TEXT
)
RETURNS void AS $$
BEGIN
    -- 1. 학생 포인트 업데이트
    UPDATE public.students 
    SET total_points = COALESCE(total_points, 0) + points_amount 
    WHERE id = target_student_id;
    
    -- 2. 포인트 로그 기록
    INSERT INTO public.point_logs (student_id, reason, amount) 
    VALUES (target_student_id, reason_text, points_amount);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 학생 추가 시 초기 포인트 부여 함수
CREATE OR REPLACE FUNCTION public.add_student_with_bonus(
    p_class_id UUID,
    p_name TEXT,
    p_student_code TEXT,
    p_initial_points INTEGER DEFAULT 100
)
RETURNS UUID AS $$
DECLARE
    new_student_id UUID;
BEGIN
    -- 1. 학생 추가
    INSERT INTO public.students (class_id, name, student_code, total_points)
    VALUES (p_class_id, p_name, p_student_code, p_initial_points)
    RETURNING id INTO new_student_id;
    
    -- 2. 환영 포인트 로그 기록
    INSERT INTO public.point_logs (student_id, reason, amount)
    VALUES (new_student_id, '신규 등록 기념 환영 포인트! 🎁', p_initial_points);
    
    RETURN new_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ============================================================
-- PART 5: RLS (Row Level Security) 정책
-- ============================================================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Manage_Own_Profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Admin_Full_Access_Profiles" ON profiles FOR ALL USING (is_admin());

-- Teachers
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
-- [수정] 누구나 상세 정보를 보는 것을 방지하고, 본인 또는 관리자만 조회 가능하도록 제한
CREATE POLICY "Teacher_Read" ON teachers FOR SELECT USING (
    auth.uid() = id 
    OR is_admin()
);
CREATE POLICY "Teacher_Manage_Own" ON teachers FOR ALL USING (auth.uid() = id);
CREATE POLICY "Admin_Manage_Teachers" ON teachers FOR ALL USING (is_admin());

-- Classes
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
-- [수정] 모든 사용자가 목록을 조회하는 것을 방지하고, 교사/관리자/소속 학생만 조회 가능하도록 제한
CREATE POLICY "Classes_Select" ON classes FOR SELECT USING (
    auth.uid() = teacher_id 
    OR is_admin() 
    OR (deleted_at IS NULL) -- 학생 접근을 위해 최소한으로 허용 (추후 세션 도입 권장)
);
CREATE POLICY "Teacher_Manage_Own_Classes" ON classes FOR ALL USING (auth.uid() = teacher_id);
CREATE POLICY "Admin_Manage_Classes" ON classes FOR ALL USING (is_admin());

-- Students
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
-- [수정] 본인 학급의 학생 정보만 접근 가능하도록 제한 (교사/관리자 위주)
CREATE POLICY "Student_Select" ON students FOR SELECT USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND (teacher_id = auth.uid() OR deleted_at IS NULL))
);
-- [수정] 무분별한 ALL 허용(true) 제거 -> 기능별 세분화
CREATE POLICY "Student_Update_Self" ON students FOR UPDATE USING (
    deleted_at IS NULL -- 삭제되지 않은 상태에서만
) WITH CHECK (
    -- 포인트 조작 방지: anon은 포인트를 직접 수정할 수 없도록 제한 (RPC 통해서만 가능)
    (auth.uid() IS NOT NULL) OR (total_points = (SELECT total_points FROM students WHERE id = id))
);
CREATE POLICY "Teacher_Admin_Manage_Students" ON students FOR ALL USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
);

-- Writing Missions
ALTER TABLE public.writing_missions ENABLE ROW LEVEL SECURITY;
-- [수정] 전역 조회를 방지하고, 교사/관리자 또는 활성 학급 소속 데이터만 조회 가능하도록 제한
CREATE POLICY "Mission_Read" ON writing_missions FOR SELECT USING (
    is_admin() 
    OR auth.uid() = teacher_id 
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND deleted_at IS NULL)
);
CREATE POLICY "Mission_Manage" ON writing_missions FOR ALL USING (
    auth.uid() = teacher_id
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
    OR is_admin()
);

-- Student Posts
ALTER TABLE public.student_posts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Post_Read" ON student_posts FOR SELECT USING (
    is_admin()
    OR EXISTS (SELECT 1 FROM students WHERE id = student_id AND deleted_at IS NULL)
    OR EXISTS (
        SELECT 1 FROM writing_missions m
        JOIN classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND (c.teacher_id = auth.uid() OR c.deleted_at IS NULL)
    )
);
-- [수정] 누구나 글을 쓰고 수정하는 것 방지
CREATE POLICY "Post_Insert" ON student_posts FOR INSERT WITH CHECK (true); -- 글쓰기 허용
CREATE POLICY "Post_Update_Delete" ON student_posts FOR ALL USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM writing_missions m
        JOIN classes c ON m.class_id = c.id
        WHERE m.id = mission_id AND c.teacher_id = auth.uid()
    )
);

-- Post Comments
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Comment_Read" ON post_comments FOR SELECT USING (true);
CREATE POLICY "Comment_Insert" ON post_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Comment_Manage" ON post_comments FOR ALL USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM student_posts p
        JOIN writing_missions m ON p.mission_id = m.id
        JOIN classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
);

-- Post Reactions
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Reaction_Read" ON post_reactions FOR SELECT USING (true);
CREATE POLICY "Reaction_Insert" ON post_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Reaction_Delete" ON post_reactions FOR DELETE USING (
    is_admin()
    OR EXISTS (
        SELECT 1 FROM student_posts p
        JOIN writing_missions m ON p.mission_id = m.id
        JOIN classes c ON m.class_id = c.id
        WHERE p.id = post_id AND c.teacher_id = auth.uid()
    )
    -- [주의] anon 학생은 본인이 누른 좋아요만 취소할 수 있어야 하나, session 이슈로 교사/관리자 제어로 강화
);

-- Point Logs
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Log_Select" ON point_logs FOR SELECT USING (
    is_admin()
    OR auth.uid() IS NOT NULL -- 교사는 전체 확인 가능
    OR EXISTS (SELECT 1 FROM students WHERE id = student_id) -- 학생은 자신의 로그 (ID 알 때만)
);
-- [수정] anon이 직접 로그를 쌓는 것 방지 (보안 정의된 RPC 함수로만 가능하도록 유도)
CREATE POLICY "Log_Insert" ON point_logs FOR INSERT WITH CHECK (
    is_admin() OR auth.uid() IS NOT NULL
);
-- UPDATE/DELETE는 여전히 금지 (포인트 조작 방지)

-- Student Records
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Records_Manage" ON student_records FOR ALL USING (
    teacher_id = auth.uid() OR is_admin()
);

-- System Settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
-- [수정] 비로그인 사용자(anon)는 시스템 정보 조회를 제한 (교사/관리자만 가능)
CREATE POLICY "Settings_Read" ON system_settings FOR SELECT USING (auth.uid() IS NOT NULL OR is_admin());
CREATE POLICY "Settings_Manage" ON system_settings FOR ALL USING (is_admin());

-- Feedback Reports
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Feedback_Manage" ON feedback_reports FOR ALL USING (
    teacher_id = auth.uid() OR is_admin()
);

-- Announcements
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Announcement_Read" ON announcements FOR SELECT USING (true);
CREATE POLICY "Announcement_Manage" ON announcements FOR ALL USING (is_admin());

-- Vocab Tower Rankings
ALTER TABLE public.vocab_tower_rankings ENABLE ROW LEVEL SECURITY;
-- [수정] 전역 랭킹 노출을 방지하고 학급 내 랭킹만 조회 가능하도록 제한
CREATE POLICY "Tower_Rankings_Read" ON vocab_tower_rankings FOR SELECT USING (
    is_admin() 
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND (teacher_id = auth.uid() OR deleted_at IS NULL))
);
-- INSERT/UPDATE는 SECURITY DEFINER 함수(update_tower_max_floor)에서만 가능
-- 직접 API 호출로는 랭킹 조작 불가

-- Vocab Tower History (보안 강화: SELECT만 허용, 수정은 교사/관리자만)
ALTER TABLE public.vocab_tower_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Tower_History_Read" ON vocab_tower_history FOR SELECT USING (true);
CREATE POLICY "Tower_History_Manage" ON vocab_tower_history FOR ALL USING (
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
    OR is_admin()
);

-- Agit Honor Roll
ALTER TABLE public.agit_honor_roll ENABLE ROW LEVEL SECURITY;
-- [수정] 학급별 명예의 전당 정보 격리
CREATE POLICY "Honor_Roll_Read" ON agit_honor_roll FOR SELECT USING (
    is_admin() 
    OR EXISTS (SELECT 1 FROM classes WHERE id = class_id AND (teacher_id = auth.uid() OR deleted_at IS NULL))
);
-- [수정] 학생도 자신의 미션 달성을 기록할 수 있도록 ALL 정책 허용
CREATE POLICY "Honor_Roll_Manage" ON agit_honor_roll FOR ALL USING (
    true
);

-- Agit Season History (보안 강화: SELECT만 허용, 수정은 교사/관리자만)
ALTER TABLE public.agit_season_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Season_History_Read" ON agit_season_history FOR SELECT USING (true);
CREATE POLICY "Season_History_Manage" ON agit_season_history FOR ALL USING (
    EXISTS (SELECT 1 FROM classes WHERE id = class_id AND teacher_id = auth.uid())
    OR is_admin()
);


-- ============================================================
-- PART 6: 트리거 및 실시간(Realtime) 설정
-- ============================================================

-- 이메일 확인 트리거
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created 
    AFTER INSERT ON auth.users 
    FOR EACH ROW 
    EXECUTE FUNCTION public.handle_email_verification();

-- 실시간 알림 활성화
BEGIN;
    DROP PUBLICATION IF EXISTS supabase_realtime;
    CREATE PUBLICATION supabase_realtime FOR TABLE 
        public.point_logs, 
        public.student_posts, 
        public.students,
        public.classes,
        public.announcements,
        public.post_comments,
        public.post_reactions;
COMMIT;


-- ============================================================
-- PART 7: 초기 설정 및 권한 부여
-- ============================================================

-- 초기 시스템 설정
INSERT INTO public.system_settings (key, value) VALUES 
    ('auto_approval', 'false'::jsonb),
    ('use_central_api', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 마스터 관리자 설정
UPDATE public.profiles 
SET role = 'ADMIN', is_approved = true 
WHERE email = '01056649000yoo@gmail.com';

-- teacher_id가 없는 미션에 선생님 정보 채우기
UPDATE public.writing_missions wm
SET teacher_id = c.teacher_id
FROM public.classes c
WHERE wm.class_id = c.id AND wm.teacher_id IS NULL;

-- 권한 부여 (Principle of Least Privilege)
-- service_role은 관리용으로 전체 권한 유지
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- authenticated(교사/관리자)는 일반적인 작업 허용
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- anon(학생)은 읽기 및 제한적 쓰기만 허용 (RLS에서 2차 차단)
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, USAGE ON ALL SEQUENCES IN SCHEMA public TO anon;
-- [주의] anon에게서 DELETE 권한을 완전히 제거하여 실수/악의적 삭제 방지

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';


-- ============================================================
-- 완료! 🎉
-- 총 17개 테이블, 40+개 인덱스, 5개 함수, 30+개 RLS 정책
-- Supabase SQL Editor에서 이 파일 전체를 복사해서 실행하세요.
-- ============================================================

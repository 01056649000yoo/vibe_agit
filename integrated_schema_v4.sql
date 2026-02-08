-- ====================================================================
-- [VIBE_TEST 통합 마스터 스키마 (Master Schema) v4.1 - Updated]
-- 작성일: 2026-02-02
-- 설명: Supabase에 적용된 모든 로직(테이블, 정책, 초기 설정)을 통합한 최종 버전입니다.
--       v4 기능 + student_records 테이블 추가 (생기부 도우미 기록 저장)
--       classes.class_name → name, student_posts에 title, is_submitted 추가
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


-- 2. 스키마 정의 (테이블 및 컬럼)
-- --------------------------------------------------------------------

-- [Profiles] 사용자 프로필
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('TEACHER', 'STUDENT', 'ADMIN')) DEFAULT 'TEACHER',
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_approved BOOLEAN DEFAULT false,
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    dragon_feed_points INTEGER DEFAULT 80,
    dragon_degen_days INTEGER DEFAULT 14,
    game_config JSONB DEFAULT '{"degenerationDays": 14, "feedCost": 80}'::JSONB,
    agit_settings JSONB DEFAULT '{"targetScore": 100, "currentTemperature": 0, "activityGoals": {"post": 1, "comment": 5, "reaction": 5}}'::JSONB,
    invite_code TEXT
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
    deleted_at TIMESTAMP WITH TIME ZONE -- v4.2 추가: 학생 Soft Delete 지원
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
    status TEXT DEFAULT 'approved', -- v4 추가: 댓글 승인 상태
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

-- 유예 기간(3일)이 지난 삭제 데이터 자동 정리를 위한 함수 (Cron 등 외부 도구에서 호출 가능)
-- 운영자가 직접 실행하거나 Supabase Edge Functions 등으로 주기적 실행 권장
CREATE OR REPLACE FUNCTION public.cleanup_expired_deletions()
RETURNS void AS $$
BEGIN
    -- 3일이 지난 학급 삭제
    DELETE FROM public.classes WHERE deleted_at < now() - interval '3 days';
    
    -- 3일이 지난 학생 삭제
    DELETE FROM public.students WHERE deleted_at < now() - interval '3 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- [Point Logs] 포인트 내역
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

-- [Feedback Reports] 의견 보내기 (버그 제보/개선 요청)
CREATE TABLE IF NOT EXISTS public.feedback_reports (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Student Records] 생기부 도우미 및 AI쫑알이 기록 저장
CREATE TABLE IF NOT EXISTS public.student_records (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE NOT NULL,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE NOT NULL,
    
    -- 기록 타입: 'record_assistant' (생기부 도우미) 또는 'ai_comment' (AI쫑알이)
    record_type TEXT DEFAULT 'record_assistant',
    
    -- 내용
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    mission_ids UUID[] DEFAULT '{}', -- AI쫑알이에서 선택한 미션 ID들
    
    -- 메타 정보
    byte_size INTEGER DEFAULT 0,
    activity_count INTEGER DEFAULT 0,
    
    -- 타임스탬프
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_student_records_student_id ON public.student_records(student_id);
CREATE INDEX IF NOT EXISTS idx_student_records_class_id ON public.student_records(class_id);
CREATE INDEX IF NOT EXISTS idx_student_records_created_at ON public.student_records(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_records_type ON public.student_records(record_type);


-- 3. 함수 정의
-- --------------------------------------------------------------------
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM profiles
    WHERE id = auth.uid()
    AND role = 'ADMIN'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 4. RLS (Row Level Security) 정책 설정
-- --------------------------------------------------------------------

-- [4-1] Profiles & Teachers
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING ( is_admin() OR auth.uid() = id );
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING ( is_admin() );
CREATE POLICY "Admins can delete profiles" ON profiles FOR DELETE USING ( is_admin() );
CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Admins can view all teachers" ON teachers FOR SELECT USING ( is_admin() OR auth.uid() = id );
CREATE POLICY "Teachers can manage own data" ON teachers FOR ALL USING (auth.uid() = id);

-- [4-2] Classes
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anyone_can_read_classes" ON classes FOR SELECT USING (true);
CREATE POLICY "teachers_manage_own_classes" ON classes FOR ALL USING (auth.uid() = teacher_id);

-- [4-3] Writing Missions
ALTER TABLE public.writing_missions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Missions are viewable by everyone" ON writing_missions FOR SELECT USING (true);
CREATE POLICY "Teachers can manage missions" ON writing_missions FOR ALL USING (
    EXISTS (SELECT 1 FROM classes c WHERE c.id = writing_missions.class_id AND c.teacher_id = auth.uid())
);

-- [4-4] Students & Activities
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to students" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to posts" ON student_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to comments" ON post_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to reactions" ON post_reactions FOR ALL USING (true) WITH CHECK (true);

-- [4-5] Point Logs
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_can_view_logs" ON point_logs FOR SELECT USING (true);
CREATE POLICY "Allow log creation" ON point_logs FOR INSERT WITH CHECK (true);

-- [4-6] System Settings
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view settings" ON public.system_settings FOR SELECT USING (true);
CREATE POLICY "Admins can update settings" ON public.system_settings FOR ALL USING (is_admin());

-- [4-7] Feedback Reports (v4 정교화된 정책)
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view_feedback_policy" ON feedback_reports FOR SELECT USING (auth.uid() = teacher_id OR is_admin());
CREATE POLICY "insert_feedback_policy" ON feedback_reports FOR INSERT WITH CHECK (auth.uid() = teacher_id);
CREATE POLICY "update_feedback_policy" ON feedback_reports FOR UPDATE USING (is_admin());
CREATE POLICY "delete_feedback_policy" ON feedback_reports FOR DELETE USING (is_admin());

-- [4-8] Student Records (생기부 도우미)
ALTER TABLE public.student_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Teachers can view their class student records" ON student_records FOR SELECT USING (
    teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid())
);
CREATE POLICY "Teachers can insert their class student records" ON student_records FOR INSERT WITH CHECK (
    teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid())
);
CREATE POLICY "Teachers can update their class student records" ON student_records FOR UPDATE USING (
    teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid())
);
CREATE POLICY "Teachers can delete their class student records" ON student_records FOR DELETE USING (
    teacher_id IN (SELECT id FROM public.teachers WHERE id = auth.uid())
);


-- 5. 초기 데이터 및 실시간 설정
-- --------------------------------------------------------------------

-- 포인트 로그 및 게시글 실시간 감지 활성화
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.point_logs;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.student_posts;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- 기본 시스템 설정값 삽입
INSERT INTO public.system_settings (key, value) VALUES 
('auto_approval', 'false'::jsonb),
('use_central_api', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- 관리자 계정 승인 (특정 이메일)
UPDATE profiles SET role = 'ADMIN', is_approved = true WHERE email = '01056649000yoo@gmail.com';

-- 권한 전체 부여
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

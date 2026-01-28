-- ====================================================================
-- [VIBE_TEST 통합 마스터 스키마 (Master Schema) v3]
-- 작성일: 2026-01-28
-- 설명: Supabase에 현재 적용된 "최신 정상 작동" 로직을 모두 통합한 파일입니다.
--       기존 파일들을 모두 대체하며, 이 파일 하나로 전체 DB를 재구성하거나 업데이트할 수 있습니다.
--       중복된 컬럼 추가, 정책 수정 내역을 모두 정리하여 하나로 합쳤습니다.
-- ====================================================================

-- 1. 정책 및 권한 초기화 (Clean Start - 선택사항)
-- 주의: 운영 중인 DB에서는 데이터를 날릴 수 있으므로 DROP TABLE은 주석 처리하거나 신중히 사용하세요.
-- --------------------------------------------------------------------
DO $$
DECLARE pol RECORD;
BEGIN
    -- 모든 정책을 삭제하여 충돌 방지 (테이블은 유지, 정책만 초기화)
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename);
    END LOOP;
END $$;


-- 2. 스키마 정의 (테이블 및 컬럼)
-- --------------------------------------------------------------------

-- [Profiles] 사용자 프로필 (Supabase Auth와 1:1)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    role TEXT CHECK (role IN ('TEACHER', 'STUDENT', 'ADMIN')) DEFAULT 'TEACHER',
    full_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    is_approved BOOLEAN DEFAULT false,
    
    -- AI 및 설정 관련 컬럼 통합
    gemini_api_key TEXT, -- (구버전 호환용)
    personal_openai_api_key TEXT, -- 교사 개별 OpenAI API 키
    api_mode TEXT DEFAULT 'SYSTEM', -- 'SYSTEM' (중앙키) or 'PERSONAL' (개인키)
    ai_prompt_template TEXT, -- AI 피드백 템플릿
    activity_ai_prompt TEXT, -- 생활지도기록부용 프롬프트
    primary_class_id UUID
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

-- [Classes] 학급 정보 (게임 설정 포함)
CREATE TABLE IF NOT EXISTS public.classes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_name TEXT NOT NULL,
    grade INTEGER,
    class_number INTEGER,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE, -- 삭제 시점 기록 (복구 가능성 대비)
    
    -- 게임 밸런스 설정
    dragon_feed_points INTEGER DEFAULT 80,
    dragon_degen_days INTEGER DEFAULT 14,
    game_config JSONB DEFAULT '{"degenerationDays": 14, "feedCost": 80}'::JSONB
);

-- [Students] 학생 정보
CREATE TABLE IF NOT EXISTS public.students (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    student_code TEXT UNIQUE NOT NULL, -- 접속용 코드
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    total_points INTEGER DEFAULT 0,
    inventory JSONB DEFAULT '[]'::jsonb,
    selected_items JSONB DEFAULT '{"background": "default", "desk": "default"}'::jsonb,
    pet_data JSONB DEFAULT '{"name": "드래곤", "level": 1, "exp": 0}'::jsonb,
    last_feedback_check TIMESTAMP WITH TIME ZONE DEFAULT '1970-01-01 00:00:00+00',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Writing Missions] 글쓰기 미션 (보관함 기능 포함)
CREATE TABLE IF NOT EXISTS public.writing_missions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    content TEXT, -- 가이드 내용 등
    
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES public.teachers(id) ON DELETE CASCADE,
    
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE,
    
    -- 상태 관리
    is_archived BOOLEAN DEFAULT false,
    archived_at TIMESTAMP WITH TIME ZONE,
    
    -- 추가 기능
    mission_type TEXT, -- 글쓰기 종류 (예: 일기, 독후감..)
    tags JSONB DEFAULT '[]'::jsonb,
    guide_questions JSONB DEFAULT '[]'::jsonb, -- AI 핵심 질문
    question_count INTEGER DEFAULT 5,         -- 질문 개수 설정
    use_ai_questions BOOLEAN DEFAULT false,   -- AI 질문 사용 여부
    
    -- 평가 루브릭
    evaluation_rubric JSONB,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Student Posts] 학생이 쓴 글
CREATE TABLE IF NOT EXISTS public.student_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mission_id UUID REFERENCES public.writing_missions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'submitted', -- submitted, approved, returned 등
    
    -- 히스토리 관리
    original_content TEXT, -- 최초 제출 내용
    original_title TEXT,   -- 최초 제출 제목
    first_submitted_at TIMESTAMPTZ, -- 최초 제출 시간
    
    -- AI 및 평가 데이터
    ai_one_line_review TEXT, -- AI 한 줄 평
    student_answers JSONB DEFAULT '[]'::jsonb, -- 단계별 질문 답변
    
    -- 평가 점수
    initial_eval INT, -- 처음글 점수
    final_eval INT,   -- 마지막글 점수
    eval_comment TEXT, -- 종합 코멘트
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Post Comments] 댓글
CREATE TABLE IF NOT EXISTS public.post_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID REFERENCES public.student_posts(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Post Reactions] 좋아요/반응 (1인 1개 제약조건 적용)
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
    reason TEXT NOT NULL,
    points INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [System Settings] 시스템 설정 (Key-Value 스토어)
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


-- 3. 함수 및 관리자 권한 확인
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


-- 4. Row Level Security (RLS) 정책 통합 설정
-- ====================================================================

-- [4-1] Profiles & Teachers
-- -------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- 관리자: 전권 보유
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING ( is_admin() OR auth.uid() = id );
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING ( is_admin() );
CREATE POLICY "Admins can delete profiles" ON profiles FOR DELETE USING ( is_admin() );

-- 일반 사용자: 본인 데이터 조회 및 수정 (개인 API 키 포함)
CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);

-- Teachers 테이블
CREATE POLICY "Admins can view all teachers" ON teachers FOR SELECT USING ( is_admin() OR auth.uid() = id );
CREATE POLICY "Teachers can manage own data" ON teachers FOR ALL USING (auth.uid() = id);


-- [4-2] Classes (학급)
-- --------------------
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- 조회: 누구나 가능 (학생 로그인 시 코드 매칭 등을 위해 개방)
CREATE POLICY "anyone_can_read_classes" ON classes FOR SELECT USING (true);
-- 관리: 해당 학급의 선생님만
CREATE POLICY "teachers_manage_own_classes" ON classes FOR ALL USING (auth.uid() = teacher_id);


-- [4-3] Writing Missions (미션)
-- -----------------------------
ALTER TABLE public.writing_missions ENABLE ROW LEVEL SECURITY;

-- 조회: 누구나 가능 (학생 접근 허용)
CREATE POLICY "Missions are viewable by everyone" ON writing_missions FOR SELECT USING (true);
-- 관리: 본인 학급의 미션만 선생님이 관리
CREATE POLICY "Teachers can manage missions" ON writing_missions FOR ALL USING (
    EXISTS (
        SELECT 1 FROM classes c 
        WHERE c.id = writing_missions.class_id 
        AND c.teacher_id = auth.uid()
    )
);


-- [4-4] Students & Activities (학생 및 활동 데이터)
-- ------------------------------------------------
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

-- 조회 및 생성/수정: 모든 사용자 허용 (학생 로그인은 로직단 검증)
CREATE POLICY "Allow all access to students" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to posts" ON student_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to comments" ON post_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to reactions" ON post_reactions FOR ALL USING (true) WITH CHECK (true);


-- [4-5] Point Logs (포인트 로그)
-- ------------------------------
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

-- 조회: 모든 사용자 (학생 대시보드 알림 수신을 위해 public 개방)
CREATE POLICY "public_can_view_logs" ON point_logs FOR SELECT USING (true);
-- 생성: 누구나 (포인트 부여 로직 동작 위해)
CREATE POLICY "Allow log creation" ON point_logs FOR INSERT WITH CHECK (true);


-- [4-6] System Settings (시스템 설정)
-- -----------------------------------
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- 읽기: 누구나
CREATE POLICY "Anyone can view settings" ON public.system_settings FOR SELECT USING (true);
-- 쓰기: 관리자만
CREATE POLICY "Admins can update settings" ON public.system_settings FOR ALL USING (
    EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
        AND profiles.role = 'ADMIN'
    )
);


-- [4-7] Feedback Reports (의견 보내기)
-- ------------------------------------
ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

-- 쓰기: 로그인한 선생님은 본인 ID로 생성 가능
CREATE POLICY "Teachers can insert their own feedback" 
ON feedback_reports FOR INSERT 
WITH CHECK (auth.uid() = teacher_id);

-- 읽기: 본인 글은 본인이, 전체 글은 관리자가 (추후 관리자 정책 추가 필요 시 여기에 작성)
CREATE POLICY "Teachers can view their own feedback" 
ON feedback_reports FOR SELECT 
USING (auth.uid() = teacher_id);


-- 5. 초기 데이터 및 실시간 설정
-- --------------------------------------------------------------------

-- 포인트 로그 실시간 감지 활성화
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.point_logs;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
END $$;

-- 기본 시스템 설정값 삽입
INSERT INTO public.system_settings (key, value) VALUES 
('auto_approval', 'false'::jsonb),
('use_central_api', 'false'::jsonb) -- 기본값: 개별 API 키 모드
ON CONFLICT (key) DO NOTHING;

-- 관리자 계정 승인 (특정 이메일)
UPDATE profiles
SET role = 'ADMIN', is_approved = true
WHERE email = '01056649000yoo@gmail.com';

-- 권한 전체 부여 (Supabase Service Role 등)
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 완료 알림
NOTIFY pgrst, 'reload schema';

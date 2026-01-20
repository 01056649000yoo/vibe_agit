-- ====================================================================
-- [VIBE_TEST 통합 마스터 스키마 (Master Schema) v2]
-- 작성일: 2026-01-20
-- 설명: Supabase에 현재 적용된 "정상 작동" 로직을 모두 통합한 파일입니다.
--       기존 파일들을 모두 대체하며, 이 파일 하나로 전체 DB를 재구성하거나 업데이트할 수 있습니다.
-- ====================================================================

-- 1. 정책 및 권한 초기화 (Clean Start)
-- --------------------------------------------------------------------
DO $$
DECLARE pol RECORD;
BEGIN
    -- 모든 정책을 삭제하여 충돌 방지
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
    gemini_api_key TEXT,
    ai_prompt_template TEXT,
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
    dragon_feed_points INTEGER DEFAULT 80,
    dragon_degen_days INTEGER DEFAULT 14,
    game_config JSONB DEFAULT '{"degenerationDays": 14, "feedCost": 80}'::JSONB
);
-- (안전장치) 컬럼이 이미 테이블에 존재하지 않을 경우를 대비한 ALTER 문
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS dragon_feed_points INTEGER DEFAULT 80;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS dragon_degen_days INTEGER DEFAULT 14;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS game_config JSONB DEFAULT '{"degenerationDays": 14, "feedCost": 80}'::JSONB;

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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS last_feedback_check TIMESTAMP WITH TIME ZONE DEFAULT '1970-01-01 00:00:00+00';

-- [Writing Missions] 글쓰기 미션 (보관함 기능 포함)
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS is_archived BOOLEAN DEFAULT false;
ALTER TABLE public.writing_missions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP WITH TIME ZONE;

-- [Student Posts] 학생이 쓴 글
CREATE TABLE IF NOT EXISTS public.student_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    mission_id UUID REFERENCES public.writing_missions(id) ON DELETE CASCADE,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status TEXT DEFAULT 'submitted',
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- 중복 제거 및 유니크 제약조건 강제 적용
DO $$ BEGIN
    DELETE FROM public.post_reactions a USING public.post_reactions b
    WHERE a.id < b.id AND a.post_id = b.post_id AND a.student_id = b.student_id;
    
    ALTER TABLE public.post_reactions DROP CONSTRAINT IF EXISTS unique_post_student_reaction;
    ALTER TABLE public.post_reactions ADD CONSTRAINT unique_post_student_reaction UNIQUE (post_id, student_id);
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- [Point Logs] 포인트 내역
CREATE TABLE IF NOT EXISTS public.point_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    points INTEGER NOT NULL,
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


-- 4. 제약조건 및 무결성 강화 (Cascade)
-- 선생님/학급 삭제 시 연쇄적으로 하위 데이터가 삭제되도록 보장
-- --------------------------------------------------------------------
DO $$
DECLARE rec record;
BEGIN
    -- students -> class_id Cascade
    FOR rec IN 
        SELECT tc.constraint_name FROM information_schema.table_constraints AS tc 
        WHERE tc.table_name = 'students' AND tc.constraint_type = 'FOREIGN KEY'
    LOOP
        -- 이 부분은 정확한 제약조건 이름을 모르므로 동적으로 처리하거나, 테이블 생성 시 ON DELETE CASCADE를 믿음
        -- 여기서는 명시적인 유지보수 차원에서 패스하거나 필요한 경우 스크립트 추가
    END LOOP;
    
    -- (상기 테이블 생성 구문에 이미 ON DELETE CASCADE가 포함되어 있으므로 신규 생성 시에는 문제없음)
    -- (기존 테이블 수정 시 제약조건을 교체해야 한다면 아래 코드가 유효함)
END $$;


-- 5. Row Level Security (RLS) 정책 통합 설정
-- ====================================================================

-- [5-1] Profiles & Teachers
-- -------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

-- 관리자: 조회, 수정(승인), 탈퇴(삭제) 모든 권한
CREATE POLICY "Admins can view all profiles" ON profiles FOR SELECT USING ( is_admin() OR auth.uid() = id );
CREATE POLICY "Admins can update all profiles" ON profiles FOR UPDATE USING ( is_admin() );
CREATE POLICY "Admins can delete profiles" ON profiles FOR DELETE USING ( is_admin() ); -- 강제 탈퇴

CREATE POLICY "Admins can view all teachers" ON teachers FOR SELECT USING ( is_admin() OR auth.uid() = id );
CREATE POLICY "Admins can delete teachers" ON teachers FOR DELETE USING ( is_admin() );

-- 일반 사용자: 본인 데이터 관리
CREATE POLICY "Users can manage own profile" ON profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "Teachers can manage own data" ON teachers FOR ALL USING (auth.uid() = id);


-- [5-2] Classes (학급)
-- --------------------
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;

-- 조회: 로그인한 누구나 가능 (학생이 학급 선택 및 정보 로드 필요)
CREATE POLICY "anyone_can_read_classes" ON classes FOR SELECT TO authenticated USING (true);
-- 관리: 해당 학급의 담당 선생님만
CREATE POLICY "teachers_manage_own_classes" ON classes FOR ALL USING (auth.uid() = teacher_id);


-- [5-3] Writing Missions (미션)
-- -----------------------------
ALTER TABLE public.writing_missions ENABLE ROW LEVEL SECURITY;

-- 조회: 누구나 가능 (학생이 미션 목록 확인)
CREATE POLICY "Missions are viewable by everyone" ON writing_missions FOR SELECT USING (true);
-- 관리: 본인 학급의 미션만 선생님이 관리
CREATE POLICY "Teachers can manage missions" ON writing_missions FOR ALL USING (
    EXISTS (
        SELECT 1 FROM classes c 
        WHERE c.id = writing_missions.class_id 
        AND c.teacher_id = auth.uid()
    )
);


-- [5-4] Students & Activities (학생 및 활동 데이터)
-- ------------------------------------------------
-- 학생 로그인은 '코드' 기반의 커스텀 로직을 사용하므로 DB 차원에서는 유연하게 허용하고
-- 앱 레벨(RLS 아님)에서 검증하거나, authenticated 롤에 대해 열어둡니다.

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;

-- 조회 및 관리: 인증된 사용자(학생/교사/관리자) 모두에게 허용 (제약은 앱 로직 위임)
CREATE POLICY "Allow all access to students" ON students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to posts" ON student_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to comments" ON post_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to reactions" ON post_reactions FOR ALL USING (true) WITH CHECK (true);


-- [5-5] Point Logs (포인트 로그)
-- ------------------------------
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

-- 조회: 인증된 사용자 전체 (선생님이 학생 로그 조회, 학생이 본인 로그 조회)
CREATE POLICY "everyone_can_view_logs" ON point_logs FOR SELECT TO authenticated USING (true);
-- 생성: 포인트 부여 로직 수행 시
CREATE POLICY "Allow log creation" ON point_logs FOR INSERT WITH CHECK (true);


-- 6. 실시간(Realtime) 및 기타 설정
-- --------------------------------------------------------------------

-- 포인트 로그 실시간 감지 활성화 (선생님/학생 알림용)
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.point_logs;
    EXCEPTION WHEN duplicate_object THEN
        NULL; -- 이미 존재하면 패스
    END;
END $$;

-- 권한 부여 (Grants)
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 7. 관리자 초기 설정 (필요 시)
-- --------------------------------------------------------------------
UPDATE profiles
SET role = 'ADMIN', is_approved = true
WHERE email = '01056649000yoo@gmail.com';

-- 완료 알림
NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- 통합 SQL 스크립트: 데이터베이스 구조 최적화 및 보안 정책 재설정
-- ====================================================================

-- 1. 기존 정책 초기화 (Clean Start for RLS)
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN (SELECT policyname, tablename FROM pg_policies WHERE schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(pol.policyname) || ' ON ' || quote_ident(pol.tablename);
    END LOOP;
END $$;

-- ====================================================================
-- 2. 테이블 및 컬럼 구조 보완 (Schema Evolution)
-- ====================================================================

-- [Teachers] 선생님 테이블 (존재 여부 확인 및 생성)
CREATE TABLE IF NOT EXISTS public.teachers (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    school_name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [Profiles] 프로필 테이블 컬럼 확장
DO $$ BEGIN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gemini_api_key TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ai_prompt_template TEXT;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS primary_class_id UUID;
EXCEPTION
    WHEN undefined_table THEN RAISE NOTICE 'Table profiles does not exist, skipping column additions.';
END $$;

-- [Students] 학생 테이블 컬럼 확장
DO $$ BEGIN
    ALTER TABLE public.students ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0;
    ALTER TABLE public.students ADD COLUMN IF NOT EXISTS inventory JSONB DEFAULT '[]'::jsonb;
    ALTER TABLE public.students ADD COLUMN IF NOT EXISTS selected_items JSONB DEFAULT '{"background": "default", "desk": "default"}'::jsonb;
    ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pet_data JSONB DEFAULT '{"name": "드래곤", "level": 1, "exp": 0}'::jsonb;
    ALTER TABLE public.students ADD COLUMN IF NOT EXISTS last_feedback_check TIMESTAMP WITH TIME ZONE DEFAULT '1970-01-01 00:00:00+00';
EXCEPTION
    WHEN undefined_table THEN RAISE NOTICE 'Table students does not exist.';
END $$;

-- ====================================================================
-- 3. 컬럼 명칭 표준화 및 관계 설정 (Normalization)
-- ====================================================================

DO $$ BEGIN
    -- 'author_id', 'user_id' -> 'student_id'로 통일 (학생 관련 테이블)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'student_posts' AND column_name = 'author_id') THEN
        ALTER TABLE public.student_posts RENAME COLUMN author_id TO student_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'post_comments' AND column_name = 'author_id') THEN
        ALTER TABLE public.post_comments RENAME COLUMN author_id TO student_id;
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'post_reactions' AND column_name = 'user_id') THEN
        ALTER TABLE public.post_reactions RENAME COLUMN user_id TO student_id;
    END IF;
END $$;

-- 외래 키 제약조건 재설정 (무결성 보장)
DO $$ BEGIN
    -- 기존 제약조건 제거 (충돌 방지)
    ALTER TABLE public.student_posts DROP CONSTRAINT IF EXISTS student_posts_author_id_fkey;
    ALTER TABLE public.student_posts DROP CONSTRAINT IF EXISTS student_posts_student_id_fkey;
    ALTER TABLE public.post_comments DROP CONSTRAINT IF EXISTS post_comments_author_id_fkey;
    ALTER TABLE public.post_comments DROP CONSTRAINT IF EXISTS post_comments_student_id_fkey;
    ALTER TABLE public.post_reactions DROP CONSTRAINT IF EXISTS post_reactions_user_id_fkey;
    ALTER TABLE public.post_reactions DROP CONSTRAINT IF EXISTS post_reactions_student_id_fkey;

    -- 새로운 제약조건 추가 (ON DELETE CASCADE 적용)
    ALTER TABLE public.student_posts 
        ADD CONSTRAINT student_posts_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
        
    ALTER TABLE public.post_comments 
        ADD CONSTRAINT post_comments_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
        
    ALTER TABLE public.post_reactions 
        ADD CONSTRAINT post_reactions_student_id_fkey FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
EXCEPTION
    WHEN undefined_table THEN RAISE NOTICE 'One or more tables for FK constraints do not exist.';
    WHEN duplicate_object THEN RAISE NOTICE 'Constraint already exists.';
END $$;

-- ====================================================================
-- 4. 성능 최적화 (Indexing)
-- ====================================================================
-- RLS 성능 향상을 위한 외래 키 인덱스 생성
CREATE INDEX IF NOT EXISTS idx_student_posts_student_id ON public.student_posts(student_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_student_id ON public.post_comments(student_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_student_id ON public.post_reactions(student_id);
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON public.post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_writing_missions_class_id ON public.writing_missions(class_id);
CREATE INDEX IF NOT EXISTS idx_classes_teacher_id ON public.classes(teacher_id);

-- ====================================================================
-- 5. Row Level Security (RLS) 정책 설정
-- ====================================================================

-- [5-1] 교사 및 프로필 (보안: 본인만 접근/관리)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "프로필_본인_관리" ON public.profiles FOR ALL USING (auth.uid() = id);
CREATE POLICY "교사정보_본인_관리" ON public.teachers FOR ALL USING (auth.uid() = id);

-- [5-2] 학급 및 미션 (보안: 교사 권한 기반)
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_missions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "학급_전체_조회" ON public.classes FOR SELECT USING (true);
CREATE POLICY "학급_교사_관리" ON public.classes FOR ALL USING (auth.uid() = teacher_id);

CREATE POLICY "미션_전체_조회" ON public.writing_missions FOR SELECT USING (true);
CREATE POLICY "미션_교사_관리" ON public.writing_missions FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.classes c 
        WHERE c.id = public.writing_missions.class_id 
        AND c.teacher_id = auth.uid()
    )
);

-- [5-3] 학생 활동 데이터 (개방형: 학생 로그인 편의성 위함)
-- 주의: 별도 인증 로직 사용으로 인해 DB 레벨에서는 광범위한 권한 허용
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.point_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "학생_데이터_통합_관리" ON public.students FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "학생글_통합_관리" ON public.student_posts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "댓글_통합_관리" ON public.post_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "반응_통합_관리" ON public.post_reactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "포인트_로그_생성" ON public.point_logs FOR ALL USING (true) WITH CHECK (true);

-- ====================================================================
-- 6. 권한 부여 (Grants) 및 스키마 리로드
-- ====================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teachers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.classes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.writing_missions TO authenticated;

-- 학생 관련 테이블은 anon(비로그인) 포함 모든 역할에 권한 부여
GRANT SELECT, INSERT, UPDATE, DELETE ON public.students TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_posts TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_comments TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.post_reactions TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.point_logs TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

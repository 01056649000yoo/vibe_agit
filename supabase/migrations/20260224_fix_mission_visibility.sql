-- ============================================================================
-- 🚀 writing_missions 테이블 컬럼 보강 및 가시성 해결
-- ============================================================================

-- 1. 누락되었을 가능성이 있는 컬럼들을 안전하게 추가합니다.
DO $$ 
BEGIN 
    -- guide (학생 안내문)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='guide') THEN
        ALTER TABLE public.writing_missions ADD COLUMN guide TEXT;
    END IF;

    -- genre (장르)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='genre') THEN
        ALTER TABLE public.writing_missions ADD COLUMN genre TEXT;
    END IF;

    -- min_chars (최소 글자수)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='min_chars') THEN
        ALTER TABLE public.writing_missions ADD COLUMN min_chars INTEGER DEFAULT 0;
    END IF;

    -- min_paragraphs (최소 문단수)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='min_paragraphs') THEN
        ALTER TABLE public.writing_missions ADD COLUMN min_paragraphs INTEGER DEFAULT 0;
    END IF;

    -- base_reward (기본 보상)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='base_reward') THEN
        ALTER TABLE public.writing_missions ADD COLUMN base_reward INTEGER DEFAULT 100;
    END IF;

    -- bonus_threshold (보너스 임계치)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='bonus_threshold') THEN
        ALTER TABLE public.writing_missions ADD COLUMN bonus_threshold INTEGER DEFAULT 300;
    END IF;

    -- bonus_reward (보너스 보상)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='bonus_reward') THEN
        ALTER TABLE public.writing_missions ADD COLUMN bonus_reward INTEGER DEFAULT 50;
    END IF;

    -- allow_comments (댓글 허용 여부)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='allow_comments') THEN
        ALTER TABLE public.writing_missions ADD COLUMN allow_comments BOOLEAN DEFAULT true;
    END IF;

    -- evaluation_rubric (평가 루브릭)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='evaluation_rubric') THEN
        ALTER TABLE public.writing_missions ADD COLUMN evaluation_rubric JSONB DEFAULT '{"use_rubric": false, "levels": []}'::jsonb;
    END IF;

    -- tags (미션 태그)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='tags') THEN
        ALTER TABLE public.writing_missions ADD COLUMN tags TEXT[] DEFAULT '{}';
    END IF;
    
    -- description -> guide 데이터 복구 (필요시)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='description') THEN
        UPDATE public.writing_missions SET guide = description WHERE guide IS NULL;
    END IF;
    
    -- mission_type -> genre 데이터 복구 (필요시)
    UPDATE public.writing_missions SET genre = mission_type WHERE genre IS NULL;

END $$;

-- 2. RLS 정책 재정의 (가시성 문제 해결)
-- 기존 정책 삭제
DROP POLICY IF EXISTS "writing_missions_access_policy" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_teacher_all" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_admin_all" ON public.writing_missions;

-- 종합 접근 정책
CREATE POLICY "writing_missions_visibility_policy" ON public.writing_missions
FOR ALL USING (
    -- 1. 관리자
    public.is_admin()
    -- 2. 해당 미션의 소유자(교사)
    OR teacher_id = auth.uid()
    -- 3. 학급의 담당 선생님 (미션의 teacher_id가 NULL이거나 다른 경우 대비)
    OR EXISTS (
        SELECT 1 FROM public.classes 
        WHERE id = public.writing_missions.class_id 
          AND (teacher_id = auth.uid())
    )
    -- 4. 해당 학급의 학생 (본인 학급 미션만 조회)
    OR EXISTS (
        SELECT 1 FROM public.students 
        WHERE class_id = public.writing_missions.class_id 
          AND auth_id = auth.uid()
    )
);

-- 3. student_posts 가시성 보강
DROP POLICY IF EXISTS "student_posts_access_policy" ON public.student_posts;

CREATE POLICY "student_posts_visibility_policy" ON public.student_posts
FOR ALL USING (
    -- 관리자
    public.is_admin()
    -- 작성자 본인
    OR EXISTS (
        SELECT 1 FROM public.students 
        WHERE id = public.student_posts.student_id 
          AND auth_id = auth.uid()
    )
    -- 담당 선생님 (미션을 통한 확인)
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        WHERE m.id = public.student_posts.mission_id
          AND (
            m.teacher_id = auth.uid() 
            OR EXISTS (SELECT 1 FROM public.classes c WHERE c.id = m.class_id AND c.teacher_id = auth.uid())
          )
    )
);

-- 4. 스키마 새로고침
NOTIFY pgrst, 'reload schema';

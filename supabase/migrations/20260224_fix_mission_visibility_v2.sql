-- ============================================================================
-- 🚀 [최종] writing_missions 가시성 및 데이터 무결성 수정 (2026-02-24)
-- ============================================================================

-- 1. 데이터 클리닝: NULL 값들을 기본값으로 채웁니다.
-- is_archived가 NULL이면 false로 설정
UPDATE public.writing_missions SET is_archived = false WHERE is_archived IS NULL;

-- mission_type이 NULL이면 '기타' 또는 genre 값으로 채움
UPDATE public.writing_missions SET mission_type = COALESCE(genre, '기타') WHERE mission_type IS NULL;

-- teacher_id가 NULL이면 학급 담당 선생님으로 채움
UPDATE public.writing_missions wm
SET teacher_id = c.teacher_id
FROM public.classes c
WHERE wm.class_id = c.id AND wm.teacher_id IS NULL;

-- 2. 새 컬럼 보강 (누락된 컬럼이 있으면 추가)
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='guide') THEN
        ALTER TABLE public.writing_missions ADD COLUMN guide TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='genre') THEN
        ALTER TABLE public.writing_missions ADD COLUMN genre TEXT;
    END IF;
    -- 기타 보상/설정 컬럼들 (이미 존재할 수도 있지만 안전하게 체크)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='min_chars') THEN
        ALTER TABLE public.writing_missions ADD COLUMN min_chars INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='min_paragraphs') THEN
        ALTER TABLE public.writing_missions ADD COLUMN min_paragraphs INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='base_reward') THEN
        ALTER TABLE public.writing_missions ADD COLUMN base_reward INTEGER DEFAULT 100;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='bonus_threshold') THEN
        ALTER TABLE public.writing_missions ADD COLUMN bonus_threshold INTEGER DEFAULT 300;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='bonus_reward') THEN
        ALTER TABLE public.writing_missions ADD COLUMN bonus_reward INTEGER DEFAULT 50;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='allow_comments') THEN
        ALTER TABLE public.writing_missions ADD COLUMN allow_comments BOOLEAN DEFAULT true;
    END IF;
END $$;

-- guide가 비어있고 description이나 content가 있는 경우 데이터 마이그레이션
UPDATE public.writing_missions SET guide = COALESCE(description, content) WHERE guide IS NULL;

-- 3. RLS 정책 재구축 (성능 및 정확성 개선)
DROP POLICY IF EXISTS "writing_missions_access_policy" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_visibility_policy" ON public.writing_missions;

-- 선생님/관리자/학생용 통합 가시성 정책
CREATE POLICY "writing_missions_access_v2" ON public.writing_missions
FOR ALL USING (
    -- 1. 관리자
    public.is_admin()
    -- 2. 담당 교사 (본인 직접 소유 또는 학급 담당)
    OR teacher_id = auth.uid()
    OR class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
    -- 3. 학급 학생 (본인 학급 미션만)
    OR class_id IN (SELECT class_id FROM public.students WHERE auth_id = auth.uid())
);

-- 4. student_posts 가시성 재구축
DROP POLICY IF EXISTS "student_posts_access_policy" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_visibility_policy" ON public.student_posts;

CREATE POLICY "student_posts_access_v2" ON public.student_posts
FOR ALL USING (
    -- 1. 관리자
    public.is_admin()
    -- 2. 학생 본인
    OR student_id IN (SELECT id FROM public.students WHERE auth_id = auth.uid())
    -- 3. 담당 교사 (미션 또는 학급을 통해 조회)
    OR mission_id IN (
        SELECT id FROM public.writing_missions 
        WHERE teacher_id = auth.uid() 
           OR class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
    )
);

-- 5. 스키마 새로고침 노티파이
NOTIFY pgrst, 'reload schema';

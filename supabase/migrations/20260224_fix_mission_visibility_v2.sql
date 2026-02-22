-- [최종 보정] writing_missions 가시성 및 데이터 보정 (안전 버전)
DO $$ 
BEGIN 
    -- 1. 기본값 채우기
    UPDATE public.writing_missions SET is_archived = false WHERE is_archived IS NULL;
    UPDATE public.writing_missions SET mission_type = COALESCE(genre, '기타') WHERE mission_type IS NULL;
    
    -- 2. 담당 선생님 ID 복구
    UPDATE public.writing_missions wm
    SET teacher_id = c.teacher_id
    FROM public.classes c
    WHERE wm.class_id = c.id AND wm.teacher_id IS NULL;

    -- 3. 누락된 컬럼 추가 (존재하지 않을 때만)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='guide') THEN
        ALTER TABLE public.writing_missions ADD COLUMN guide TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='genre') THEN
        ALTER TABLE public.writing_missions ADD COLUMN genre TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='min_chars') THEN
        ALTER TABLE public.writing_missions ADD COLUMN min_chars INTEGER DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='base_reward') THEN
        ALTER TABLE public.writing_missions ADD COLUMN base_reward INTEGER DEFAULT 100;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='allow_comments') THEN
        ALTER TABLE public.writing_missions ADD COLUMN allow_comments BOOLEAN DEFAULT true;
    END IF;

    -- 4. 데이터 이전 (컬럼 존재 여부 확인 후 안전하게 실행)
    -- description 컬럼이 있다면 guide로 복사
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='description') THEN
        EXECUTE 'UPDATE public.writing_missions SET guide = description WHERE guide IS NULL';
    END IF;
    -- content 컬럼이 있다면 guide로 복사 (description이 없을 경우 대비)
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='content') THEN
        EXECUTE 'UPDATE public.writing_missions SET guide = COALESCE(guide, content) WHERE guide IS NULL';
    END IF;

END $$;

-- 5. RLS 정책 재구축 (기존 정책 모두 정리)
DROP POLICY IF EXISTS "writing_missions_access_policy" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_visibility_policy" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_access_v2" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_access_v3" ON public.writing_missions;

CREATE POLICY "writing_missions_access_v4" ON public.writing_missions
FOR ALL USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
);

DROP POLICY IF EXISTS "student_posts_access_policy" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_visibility_policy" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_access_v2" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_access_v3" ON public.student_posts;

CREATE POLICY "student_posts_access_v4" ON public.student_posts
FOR ALL USING (
    public.is_admin()
    OR student_id IN (SELECT id FROM public.students WHERE auth_id = auth.uid())
    OR mission_id IN (
        SELECT id FROM public.writing_missions 
        WHERE teacher_id = auth.uid() 
           OR class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid())
    )
);

-- 스키마 새로고침 노티파이
NOTIFY pgrst, 'reload schema';

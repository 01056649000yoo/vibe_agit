-- ============================================================================
-- 🚀 [최종 보전] 가시성 결함 완전 해결 (2026-02-24 rev.3)
-- ============================================================================

-- 1. 테이블 구조 안전 보강 (개별 블록으로 실행하여 오류 시 단계적 파악)
-- guide 컬럼 추가
DO $$ BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='guide') THEN
        ALTER TABLE public.writing_missions ADD COLUMN guide TEXT;
    END IF;
END $$;

-- genre 컬럼 추가
DO $$ BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='genre') THEN
        ALTER TABLE public.writing_missions ADD COLUMN genre TEXT;
    END IF;
END $$;

-- mission_type 컬럼 추가 (확인을 위해)
DO $$ BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='mission_type') THEN
        ALTER TABLE public.writing_missions ADD COLUMN mission_type TEXT;
    END IF;
END $$;

-- 2. 데이터 보정 (NULL 값 해결 및 소유권 복구)
-- is_archived 기본값 설정 (가장 중요: NULL이면 조회가 안 됨)
UPDATE public.writing_missions SET is_archived = false WHERE is_archived IS NULL;

-- teacher_id 복구 (담당 선생님 연결)
UPDATE public.writing_missions wm
SET teacher_id = c.teacher_id
FROM public.classes c
WHERE wm.class_id = c.id AND wm.teacher_id IS NULL;

-- mission_type 보정 (UI 필터링 오류 방지)
UPDATE public.writing_missions SET mission_type = '기타' WHERE mission_type IS NULL AND (genre IS NULL OR genre = '');
UPDATE public.writing_missions SET mission_type = genre WHERE mission_type IS NULL AND genre IS NOT NULL;
UPDATE public.writing_missions SET genre = mission_type WHERE genre IS NULL AND mission_type IS NOT NULL;

-- 3. 데이터 가이드/내용 통합 (UI에서 '내용'이 안 보이는 문제 해결)
-- description 이나 content 컬럼에 데이터가 있으면 guide로 통합
DO $$ BEGIN 
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='description') THEN
        EXECUTE 'UPDATE public.writing_missions SET guide = description WHERE guide IS NULL';
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='writing_missions' AND column_name='content') THEN
        EXECUTE 'UPDATE public.writing_missions SET guide = COALESCE(guide, content) WHERE guide IS NULL';
    END IF;
END $$;

-- 4. RLS 정책 재구축 (가장 강력한 버전)
-- 기존 정책 완전 삭제
DROP POLICY IF EXISTS "writing_missions_access_v4" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_access_v3" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_access_v2" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_visibility_policy" ON public.writing_missions;
DROP POLICY IF EXISTS "writing_missions_access_policy" ON public.writing_missions;

-- 선생님 권한: 본인 소유 미션 OR 본인 학급 미션은 무조건 권한 부여
CREATE POLICY "writing_missions_final_v1" ON public.writing_missions
FOR ALL USING (
    public.is_admin()
    OR teacher_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.classes WHERE id = public.writing_missions.class_id AND teacher_id = auth.uid())
);

-- 게시글 권한: 본인 글 OR 담당 교사 글은 무조건 권한 부여
DROP POLICY IF EXISTS "student_posts_access_v4" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_access_v3" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_access_v2" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_visibility_policy" ON public.student_posts;
DROP POLICY IF EXISTS "student_posts_access_policy" ON public.student_posts;

CREATE POLICY "student_posts_final_v1" ON public.student_posts
FOR ALL USING (
    public.is_admin()
    -- 학생 본인
    OR EXISTS (SELECT 1 FROM public.students s WHERE s.id = student_id AND s.auth_id = auth.uid())
    -- 담당 교사 (미션 소유자 또는 학급 담당자)
    OR EXISTS (
        SELECT 1 FROM public.writing_missions m
        LEFT JOIN public.classes c ON c.id = m.class_id
        WHERE m.id = mission_id 
          AND (m.teacher_id = auth.uid() OR c.teacher_id = auth.uid())
    )
);

-- 5. 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';

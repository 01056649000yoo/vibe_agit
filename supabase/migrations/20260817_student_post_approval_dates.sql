-- ============================================================================
-- 학생 글 승인일 정식 기록 + 안전한 교사용 내보내기 조회
--
-- 기존에는 승인 여부(is_confirmed)만 student_posts에 남고 승인 시각은 포인트
-- 로그로만 간접 추적할 수 있었다. approved_at을 정식 필드로 두고 상태 전환을
-- DB 트리거가 관리해 단건/일괄/향후 승인 경로가 모두 같은 규칙을 사용하게 한다.
-- ============================================================================

BEGIN;

ALTER TABLE public.student_posts
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

COMMENT ON COLUMN public.student_posts.approved_at IS
    '현재 승인 상태가 된 시각. 승인 취소·다시쓰기·재제출로 미승인 상태가 되면 NULL, 재승인하면 새 시각을 기록한다.';

-- 현재 승인된 과거 글은 post_id가 연결된 가장 최근 양수 승인 로그로 복원한다.
-- 일괄 승인과 단건 승인의 문구가 달라 공통 단어인 "승인"을 사용하되,
-- post_id가 있고 양수인 로그만 대상으로 삼아 회수·교사 조정 기록을 제외한다.
WITH latest_approval AS (
    SELECT
        l.post_id,
        MAX(l.created_at) AS approved_at
    FROM public.point_logs l
    WHERE l.post_id IS NOT NULL
      AND l.amount > 0
      AND l.reason ILIKE '%승인%'
    GROUP BY l.post_id
)
UPDATE public.student_posts p
SET approved_at = a.approved_at
FROM latest_approval a
WHERE p.id = a.post_id
  AND p.is_confirmed IS TRUE
  AND p.approved_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_student_post_approved_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF COALESCE(NEW.is_confirmed, false) THEN
            NEW.approved_at := clock_timestamp();
        ELSIF NOT COALESCE(NEW.is_confirmed, false) THEN
            NEW.approved_at := NULL;
        END IF;
        RETURN NEW;
    END IF;

    IF COALESCE(NEW.is_confirmed, false)
       AND NOT COALESCE(OLD.is_confirmed, false) THEN
        NEW.approved_at := clock_timestamp();
    ELSIF NOT COALESCE(NEW.is_confirmed, false)
          AND COALESCE(OLD.is_confirmed, false) THEN
        NEW.approved_at := NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_student_posts_approved_at_insert
    ON public.student_posts;
CREATE TRIGGER trg_student_posts_approved_at_insert
BEFORE INSERT ON public.student_posts
FOR EACH ROW
EXECUTE FUNCTION public.sync_student_post_approved_at();

DROP TRIGGER IF EXISTS trg_student_posts_approved_at_update
    ON public.student_posts;
CREATE TRIGGER trg_student_posts_approved_at_update
BEFORE UPDATE OF is_confirmed ON public.student_posts
FOR EACH ROW
EXECUTE FUNCTION public.sync_student_post_approved_at();

ALTER TABLE public.student_posts
    DROP CONSTRAINT IF EXISTS student_posts_approved_at_requires_confirmation;
ALTER TABLE public.student_posts
    ADD CONSTRAINT student_posts_approved_at_requires_confirmation
    CHECK (approved_at IS NULL OR is_confirmed IS TRUE);

-- 내보내기는 student_posts.class_id로 학급을 직접 좁히고, 학급 테이블끼리의
-- 조인에도 class_id를 포함한다. 화면이 여러 테이블을 따로 읽지 않도록 한 번에 반환한다.
CREATE OR REPLACE FUNCTION public.get_writing_export_data(
    p_class_id UUID,
    p_type TEXT,
    p_target_id UUID
)
RETURNS TABLE (
    post_id UUID,
    student_id UUID,
    mission_id UUID,
    student_name TEXT,
    student_code TEXT,
    student_created_at TIMESTAMPTZ,
    mission_title TEXT,
    post_title TEXT,
    content TEXT,
    is_confirmed BOOLEAN,
    approved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM public.classes c
        WHERE c.id = p_class_id
          AND c.teacher_id = auth.uid()
    ) AND NOT EXISTS (
        SELECT 1
        FROM public.profiles profile
        WHERE profile.id = auth.uid()
          AND profile.role = 'ADMIN'
    ) THEN
        RAISE EXCEPTION '이 학급의 글을 내보낼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF p_type NOT IN ('student', 'mission') THEN
        RAISE EXCEPTION '지원하지 않는 내보내기 유형입니다.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY
    SELECT
        p.id,
        p.student_id,
        p.mission_id,
        s.name,
        s.student_code,
        s.created_at,
        m.title,
        p.title,
        p.content,
        p.is_confirmed,
        p.approved_at
    FROM public.student_posts p
    JOIN public.students s
      ON s.id = p.student_id
     AND s.class_id = p.class_id
    JOIN public.writing_missions m
      ON m.id = p.mission_id
     AND m.class_id = p.class_id
    WHERE p.class_id = p_class_id
      AND p.is_submitted IS TRUE
      AND (
          (p_type = 'student' AND p.student_id = p_target_id)
          OR (p_type = 'mission' AND p.mission_id = p_target_id)
      )
    ORDER BY p.created_at, p.id
    LIMIT 5000;
END;
$$;

REVOKE ALL ON FUNCTION public.get_writing_export_data(UUID, TEXT, UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_writing_export_data(UUID, TEXT, UUID)
    TO authenticated;

COMMIT;

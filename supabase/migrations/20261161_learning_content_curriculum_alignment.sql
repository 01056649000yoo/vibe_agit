-- 공통 학습 콘텐츠에서 교육과정 기준과 실제 제공 학년군을 분리한다.
--
-- 속담·사자성어 185개는 2022 개정 국어과 5~6학년군의 관용 표현 학습을 기준점으로 삼되,
-- 쉬운 일부 항목은 3~4학년도 미리 만날 수 있다. 이를 grade_bands 하나에 함께 담으면
-- "교육과정 귀속"과 "제공 가능 범위"가 섞이므로 별도 열과 승격 제약을 둔다.

BEGIN;

ALTER TABLE public.learning_content_items
    ADD COLUMN IF NOT EXISTS curriculum_band TEXT,
    ADD COLUMN IF NOT EXISTS curriculum_role TEXT;

ALTER TABLE public.learning_content_items
    DROP CONSTRAINT IF EXISTS learning_content_items_curriculum_band_check,
    ADD CONSTRAINT learning_content_items_curriculum_band_check
        CHECK (curriculum_band IS NULL OR curriculum_band = ANY (ARRAY['g34', 'g56'])),
    DROP CONSTRAINT IF EXISTS learning_content_items_curriculum_role_check,
    ADD CONSTRAINT learning_content_items_curriculum_role_check
        CHECK (curriculum_role IS NULL OR curriculum_role = ANY (ARRAY['aligned', 'enrichment'])),
    DROP CONSTRAINT IF EXISTS learning_content_items_publish_ready_check,
    ADD CONSTRAINT learning_content_items_publish_ready_check
        CHECK (
            review_status <> 'published'
            OR (
                curriculum_band IS NOT NULL
                AND curriculum_role IS NOT NULL
                AND cardinality(grade_bands) > 0
                AND content_level IS NOT NULL
                AND cardinality(review_flags) = 0
            )
        );

CREATE INDEX IF NOT EXISTS learning_content_items_curriculum_idx
    ON public.learning_content_items (curriculum_band, curriculum_role, content_type, item_key)
    WHERE review_status = 'published';

COMMENT ON COLUMN public.learning_content_items.curriculum_band IS
    '교육과정 기준 학년군. 실제 제공 가능 학년군인 grade_bands와 분리한다.';
COMMENT ON COLUMN public.learning_content_items.curriculum_role IS
    'aligned=교육과정 성취기준과 직접 연결, enrichment=해당 학습을 돕는 확장 자료.';
COMMENT ON COLUMN public.learning_content_items.grade_bands IS
    '실제 학생 제공 가능 학년군. 교육과정 귀속은 curriculum_band를 사용한다.';

COMMIT;

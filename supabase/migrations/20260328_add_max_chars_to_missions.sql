-- writing_missions 테이블에 max_chars 컬럼 추가
-- min_chars와 쌍으로 사용되는 최대 글자 수 제한 컬럼

ALTER TABLE public.writing_missions
    ADD COLUMN IF NOT EXISTS max_chars INTEGER DEFAULT NULL;

COMMENT ON COLUMN public.writing_missions.max_chars IS '글쓰기 미션 최대 글자 수 제한 (NULL이면 제한 없음)';

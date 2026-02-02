-- ====================================================================
-- 초대코드 시스템 제거를 위한 데이터베이스 마이그레이션
-- ====================================================================

-- classes 테이블에서 invite_code 컬럼 제거
ALTER TABLE public.classes DROP COLUMN IF EXISTS invite_code;

-- 확인: classes 테이블 구조 보기
-- \d public.classes

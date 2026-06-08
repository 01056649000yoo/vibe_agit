-- ============================================================================
-- 신규 가입 교사의 기본 api_mode를 공용(SYSTEM)으로 변경
-- 작성일: 2026-06-08
-- 설명:
--   profiles.api_mode 컬럼 기본값을 'SYSTEM'으로 설정.
--   기존 행에는 영향 없음(컬럼 DEFAULT는 새 INSERT에만 적용).
--   클라이언트의 setup_teacher_profile 호출은 명시적으로 'SYSTEM'을
--   전달하므로 통상 경로에서는 이 DEFAULT가 사용되지 않지만,
--   다른 경로의 INSERT(직접 INSERT, 향후 RPC 변경 등) 대비 방어선.
-- 비고:
--   setup_teacher_profile RPC 파라미터 기본값(p_api_mode)도 함께 'SYSTEM'으로
--   변경하려면 운영 DB에서 현재 함수 본문(pg_get_functiondef)을 확인 후
--   CREATE OR REPLACE 별도 적용 필요.
-- ============================================================================

ALTER TABLE public.profiles
    ALTER COLUMN api_mode SET DEFAULT 'SYSTEM';

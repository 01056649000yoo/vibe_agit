-- Stage 3a: 학급별 모듈 on/off 설정
-- 기존 개별 플래그(vocab_tower_enabled 등)는 그대로 두고, 모듈 이전 시 하나씩 이 컬럼으로 흡수한다.
-- NULL = 아직 설정 안 함 → 각 모듈의 defaultEnabled를 따름 (기존 동작 보존).
ALTER TABLE public.classes
  ADD COLUMN IF NOT EXISTS enabled_modules text[] DEFAULT NULL;

COMMENT ON COLUMN public.classes.enabled_modules IS
  '학급에서 켜진 기능 모듈 id 목록 (src/modules/registry.js). NULL이면 모듈별 defaultEnabled 적용.';

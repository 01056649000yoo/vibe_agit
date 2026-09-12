-- ============================================================================
-- 🧭 교사 동행 모드(튜토리얼) 진행 상태
-- 작성일: 2026-09-13
--
-- 목적: 가입 직후 "학급 만들기 → 학생 등록 → 글쓰기 설정" 을 실제로 따라 하도록
--       옆에 붙어 다니는 안내 패널의 진행 위치를 남긴다.
--
-- 왜 브라우저(localStorage)가 아니라 DB 인가:
--   교사는 학교 컴퓨터와 집 컴퓨터를 오간다. 학교 공용 PC 는 기록이 지워진다.
--   진행 위치가 기기에 묶이면 "어제 하다 만 자리"로 못 돌아온다.
--
-- 왜 새 표를 만들지 않았나:
--   `profiles.notice_templates`·`feedback_phrases` 와 소유자·수명·크기가 같다.
--   교사 한 명의 짧은 기록이고 다른 곳에서 join 하지 않는다. profiles 는 이미
--   본인만 읽고 쓰도록 잠겨 있어(Profiles_*_V18) RLS 정책이 늘지 않는다.
--
-- 모양의 원본은 화면 코드다: `src/guides/teacherTour.js` 의 normalizeTourState.
--   { version: 1, tours: { "<tourId>": { status, stepId, completed[], updatedAt } } }
--   DB 는 "객체인가" 와 "tours 가 객체인가" 까지만 본다. 단계 이름은 화면이 바뀌면
--   같이 바뀌므로 DB 가 붙들면 화면 개편 때마다 마이그레이션이 따라붙는다.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS teacher_tour_state JSONB NOT NULL DEFAULT '{}'::JSONB;

COMMENT ON COLUMN public.profiles.teacher_tour_state IS
    '교사 동행 모드 진행 상태({version, tours}). 모양의 원본은 src/guides/teacherTour.js.';

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_teacher_tour_state_shape;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_teacher_tour_state_shape CHECK (
        jsonb_typeof(teacher_tour_state) = 'object'
        AND (
            NOT (teacher_tour_state ? 'tours')
            OR jsonb_typeof(teacher_tour_state -> 'tours') = 'object'
        )
    );

COMMIT;

NOTIFY pgrst, 'reload schema';

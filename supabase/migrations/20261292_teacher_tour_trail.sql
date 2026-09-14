-- ============================================================================
-- 🧭 동행 모드 발자국: 크기 한도
-- 작성일: 2026-09-14
--
-- 왜: 상태(`tours`)만으로는 "지금 어디에 서 있나" 까지만 안다. 이틀치를 보니 학생 등록
--     앞뒤에서 절반이 멈추는데, 얼마나 붙들다 멈췄는지·건너뛰기를 눌렀는지 그냥 나갔는지를
--     알 수 없어 고칠 자리를 못 찾는다. 그래서 단계마다 **무엇을 했는지**를 남긴다.
--
-- 무엇이 담기나: 단계 이름 · 시각 · 한 낱말(start/next/skip/back/stop/done/welcome) 뿐이다.
--     글·이름 같은 내용은 담지 않는다. 모양의 원본은 `src/guides/teacherTour.js` 다.
--
-- 이 마이그레이션이 하는 일은 **크기를 묶는 것**뿐이다. 화면이 최근 40걸음만 두지만,
--     그 규칙은 화면 코드에 있다. 프로필은 로그인할 때마다 통째로 읽는 열이라, 여기서도
--     한 번 더 막아 둔다 — 화면이 잘못 자라면 모든 교사의 로그인이 함께 무거워진다.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_teacher_tour_state_shape;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_teacher_tour_state_shape CHECK (
        jsonb_typeof(teacher_tour_state) = 'object'
        AND (
            NOT (teacher_tour_state ? 'tours')
            OR jsonb_typeof(teacher_tour_state -> 'tours') = 'object'
        )
        AND (
            NOT (teacher_tour_state ? 'trail')
            OR jsonb_typeof(teacher_tour_state -> 'trail') = 'array'
        )
        -- 40걸음이면 4KB 안쪽이다. 16KB 는 그 네 배로, 잘못 자라는 것만 막는 선이다.
        AND octet_length(teacher_tour_state::TEXT) <= 16384
    );

COMMENT ON COLUMN public.profiles.teacher_tour_state IS
    '교사 동행 모드 진행 상태({version, tours, trail}). 발자국은 단계·시각·행동뿐이며 모양의 원본은 src/guides/teacherTour.js.';

COMMIT;

NOTIFY pgrst, 'reload schema';

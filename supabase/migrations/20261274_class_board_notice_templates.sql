-- ============================================================================
-- 📋 알림장 서식 (서식 1·2·3)
-- 작성일: 2026-09-09
--
-- 목적: 알림장은 날마다 새로 쓰지만 뼈대는 거의 같다("오늘 배운 것 / 준비물 / 알림").
--       되풀이해 쓰는 틀을 세 칸에 저장해 두고 불러와 고쳐 쓴다.
--
-- 왜 새 표를 만들지 않았나:
--   `profiles.feedback_phrases`(자주 쓰는 피드백 문장)와 소유자·수명·크기가 같다.
--   교사 한 명의 짧은 목록일 뿐이고 다른 곳에서 join 하지 않는다. 새 표를 만들면
--   RLS 정책·권한 부여가 그만큼 늘어나는데, profiles 는 이미 본인만 읽고 쓰도록
--   잠겨 있다(Profiles_*_V18). role·승인 상태를 지키는 trg_guard_profile_authority_fields
--   도 이 열과 무관하게 그대로 돈다.
--
--   **학급이 아니라 교사에 붙인다.** 서식은 학급 자료가 아니라 그 선생님의 글 습관이라,
--   학급을 옮기거나 여러 학급을 맡아도 그대로 따라가야 한다.
--
-- 한도의 원본은 화면 코드다:
--   `src/modules/tool/class-board/widgets/notice-board/noticeTemplates.js` 의
--   NOTICE_TEMPLATE_SLOTS(3). 아래 CHECK 의 3 과 같은 값이어야 하고,
--   `tests/classBoardNoticeTemplates.test.mjs` 가 두 곳을 한꺼번에 본다.
--   이름·본문 길이는 jsonpath 로 셀 수 없어(문자열 길이 함수가 없다) 화면에서 지킨다.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS notice_templates JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.profiles.notice_templates IS
    '교사가 저장한 알림장 서식 3칸([{name, body}]). 한도 원본은 src/modules/tool/class-board/widgets/notice-board/noticeTemplates.js.';

-- 형태만 DB 가 지킨다: 배열이어야 하고, 3칸 이하이고, 모든 원소가 문자열 name·body 를 가진 객체여야 한다.
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_notice_templates_shape;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_notice_templates_shape CHECK (
        jsonb_typeof(notice_templates) = 'array'
        AND jsonb_array_length(notice_templates) <= 3
        AND NOT (notice_templates @? '$[*] ? (@.type() != "object")')
        AND NOT (notice_templates @? '$[*].name ? (@.type() != "string")')
        AND NOT (notice_templates @? '$[*].body ? (@.type() != "string")')
    );

COMMIT;

NOTIFY pgrst, 'reload schema';

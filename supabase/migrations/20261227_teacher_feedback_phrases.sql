-- ============================================================================
-- 📌 자주 쓰는 피드백 문장 (다시 쓰기 지시문)
-- 작성일: 2026-09-02
--
-- 목적: 교사가 되풀이해 쓰는 지시문("문단을 나눠서 다시 제출하세요")을 저장해 두고
--       골라서 다시 쓰기 요청에 붙인다. AI 피드백과 **나란한 두 번째 갈래**다.
--
-- 왜 새 표를 만들지 않았나:
--   `profiles.frequent_tags`(자주 쓰는 태그)와 소유자·수명·크기가 같다. 교사 한 명의 짧은
--   문자열 목록일 뿐이고 다른 곳에서 join 하지 않는다. 새 표를 만들면 RLS 정책·권한 부여가
--   그만큼 늘어나는데, profiles 는 이미 본인만 읽고 쓰도록 잠겨 있다(Profiles_*_V18).
--   role·승인 상태를 지키는 trg_guard_profile_authority_fields 도 이 열과 무관하게 그대로 돈다.
--
-- 한도의 원본은 화면 코드다:
--   `src/constants/feedbackPhrases.js` 의 MAX_FEEDBACK_PHRASES(20) ·
--   MAX_FEEDBACK_PHRASE_LENGTH(200). 아래 CHECK 의 20 과 같은 값이어야 하고,
--   `tests/teacherFeedbackPhrases.test.mjs` 가 두 곳을 한꺼번에 본다.
--   문장 길이는 jsonpath 로 셀 수 없어(문자열 길이 함수가 없다) 화면에서 지킨다.
-- ============================================================================

BEGIN;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS feedback_phrases JSONB NOT NULL DEFAULT '[]'::JSONB;

COMMENT ON COLUMN public.profiles.feedback_phrases IS
    '교사가 저장한 자주 쓰는 다시쓰기 지시문(문자열 배열). 한도 원본은 src/constants/feedbackPhrases.js.';

-- 형태만 DB 가 지킨다: 배열이어야 하고, 20개 이하이고, 모든 원소가 문자열이어야 한다.
ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_feedback_phrases_shape;

ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_feedback_phrases_shape CHECK (
        jsonb_typeof(feedback_phrases) = 'array'
        AND jsonb_array_length(feedback_phrases) <= 20
        AND NOT (feedback_phrases @? '$[*] ? (@.type() != "string")')
    );

COMMIT;

NOTIFY pgrst, 'reload schema';

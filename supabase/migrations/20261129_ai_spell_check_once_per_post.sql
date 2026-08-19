-- 글 한 편에 한 번만 쓰는 AI 맞춤법 검사 (2026-08-19)
--
-- 실시간 밑줄은 기기 안 500개 규칙 그대로 두고, "다 쓰고 한 번 검사"만 AI 로 한다.
-- **횟수 제한은 반드시 서버가 쥔다.** 화면에서만 막으면 새로고침으로 뚫린다.
--
-- ⚠️ 새 열을 서버 소유 열 가드에 함께 넣는다. 넣지 않으면 학생이 자기 글 행에
--    `spell_check_used_at = null` 을 직접 PATCH 해 무제한으로 쓸 수 있다 —
--    2026-08-17에 `awarded_*` 로 실제 재현했던 것과 같은 구멍이다.
--    가드는 SECURITY INVOKER 여야 current_user 로 직접 쓰기와 신뢰 RPC 를 구분한다.

BEGIN;

ALTER TABLE public.student_posts
    ADD COLUMN IF NOT EXISTS spell_check_used_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS spell_check_result JSONB;

COMMENT ON COLUMN public.student_posts.spell_check_used_at IS
    'AI 맞춤법 검사를 쓴 시각. 글 한 편에 한 번만 쓴다. 서버(Edge Function)만 채운다.';
COMMENT ON COLUMN public.student_posts.spell_check_result IS
    'AI 맞춤법 검사 결과(제안 목록). 학생이 다시 열어도 같은 결과를 보여 주어 재요청을 막는다.';

CREATE OR REPLACE FUNCTION public.guard_student_post_server_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    -- 신뢰 경로: 제출·승인·독서록·일기 RPC는 SECURITY DEFINER 라 current_user 가 정의자 롤이다.
    -- Edge Function 은 service_role 로 붙으므로 여기서 함께 통과한다.
    IF current_user <> 'authenticated' THEN
        RETURN NEW;
    END IF;

    -- 교사·관리자는 학급 글의 승인·반려·수정을 직접 처리하는 화면이 있어 대상이 아니다.
    IF public.auth_user_role() IS DISTINCT FROM 'STUDENT' THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- 새 초안은 아직 아무 약속도 받지 않은 상태여야 한다. 제출 RPC 가 미션 값으로 채운다.
        NEW.awarded_base_reward := NULL;
        NEW.awarded_bonus_reward := NULL;
        NEW.awarded_bonus_threshold := NULL;
        NEW.is_submitted := false;
        NEW.is_returned := false;
        NEW.is_confirmed := false;
        NEW.spell_check_used_at := NULL;
        NEW.spell_check_result := NULL;
    ELSE
        -- 임시저장은 제목·본문·답변만 바꾼다. 상태와 보상, 검사 사용 여부는 서버가 쥔 값을 유지한다.
        NEW.awarded_base_reward := OLD.awarded_base_reward;
        NEW.awarded_bonus_reward := OLD.awarded_bonus_reward;
        NEW.awarded_bonus_threshold := OLD.awarded_bonus_threshold;
        NEW.is_submitted := OLD.is_submitted;
        NEW.is_returned := OLD.is_returned;
        NEW.is_confirmed := OLD.is_confirmed;
        NEW.spell_check_used_at := OLD.spell_check_used_at;
        NEW.spell_check_result := OLD.spell_check_result;
    END IF;

    -- 보너스 지급 조건이 char_count 를 보므로 클라이언트 값을 믿지 않고 다시 센다.
    -- 제출 RPC(writing_engine_submit_assignment)와 같은 함수를 써서 기준을 일치시킨다.
    NEW.char_count := public.writing_content_char_count(COALESCE(NEW.content, ''));

    RETURN NEW;
END;
$$;

COMMIT;

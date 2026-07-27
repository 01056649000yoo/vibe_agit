-- ============================================================================
-- 🗂️ AI 프롬프트 규칙 보관함 (이름 붙인 프리셋)
-- 작성일: 2026-07-28
--
-- 목적: 교사가 피드백/평어 규칙을 여러 개 이름 붙여 저장해두고 필요할 때 불러 쓴다.
--       (예: "3학년 다정한 말투", "고학년 맞춤법 중심", "시 쓰기 전용")
--
-- 설계 원칙 — 코어 셸 불변(ROADMAP 대원칙 4):
--   **지금 적용 중인 규칙은 기존처럼 `profiles.ai_prompt_template` 에 그대로 둔다.**
--   AI 피드백 생성 경로(useMissionManager)는 생성 시점에 그 컬럼을 읽으므로 손대지 않는다.
--   이 테이블은 "보관함"일 뿐이고, 프리셋을 적용하면 그 내용이 profiles 로 복사된다.
--   → 규칙을 고치지 않으면 동작이 지금과 완전히 동일하다.
--
-- 보안 — 2026-07-27 점검에서 배운 것 적용:
--   * SECURITY DEFINER 함수를 만들지 않는다. RLS 만으로 충분한 단순 테이블이다.
--   * anon 에게는 테이블 권한을 주지 않는다(Supabase 기본 부여를 명시적으로 회수).
--   * 소유자 본인만 읽고 쓴다.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ai_prompt_presets (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- 'feedback' = 학생 AI 피드백 / 'report' = 글쓰기 평어 덧붙임
    kind        TEXT NOT NULL CHECK (kind IN ('feedback', 'report')),
    name        TEXT NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 40),
    content     TEXT NOT NULL,
    -- 현재 적용 중 표시용. 실제로 실행되는 값은 profiles.ai_prompt_template 이다.
    is_active   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.ai_prompt_presets IS
    '교사별 AI 프롬프트 규칙 보관함. 실제 실행되는 값은 profiles.ai_prompt_template 이며 이 테이블은 이름 붙인 사본 모음이다.';

-- 같은 교사가 같은 종류에서 이름을 중복 저장하지 못하게 (대소문자·공백 무시)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_presets_unique_name
    ON public.ai_prompt_presets (teacher_id, kind, lower(btrim(name)));

-- 종류별로 활성 프리셋은 하나만
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_prompt_presets_one_active
    ON public.ai_prompt_presets (teacher_id, kind) WHERE is_active;

CREATE INDEX IF NOT EXISTS idx_ai_prompt_presets_owner
    ON public.ai_prompt_presets (teacher_id, kind, created_at DESC);

-- updated_at 자동 갱신
CREATE OR REPLACE FUNCTION public.set_ai_prompt_presets_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_prompt_presets_updated_at ON public.ai_prompt_presets;
CREATE TRIGGER trg_ai_prompt_presets_updated_at
    BEFORE UPDATE ON public.ai_prompt_presets
    FOR EACH ROW EXECUTE FUNCTION public.set_ai_prompt_presets_updated_at();

-- ----------------------------------------------------------------------------
-- RLS — 본인 것만
-- ----------------------------------------------------------------------------
ALTER TABLE public.ai_prompt_presets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Prompt_Presets_Owner" ON public.ai_prompt_presets;
CREATE POLICY "Prompt_Presets_Owner" ON public.ai_prompt_presets
    FOR ALL TO authenticated
    USING (teacher_id = auth.uid())
    WITH CHECK (teacher_id = auth.uid());

-- ----------------------------------------------------------------------------
-- 권한 — 비로그인은 접근 불가
-- (Supabase 기본 부여가 있으므로 PUBLIC·anon 양쪽에서 명시적으로 회수한다)
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE public.ai_prompt_presets FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.ai_prompt_presets TO authenticated;
GRANT ALL ON TABLE public.ai_prompt_presets TO service_role;

REVOKE ALL ON FUNCTION public.set_ai_prompt_presets_updated_at() FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

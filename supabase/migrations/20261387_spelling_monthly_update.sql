-- ============================================================================
-- 🗓️ 맞춤법 한 달 자동 업데이트(2026-10-09, 선생님 결정 — 빨간 물결·회색 점선이 놓친 맞춤법을 한 달에 한 번 모아 자동 반영)
--
-- 매달 1일 맥미니 밤 작업(scripts/spelling-monthly-update.mjs)이 지난달 자료를 모은다:
--   ① 회색 점선에서 학생이 `이렇게 고치기` 를 많이 고른 것(spelling_gray_feedback)
--   ② 회색 점선 자리를 학생·선생님이 나중에 제안대로 고친 것(spelling_shadow_suggestions)
--   ③ 선생님이 직접 고쳐 줬는데 두 줄 모두 놓친 것(student_post_teacher_edits)
-- 엄격한 관문(여러 학급·여러 번·사전 확인·학생 글 전체 모의 실행 오탐 0)을 지난 것만 공통 자료(빨간 물결)로 자동 게시하고
-- source_kind='monthly' 로 표시한다 — 관리자 화면에서 하나씩 끌 수 있고, 한 달 치를 한꺼번에 끌 수도 있다.
-- 관문을 못 지난 것은 '보류' 로 남겨 관리자가 본다. 학생·학급 식별자와 글 원문은 남기지 않는다(어절 조각·횟수만).
-- ============================================================================

BEGIN;

ALTER TABLE public.spelling_learning_entries DROP CONSTRAINT IF EXISTS spelling_learning_entries_source_kind_check;
ALTER TABLE public.spelling_learning_entries ADD CONSTRAINT spelling_learning_entries_source_kind_check
    CHECK (source_kind = ANY (ARRAY['teacher', 'ai', 'search', 'manual', 'monthly']));

CREATE TABLE IF NOT EXISTS public.spelling_monthly_runs (
    id BIGSERIAL PRIMARY KEY,
    run_month DATE NOT NULL UNIQUE,                 -- 모은 달의 1일(서울)
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    candidates INTEGER NOT NULL DEFAULT 0,
    published INTEGER NOT NULL DEFAULT 0,
    held INTEGER NOT NULL DEFAULT 0,
    summary JSONB NOT NULL DEFAULT '{}'::JSONB      -- 갈래별 회색 점선 받아들인 비율 등 숫자만
);
ALTER TABLE public.spelling_monthly_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_monthly_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.spelling_monthly_runs_id_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.spelling_monthly_candidates (
    id BIGSERIAL PRIMARY KEY,
    run_month DATE NOT NULL,
    wrong_expression TEXT NOT NULL CHECK (char_length(wrong_expression) BETWEEN 1 AND 30),
    correct_expression TEXT NOT NULL CHECK (char_length(correct_expression) BETWEEN 1 AND 30),
    sources TEXT[] NOT NULL DEFAULT '{}',           -- gray_applied · gray_fixed · teacher_edit
    support INTEGER NOT NULL DEFAULT 0,             -- 증거 수(고친 횟수)
    classes INTEGER NOT NULL DEFAULT 0,             -- 증거가 나온 학급 수(학급 ID 는 남기지 않는다)
    status TEXT NOT NULL CHECK (status IN ('published', 'held')),
    reason TEXT,                                    -- 보류 까닭
    entry_id UUID REFERENCES public.spelling_learning_entries(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (run_month, wrong_expression, correct_expression)
);
ALTER TABLE public.spelling_monthly_candidates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_monthly_candidates FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.spelling_monthly_candidates_id_seq FROM PUBLIC, anon, authenticated;

COMMIT;

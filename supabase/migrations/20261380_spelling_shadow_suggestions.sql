-- 맞춤법 '살펴볼 곳'(회색 점선) 1단계: 보이지 않게 기록만(2026-10-08, 선생님 결정 — 1~2주 모아 보고 넓힌다).
-- 맥미니 밤 작업(scripts/spelling-shadow.mjs)이 제출된 글을 Kiwi 로 분석해, 회색 줄이 생겼을 자리를 여기 적는다.
-- 학생 화면에는 아무것도 보이지 않는다. 서버(service_role)만 읽고 쓴다 — 브라우저 권한 없음.
-- 기록 칸:
--   overlaps_red  : 그 자리에 이미 빨간 줄(빠른 규칙·기본 자료·공통 자료)이 그어지는지 — 회색과 겹치면 회색은 안 보이게 할 것
--   outcome       : 첫 제출본에서 찾은 자리를 아이(다시 쓰기)·선생님(직접 고치기)이 나중에 고쳤는지
--                   fixed_as_suggested(제안대로 고침) · fixed_otherwise(다르게 고침) · kept(그대로 둠) · unknown(견줄 글 없음)
-- 60일이 지나면 밤 작업이 지운다(학생 글 조각이 오래 남지 않게).

CREATE TABLE IF NOT EXISTS public.spelling_shadow_suggestions (
    id BIGSERIAL PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES public.student_posts(id) ON DELETE CASCADE,
    class_id UUID,
    text_version TEXT NOT NULL CHECK (text_version IN ('original', 'final')),
    kind TEXT NOT NULL CHECK (kind IN ('spacing_insert', 'spacing_remove', 'typo')),
    original TEXT NOT NULL CHECK (char_length(original) BETWEEN 1 AND 60),
    suggestion TEXT NOT NULL CHECK (char_length(suggestion) BETWEEN 1 AND 60),
    overlaps_red BOOLEAN NOT NULL DEFAULT FALSE,
    outcome TEXT NOT NULL DEFAULT 'unknown' CHECK (outcome IN ('fixed_as_suggested', 'fixed_otherwise', 'kept', 'unknown')),
    analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (post_id, text_version, kind, original, suggestion)
);
CREATE INDEX IF NOT EXISTS idx_spelling_shadow_analyzed ON public.spelling_shadow_suggestions (analyzed_at DESC);
ALTER TABLE public.spelling_shadow_suggestions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_shadow_suggestions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.spelling_shadow_suggestions_id_seq FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.spelling_shadow_runs (
    id BIGSERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    posts_analyzed INTEGER NOT NULL DEFAULT 0,
    suggestions_saved INTEGER NOT NULL DEFAULT 0,
    source_until TIMESTAMPTZ,
    note TEXT
);
ALTER TABLE public.spelling_shadow_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spelling_shadow_runs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.spelling_shadow_runs_id_seq FROM PUBLIC, anon, authenticated;

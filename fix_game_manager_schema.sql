-- [긴급 수정] 게임 매니저 관련 테이블 및 컬럼 보완 스키마
-- 작성일: 2026-02-08
-- 설명: 드래곤/어휘의 탑 시즌 기록 저장(403) 및 클래스 설정 업데이트(400) 오류 해결을 위한 스키마입니다.

-- 1. classes 테이블에 누락된 컬럼 추가 (400 Bad Request 해결)
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS vocab_tower_ranking_reset_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE public.classes ADD COLUMN IF NOT EXISTS season_started_at TIMESTAMP WITH TIME ZONE;

-- 2. agit_season_history 테이블 존재 여부 확인 및 생성
CREATE TABLE IF NOT EXISTS public.agit_season_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    season_name TEXT,
    target_score INTEGER,
    surprise_gift TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    rankings JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. agit_season_history RLS 정책 재설정 (403 Forbidden 해결)
ALTER TABLE public.agit_season_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for agit season history" ON public.agit_season_history;
CREATE POLICY "Enable all access for agit season history" ON public.agit_season_history
FOR ALL USING (true) WITH CHECK (true);


-- 4. vocab_tower_history 테이블 존재 여부 확인 및 생성
CREATE TABLE IF NOT EXISTS public.vocab_tower_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    season_name TEXT,
    rankings JSONB,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 5. vocab_tower_history RLS 정책 재설정 (403 Forbidden 해결)
ALTER TABLE public.vocab_tower_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for vocab tower history" ON public.vocab_tower_history;
CREATE POLICY "Enable all access for vocab tower history" ON public.vocab_tower_history
FOR ALL USING (true) WITH CHECK (true);

-- 6. vocab_tower_rankings RLS 정책 보완 (삭제 권한 등)
ALTER TABLE public.vocab_tower_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Enable all access for vocab tower rankings" ON public.vocab_tower_rankings;
CREATE POLICY "Enable all access for vocab tower rankings" ON public.vocab_tower_rankings
FOR ALL USING (true) WITH CHECK (true);

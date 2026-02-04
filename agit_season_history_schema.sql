-- [Agit Season History] 종료된 시즌 기록 보관용 테이블
CREATE TABLE IF NOT EXISTS public.agit_season_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    season_name TEXT, -- 예: "1번째 시즌"
    target_score INTEGER,
    surprise_gift TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    rankings JSONB, -- 상위 학생 목록 [{name: "이름", count: 12}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS 정책 설정 (모든 권한 허용 - 교사 관리용)
ALTER TABLE public.agit_season_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for season history" ON agit_season_history
FOR ALL
USING (true)
WITH CHECK (true);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_agit_season_history_class_id ON public.agit_season_history(class_id);

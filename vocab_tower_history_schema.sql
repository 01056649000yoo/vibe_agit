-- [Vocab Tower History] 종료된 시즌의 어휘의 탑 랭킹 기록 보관용 테이블
CREATE TABLE IF NOT EXISTS public.vocab_tower_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    season_name TEXT, -- 예: "2024-02-08 시즌"
    rankings JSONB, -- 전체 랭킹 목록 [{name: "홍길동", floor: 12}]
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS 정책 설정
ALTER TABLE public.vocab_tower_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can view tower history" ON public.vocab_tower_history;
CREATE POLICY "Anyone can view tower history" ON public.vocab_tower_history
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Teachers can manage tower history" ON public.vocab_tower_history;
CREATE POLICY "Teachers can manage tower history" ON public.vocab_tower_history
FOR ALL USING (true) WITH CHECK (true);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_tower_history_class_id ON public.vocab_tower_history(class_id);
CREATE INDEX IF NOT EXISTS idx_tower_history_ended_at ON public.vocab_tower_history(ended_at DESC);

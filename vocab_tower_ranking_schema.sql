-- [Vocab Tower Ranking] 어휘의 탑 랭킹 기록용 테이블
-- 학생별로 최고 도달 층수를 누적하여 관리합니다.
CREATE TABLE IF NOT EXISTS public.vocab_tower_rankings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    max_floor INTEGER DEFAULT 1,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_tower_ranking UNIQUE (student_id)
);

-- RLS 정책 설정
ALTER TABLE public.vocab_tower_rankings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view tower rankings" ON public.vocab_tower_rankings;
CREATE POLICY "Anyone can view tower rankings" ON public.vocab_tower_rankings
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Anyone can update tower rankings" ON public.vocab_tower_rankings;
CREATE POLICY "Anyone can update tower rankings" ON public.vocab_tower_rankings
FOR ALL USING (true) WITH CHECK (true);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_tower_rankings_class_id ON public.vocab_tower_rankings(class_id);
CREATE INDEX IF NOT EXISTS idx_tower_rankings_max_floor ON public.vocab_tower_rankings(max_floor DESC);

-- 최고 층수 업데이트 RPC 함수
CREATE OR REPLACE FUNCTION public.update_tower_max_floor(p_student_id UUID, p_class_id UUID, p_floor INTEGER)
RETURNS void AS $$
BEGIN
    INSERT INTO public.vocab_tower_rankings (student_id, class_id, max_floor, updated_at)
    VALUES (p_student_id, p_class_id, p_floor, now())
    ON CONFLICT (student_id) 
    DO UPDATE SET 
        max_floor = GREATEST(vocab_tower_rankings.max_floor, EXCLUDED.max_floor),
        updated_at = now()
    WHERE vocab_tower_rankings.max_floor < EXCLUDED.max_floor;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

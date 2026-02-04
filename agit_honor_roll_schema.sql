-- [Agit Feature Total Schema] 
-- 우리반 아지트 기능을 위한 통합 데이터베이스 스키마

-- 1. [Agit Honor Roll] 명예의 전당 보관용 테이블
-- 학생이 일일 미션을 달성했을 때 기록을 보관하여 통계에 활용합니다.
CREATE TABLE IF NOT EXISTS public.agit_honor_roll (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    achieved_date DATE DEFAULT (CURRENT_DATE AT TIME ZONE 'Asia/Seoul'),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT unique_student_daily_achievement UNIQUE (student_id, achieved_date)
);

-- 2. [Agit Season History] 종료된 시즌 기록 보관용 테이블
-- 목표 온도 달성 시 해당 시즌의 기록을 보관합니다.
CREATE TABLE IF NOT EXISTS public.agit_season_history (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    class_id UUID REFERENCES public.classes(id) ON DELETE CASCADE,
    season_name TEXT, 
    target_score INTEGER,
    surprise_gift TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
    rankings JSONB, -- 상위 학생 목록 [{name: "이름", count: 12}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- [RLS 보안 정책 설정]

-- 가. Agit Honor Roll 정책
ALTER TABLE public.agit_honor_roll ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for honor roll" ON public.agit_honor_roll;
CREATE POLICY "Enable all access for honor roll" ON public.agit_honor_roll
FOR ALL USING (true) WITH CHECK (true);

-- 나. Agit Season History 정책
ALTER TABLE public.agit_season_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for season history" ON public.agit_season_history;
CREATE POLICY "Enable all access for season history" ON public.agit_season_history
FOR ALL USING (true) WITH CHECK (true);


-- [인덱스 설정 및 성능 최적화]

-- Agit Honor Roll 인덱스
CREATE INDEX IF NOT EXISTS idx_agit_honor_roll_class_id ON public.agit_honor_roll(class_id);
CREATE INDEX IF NOT EXISTS idx_agit_honor_roll_date ON public.agit_honor_roll(achieved_date);
CREATE INDEX IF NOT EXISTS idx_agit_honor_roll_student_id ON public.agit_honor_roll(student_id);

-- Agit Season History 인덱스
CREATE INDEX IF NOT EXISTS idx_agit_season_history_class_id ON public.agit_season_history(class_id);
CREATE INDEX IF NOT EXISTS idx_season_history_ended_at ON public.agit_season_history(ended_at DESC);

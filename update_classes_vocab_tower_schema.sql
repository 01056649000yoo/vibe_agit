-- 어휘의 탑 게임 설정을 위한 classes 테이블 컬럼 추가 (요청된 기본값 적용)
ALTER TABLE public.classes 
ADD COLUMN IF NOT EXISTS vocab_tower_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS vocab_tower_grade INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS vocab_tower_daily_limit INTEGER DEFAULT 3,
ADD COLUMN IF NOT EXISTS vocab_tower_time_limit INTEGER DEFAULT 40,
ADD COLUMN IF NOT EXISTS vocab_tower_reward_points INTEGER DEFAULT 80,
ADD COLUMN IF NOT EXISTS vocab_tower_reset_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()),
ADD COLUMN IF NOT EXISTS vocab_tower_ranking_reset_date TIMESTAMP WITH TIME ZONE;

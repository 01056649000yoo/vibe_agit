-- 어휘의 탑 게임 설정 컬럼 추가
-- classes 테이블에 vocab_tower_enabled, vocab_tower_grade, vocab_tower_daily_limit 컬럼 추가

ALTER TABLE classes
ADD COLUMN IF NOT EXISTS vocab_tower_enabled BOOLEAN DEFAULT false;

ALTER TABLE classes
ADD COLUMN IF NOT EXISTS vocab_tower_grade INTEGER DEFAULT 4;

ALTER TABLE classes
ADD COLUMN IF NOT EXISTS vocab_tower_daily_limit INTEGER DEFAULT 3;

ALTER TABLE classes
ADD COLUMN IF NOT EXISTS vocab_tower_reset_date TIMESTAMPTZ;

ALTER TABLE classes
ADD COLUMN IF NOT EXISTS vocab_tower_time_limit INTEGER DEFAULT 60;

ALTER TABLE classes
ADD COLUMN IF NOT EXISTS vocab_tower_reward_points INTEGER DEFAULT 100;

-- 기본값 설정 확인
COMMENT ON COLUMN classes.vocab_tower_enabled IS '어휘의 탑 게임 활성화 여부';
COMMENT ON COLUMN classes.vocab_tower_grade IS '어휘의 탑 게임 출제 학년 (3-6)';
COMMENT ON COLUMN classes.vocab_tower_daily_limit IS '어휘의 탑 일일 시도 횟수 제한';
COMMENT ON COLUMN classes.vocab_tower_reset_date IS '어휘의 탑 일일 시도 횟수 리셋 기준 시각';
COMMENT ON COLUMN classes.vocab_tower_time_limit IS '어휘의 탑 게임 1회당 제한 시간(초)';
COMMENT ON COLUMN classes.vocab_tower_reward_points IS '어휘의 탑 기회 소진 시 획득 포인트';

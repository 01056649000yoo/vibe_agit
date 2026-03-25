-- ============================================================
-- 🏰 [성능 최적화] 어휘의 탑 랭킹 조회 속도 개선
-- 목적: 500명 동시 접속 시 랭킹 조회 성능(ORDER BY max_floor DESC) 
--       풀 스캔 방지 및 인덱스 스캔 강제
-- ============================================================

-- 1. 학급별 랭킹 조회용 복합 인덱스 (기존 단일 인덱스보다 정렬 성능 우수)
CREATE INDEX IF NOT EXISTS idx_vocab_tower_rankings_composite 
ON public.vocab_tower_rankings(class_id, max_floor DESC);

-- 2. (선택) 기존 단일 인덱스가 있다면 중복되므로 제거 가능하지만 안전을 위해 유지
-- DROP INDEX IF EXISTS idx_vocab_tower_rankings_class_id;

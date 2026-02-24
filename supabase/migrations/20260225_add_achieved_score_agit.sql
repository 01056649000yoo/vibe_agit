-- agit_season_history 테이블에 achieved_score(최종 달성 온도) 컬럼 추가
ALTER TABLE public.agit_season_history
ADD COLUMN achieved_score integer DEFAULT 0;

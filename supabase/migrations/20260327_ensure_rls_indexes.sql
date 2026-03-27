-- ============================================================================
-- 🛡️ [성능 보장] RLS 최적화용 class_id 인덱스 전면 점검 및 생성
-- 작성일: 2026-03-27
-- 설명: 모든 주요 테이블의 class_id 컬럼에 인덱스를 생성하여 RLS 정책이 
--       인덱스 스캔(Index Scan)을 통해 즉시 응답하도록 보장합니다.
-- ============================================================================

-- 1. 학생 게시글 (student_posts)
CREATE INDEX IF NOT EXISTS idx_student_posts_class_id ON public.student_posts(class_id);

-- 2. 게시글 댓글 (post_comments)
CREATE INDEX IF NOT EXISTS idx_post_comments_class_id ON public.post_comments(class_id);

-- 3. 게시글 반응 (post_reactions)
CREATE INDEX IF NOT EXISTS idx_post_reactions_class_id ON public.post_reactions(class_id);

-- 4. 어휘 타워 랭킹 (vocab_tower_rankings)
CREATE INDEX IF NOT EXISTS idx_tower_rankings_class_id ON public.vocab_tower_rankings(class_id);

-- 5. 아지트 명예의 전당 (agit_honor_roll)
CREATE INDEX IF NOT EXISTS idx_honor_roll_class_id ON public.agit_honor_roll(class_id);

-- 6. 포인트 로그 (point_logs)
CREATE INDEX IF NOT EXISTS idx_point_logs_class_id ON public.point_logs(class_id);

-- 7. 글쓰기 미션 (writing_missions)
CREATE INDEX IF NOT EXISTS idx_writing_missions_class_id ON public.writing_missions(class_id);

-- 인덱스 생성 후 통계 업데이트 (성능 향상)
ANALYZE public.student_posts;
ANALYZE public.post_comments;
ANALYZE public.post_reactions;
ANALYZE public.vocab_tower_rankings;
ANALYZE public.agit_honor_roll;
ANALYZE public.point_logs;
ANALYZE public.writing_missions;

-- 스키마 캐시 새로고침
NOTIFY pgrst, 'reload schema';

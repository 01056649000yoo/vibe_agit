-- ==============================================================================
-- [CCU 200명 대응] 친구 아지트 및 게시판 성능 극대화 (복합 인덱스)
-- 작성일: 2026-03-25
-- 
-- 내용: 
--   1. student_posts: 아지트 목록 조회 시 (mission_id -> is_submitted -> created_at) 순으로 색인하여 
--      수천 개의 글 중 우리 반 친구의 제출된 최신 글 10개를 O(log N) 속도로 즉시 찾아냅니다.
--   2. post_reactions: 특정 글의 반응 타입별 개수 집계를 가속합니다.
--   3. post_comments: 특정 글의 댓글을 작성순으로 정렬하여 불러오는 속도를 높입니다.
-- ==============================================================================

-- 1. 아지트 게시글 목록 조회 가속 (복합 인덱스)
-- (mission_id로 1차 필터링 -> is_submitted로 2차 필터링 -> 생성일 역순으로 정렬 정렬)
CREATE INDEX IF NOT EXISTS idx_student_posts_mission_submitted_created 
ON public.student_posts (mission_id, is_submitted, created_at DESC);

-- 2. 반응 집계 및 특정 학생 반응 확인 가속
-- (post_id로 1차 필터링 -> reaction_type으로 2차 필터링)
CREATE INDEX IF NOT EXISTS idx_post_reactions_composite 
ON public.post_reactions (post_id, reaction_type);

-- 3. 댓글 정렬 조회 가속
-- (post_id로 필터링 후 생성일 순으로 즉시 정렬 데이터 제공)
CREATE INDEX IF NOT EXISTS idx_post_comments_post_created 
ON public.post_comments (post_id, created_at ASC);

-- 스키마 캐시 갱신 (PostgREST 반영)
NOTIFY pgrst, 'reload schema';

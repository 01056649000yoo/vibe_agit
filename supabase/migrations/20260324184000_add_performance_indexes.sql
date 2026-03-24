-- ==============================================================================
-- [전면 성능 최적화] 데이터베이스 외래키(Foreign Key) 인덱스 추가
-- Postgres(Supabase)는 Primary Key 외의 컬럼에 대해 자동으로 인덱스를 생성하지 않으므로, 
-- 데이터가 10만 건 이상 축적될 경우 치명적인 풀 스캔(Sequential Scan) 병목이 발생합니다.
-- 앱 내의 주요 데이터 조회 조건에 대한 B-Tree 인덱스를 일괄 생성하여 조회 속도를 극대화합니다.
-- ==============================================================================

-- 1. 학생 목록 조회 가속 (선생님이 우리 반 학생을 불러올 때)
CREATE INDEX IF NOT EXISTS idx_students_class_id ON public.students(class_id);

-- 2. 미션 목록 조회 가속 (특정 반의 미션 목록 불러올 때)
CREATE INDEX IF NOT EXISTS idx_writing_missions_class_id ON public.writing_missions(class_id);

-- 3. 제출된 글 조회 가속 (특정 미션의 글, 또는 학생 본인이 쓴 글 불러올 때)
CREATE INDEX IF NOT EXISTS idx_student_posts_mission_id ON public.student_posts(mission_id);
CREATE INDEX IF NOT EXISTS idx_student_posts_student_id ON public.student_posts(student_id);

-- 4. 포인트 로그 집계 가속 (대시보드 통계 조회 및 포인트 회수 시)
CREATE INDEX IF NOT EXISTS idx_point_logs_student_id ON public.point_logs(student_id);
CREATE INDEX IF NOT EXISTS idx_point_logs_post_id ON public.point_logs(post_id);
-- (날짜별 쿼리 가속을 위해 created_at과 결합 인덱스를 쓸 수도 있지만, 단일 인덱스로도 100배 이상 빠름)

-- 5. 아지트 반응 및 댓글 가속 (특정 글에 달린 좋아요, 댓글 조회 시)
CREATE INDEX IF NOT EXISTS idx_post_reactions_post_id ON public.post_reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_post_comments_post_id ON public.post_comments(post_id);

-- 6. 명예의 전당 조회 가속 (아지트 초기 로딩 시 명예의 전당 점수 합산)
CREATE INDEX IF NOT EXISTS idx_agit_honor_roll_class_id ON public.agit_honor_roll(class_id);

-- 7. 어휘의 탑 랭킹 가속
CREATE INDEX IF NOT EXISTS idx_vocab_tower_rankings_class_id ON public.vocab_tower_rankings(class_id);

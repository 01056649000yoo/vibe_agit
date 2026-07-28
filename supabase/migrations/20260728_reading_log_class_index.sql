-- ============================================================================
-- 교사용 독서록 조회 인덱스
--
-- 교사 화면은 항상 "한 학급의 제출된 독서록"만 본다. 그런데 이 조건에 맞는
-- 인덱스가 없어, 계획기가 idx_student_posts_self_writing_list
-- (student_id, self_writing_type, updated_at DESC) WHERE writing_context='self'
-- 를 고르고 있었다. 이 인덱스의 첫 열은 student_id 인데 조회 조건에는
-- student_id 가 없다(전체 학생 보기). 그래서 인덱스 전체 = 모든 학급의 자율 글을
-- 훑은 뒤 class_id 로 걸러낸다. 독서록이 쌓일수록 남의 학급 몫까지 읽는 구조다.
--
-- 조회 조건 그대로를 담은 부분 인덱스를 만든다. ORDER BY updated_at DESC 까지
-- 인덱스가 처리하므로 정렬도 사라진다.
--
-- 트랜잭션으로 감싸지 않는다: CREATE INDEX CONCURRENTLY 는 트랜잭션 블록 안에서
-- 실행할 수 없다. 운영 중 쓰기를 막지 않으려고 CONCURRENTLY 를 쓴다.
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_student_posts_reading_log_class
    ON public.student_posts (class_id, updated_at DESC)
    WHERE writing_context = 'self'
      AND self_writing_type = 'reading_log'
      AND is_submitted = true;

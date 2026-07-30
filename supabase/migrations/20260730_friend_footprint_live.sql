-- ============================================================================
-- 친구 발자국을 내 발자국과 같은 계산으로 통일
--
-- 문제: 친구 카드가 하루 한 번 만드는 `student_writing_daily_snapshots` 를 읽는데,
--   그 표의 재료인 `writing_activity_events` 는 발자국 기능을 켠 뒤의 기록만 담아서
--   운영에 **7건**뿐이다. 그래서 스냅샷 5,620줄 중 값이 0이 아닌 학생이 **1,405명 중 1명**이다.
--   → 친구 카드는 사실상 전원 0으로 보인다.
--   내 발자국은 2026-07-29에 이 문제 때문에 스냅샷을 버리고 실제 표에서 직접 세도록 바꿨는데,
--   친구 카드만 옛 방식으로 남아 있었다.
--
-- 결정: 밤 배치로 통일하는 대신 **실시간 계산 쪽으로** 통일한다.
--   운영 맥미니(M4 10코어)에서 재보니 발자국 집계가 0.75ms, 동시 10연결로 초당 13,333회다.
--   학생 500명이 동시에 열어도 DB 계산은 0.04초라 미리 만들어 둘 이유가 없다.
--   새 표·밤 배치·"어제 기준" 안내가 없어지고, 두 화면이 같은 원천을 보므로 값이 어긋날 수 없다.
--
-- 항목 변경: `revisions_count`(고쳐 쓴 횟수)는 이벤트 표에만 있던 값이고 실제 표에서
--   같은 정의로 셀 수 있는 근거가 없어 **제거**한다. 내 발자국 화면도 이미 안 보여 준다.
--
-- 권한은 기존과 같다 — 같은 학급 친구만, 공개 가능한 항목만.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_friend_writing_footprint(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_viewer_id UUID := public.auth_student_id();
    v_viewer_class_id UUID;
    v_target_name TEXT;
    v_result JSONB;
BEGIN
    IF v_viewer_id IS NULL OR p_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT class_id INTO v_viewer_class_id
    FROM public.students
    WHERE id = v_viewer_id
      AND auth_id = auth.uid()
      AND is_active IS DISTINCT FROM false
      AND (deleted_at IS NULL OR deleted_at > NOW());

    SELECT name INTO v_target_name
    FROM public.students
    WHERE id = p_student_id
      AND class_id = v_viewer_class_id
      AND is_active IS DISTINCT FROM false
      AND (deleted_at IS NULL OR deleted_at > NOW());

    IF v_viewer_class_id IS NULL OR v_target_name IS NULL THEN
        RAISE EXCEPTION '같은 반 친구의 발자국만 볼 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    -- 아래 집계는 `get_my_writing_footprint_detail` 과 같은 원천·같은 기준을 쓴다.
    -- 학급을 직접 걸어 학급 인덱스를 탄다 (WORKLOG '학급 글 조회 기준').
    WITH target_posts AS (
        SELECT p.id, p.mission_id, p.created_at
        FROM public.student_posts p
        WHERE p.class_id = v_viewer_class_id
          AND p.student_id = p_student_id
          AND p.is_confirmed = true
    ), level_posts AS (
        -- 완성한 글: 과제글은 미션별 가장 최근 한 편, 자율글은 각 글을 한 편.
        -- 클라이언트 짝: src/constants/writerLevels.js 의 collectWriterPosts().
        SELECT DISTINCT ON (COALESCE('mission:' || mission_id::text, 'post:' || id::text))
               id
        FROM target_posts
        ORDER BY COALESCE('mission:' || mission_id::text, 'post:' || id::text),
                 created_at DESC
    )
    SELECT jsonb_build_object(
        'student_name', v_target_name,
        -- 실시간 계산이므로 기준일은 오늘이다. 화면은 이 값을 "N월 N일 기준" 으로 보여 준다.
        'snapshot_date', (NOW() AT TIME ZONE 'Asia/Seoul')::date,
        'tracking_started_at', NULL,
        'posts_written_count', (SELECT count(*) FROM level_posts)::INTEGER,
        'active_days_count', (
            SELECT count(DISTINCT (created_at AT TIME ZONE 'Asia/Seoul')::date)
            FROM target_posts
        )::INTEGER,
        'comments_given_count', (
            SELECT count(*) FROM public.post_comments c
            WHERE c.class_id = v_viewer_class_id
              AND c.student_id = p_student_id
        )::INTEGER,
        'comments_received_count', (
            SELECT count(*) FROM public.post_comments c
            JOIN public.student_posts p2
              ON p2.id = c.post_id
             AND p2.class_id = c.class_id
            WHERE c.class_id = v_viewer_class_id
              AND p2.student_id = p_student_id
              AND c.student_id IS DISTINCT FROM p_student_id
        )::INTEGER,
        'reactions_received_count', (
            SELECT count(*) FROM public.post_reactions r
            JOIN public.student_posts p2
              ON p2.id = r.post_id
             AND p2.class_id = r.class_id
            WHERE r.class_id = v_viewer_class_id
              AND p2.student_id = p_student_id
              AND r.student_id IS DISTINCT FROM p_student_id
        )::INTEGER
    )
    INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_friend_writing_footprint(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_writing_footprint(UUID) TO authenticated, service_role;

COMMIT;

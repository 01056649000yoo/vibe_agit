-- 독서마라톤 '쪽수 확인이 필요한 책' 고침 세 가지(2026-09-21, 사용자 요청).
--
-- [1] 쪽수를 고쳐도 달린 거리가 붙지 않았다.
--   set_teacher_reading_book_page_count 는 book_catalog.page_count 만 적고 끝냈다. 거리는
--   전적으로 reading_marathon_contributions 표에서 나오는데 그 표에 줄이 생기지 않으니,
--   교사 화면에서는 그 책이 목록에서 사라져 **고쳐진 것처럼 보이지만** 학생 거리는 0m 그대로였다.
--   이 함수는 20260930 이후 한 번도 고치지 않아, 교사가 보정한 책(page_count_source='teacher')은
--   모두 이 상태일 수 있다. 고침: 쪽수를 저장한 뒤 그 책을 읽은 **그 학급 독서록 전부**를 다시 센다.
--   한 권을 여러 학생이 읽었을 수 있어 글 하나가 아니라 학급 단위로 돈다.
--   record_reading_marathon_contribution 은 넣기·지우기·다시셈을 스스로 하므로 되풀이해도 안전하다.
--
-- [2] 상한을 넘는 책(전집·세트)이 교사 목록에 뜨지 않았다.
--   20261259 가 쪽수 상한을 넣으면서 get_reading_marathon_snapshot(v1)의 pending_rows 만 고치고
--   **화면이 실제로 쓰는 v2 를 고치지 않았다**. 그래서 v2 는 여전히 page_count IS NULL 만 띄웠고,
--   화면의 '전집·세트로 보입니다' 가지는 닿지 않는 죽은 코드였다(page_count 자체를 안 내려보냈다).
--   덤으로 pending_book_count 가 목록의 LIMIT 20 을 세고 있어 21권째부터 없는 것처럼 보였다.
--   고침: v2 의 pending_rows 에 상한 초과를 포함하고 page_count·reason 을 함께 내보내며,
--   세기는 상한 없는 pending_all 로 따로 센다.
--
-- [3] 쪽수 미확인 책이 있어도 교사가 알기 어려웠다.
--   고치는 화면은 이미 있으나(독서록 > 독서록 이벤트 > 쪽수 확인이 필요한 책) 3층 깊이라
--   일부러 찾아 들어가야만 보인다. 메뉴 배지에 쓸 **세기 전용** RPC 를 더한다. 무거운 스냅샷을
--   배지가 부르지 않게 따로 둔다(대시보드는 모든 교사가 매번 연다).
--   세는 조건은 위 pending_all 과 글자 그대로 같아야 한다. 어긋나면 배지 숫자와 목록이 달라진다.

BEGIN;

-- ---------------------------------------------------------------------------
-- [1] 쪽수 보정 → 거리 다시 계산
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_teacher_reading_book_page_count(
    p_class_id UUID,
    p_post_id UUID,
    p_page_count INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_book_id UUID;
    v_post_id UUID;
BEGIN
    IF p_page_count NOT BETWEEN 1 AND 10000 THEN
        RAISE EXCEPTION '페이지 수는 1~10,000쪽 사이로 입력해주세요.' USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '이 학급의 책 정보를 수정할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT item.book_id
    INTO v_book_id
    FROM public.reading_log_entries entry
    JOIN public.student_library_items item
      ON item.id = entry.library_item_id
     AND item.class_id = entry.class_id
     AND item.student_id = entry.student_id
    JOIN public.student_posts post
      ON post.id = entry.post_id
     AND post.class_id = entry.class_id
     AND post.student_id = entry.student_id
    WHERE entry.post_id = p_post_id
      AND entry.class_id = p_class_id
      AND item.class_id = p_class_id
      AND post.class_id = p_class_id
      AND post.writing_context = 'self'
      AND post.self_writing_type = 'reading_log';

    IF v_book_id IS NULL THEN
        RAISE EXCEPTION '페이지 수를 수정할 책을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.book_catalog book
    SET page_count = p_page_count,
        page_count_source = 'teacher',
        page_count_updated_at = NOW(),
        updated_at = NOW()
    WHERE book.id = v_book_id;

    -- 같은 책을 읽은 이 학급의 독서록을 모두 다시 센다. 고친 글 하나만 돌면
    -- 같은 책을 읽은 다른 학생의 거리가 0m 으로 남는다.
    FOR v_post_id IN
        SELECT post.id
        FROM public.student_posts post
        JOIN public.reading_log_entries entry
          ON entry.post_id = post.id
         AND entry.class_id = post.class_id
         AND entry.student_id = post.student_id
        JOIN public.student_library_items item
          ON item.id = entry.library_item_id
         AND item.class_id = entry.class_id
         AND item.student_id = entry.student_id
        WHERE post.class_id = p_class_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log'
          AND item.book_id = v_book_id
    LOOP
        PERFORM public.record_reading_marathon_contribution(v_post_id);
    END LOOP;

    RETURN public.get_reading_marathon_snapshot_v2(p_class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_teacher_reading_book_page_count(UUID, UUID, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_teacher_reading_book_page_count(UUID, UUID, INTEGER)
    TO authenticated;

COMMENT ON FUNCTION public.set_teacher_reading_book_page_count(UUID, UUID, INTEGER) IS
    '교사가 책 쪽수를 보정하고, 같은 책을 읽은 그 학급 독서록의 마라톤 거리를 다시 계산한다.';

-- ---------------------------------------------------------------------------
-- [2] 화면이 쓰는 v2 스냅샷의 '쪽수 확인이 필요한 책' 을 바로잡는다.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_reading_marathon_snapshot_v2(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
    v_is_teacher BOOLEAN := FALSE;
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.id INTO v_student_id
    FROM public.students student
    WHERE student.class_id = p_class_id AND student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;
    SELECT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) INTO v_is_teacher;
    IF v_student_id IS NULL AND NOT v_is_teacher THEN
        RAISE EXCEPTION '이 학급의 독서마라톤을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT campaign.* INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = p_class_id AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC LIMIT 1;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'campaign', NULL,
            'summary', jsonb_build_object('total_pages', 0, 'total_distance_m', 0, 'contributors', 0, 'book_count', 0),
            'leaderboard', '[]'::JSONB, 'teams', '[]'::JSONB, 'team_leaderboard', '[]'::JSONB,
            'pending_books', '[]'::JSONB, 'my', NULL, 'my_team', NULL,
            'roster', CASE WHEN v_is_teacher THEN COALESCE((
                SELECT jsonb_agg(jsonb_build_object('student_id', student.id, 'name', student.name) ORDER BY student.name, student.id)
                FROM (SELECT * FROM public.students student WHERE student.class_id = p_class_id
                      AND student.is_active IS DISTINCT FROM false
                      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
                      ORDER BY student.name, student.id LIMIT 100) student
            ), '[]'::JSONB) ELSE '[]'::JSONB END,
            'is_teacher', v_is_teacher
        );
    END IF;

    WITH ranked AS MATERIALIZED (
        SELECT participant.student_id, participant.name_snapshot AS name, participant.team_id,
               participant.total_pages, participant.total_distance_m AS distance_m,
               participant.book_count, participant.completed_at,
               DENSE_RANK() OVER (ORDER BY participant.total_distance_m DESC) AS rank
        FROM public.reading_marathon_participants participant
        WHERE participant.campaign_id = v_campaign.id AND participant.class_id = p_class_id
        ORDER BY participant.total_distance_m DESC, participant.name_snapshot, participant.student_id
        LIMIT 100
    ), team_ranked AS MATERIALIZED (
        SELECT team.id, team.name, team.color, team.sort_order, team.total_pages,
               team.total_distance_m, team.book_count, team.completed_at,
               COUNT(participant.id)::INTEGER AS member_count,
               DENSE_RANK() OVER (ORDER BY team.total_distance_m DESC) AS rank
        FROM public.reading_marathon_teams team
        LEFT JOIN public.reading_marathon_participants participant
          ON participant.team_id = team.id AND participant.campaign_id = team.campaign_id
        WHERE team.campaign_id = v_campaign.id AND team.class_id = p_class_id
        GROUP BY team.id
        ORDER BY team.total_distance_m DESC, team.sort_order, team.id
        LIMIT 20
    ), totals AS MATERIALIZED (
        SELECT COALESCE(SUM(participant.total_pages), 0)::BIGINT AS total_pages,
               COALESCE(SUM(participant.total_distance_m), 0)::BIGINT AS total_distance_m,
               COUNT(*) FILTER (WHERE participant.total_distance_m > 0)::INTEGER AS contributors,
               COALESCE(SUM(participant.book_count), 0)::INTEGER AS book_count
        FROM public.reading_marathon_participants participant
        WHERE participant.campaign_id = v_campaign.id AND participant.class_id = p_class_id
    ), pending_rows AS MATERIALIZED (
        SELECT post.id AS post_id, post.student_id, student.name AS student_name,
               book.title AS book_title, book.isbn13, book.isbn10, book.page_count,
               CASE WHEN book.page_count IS NULL THEN 'unknown' ELSE 'too_long' END AS reason,
               COALESCE(post.published_at, post.created_at) AS completed_at
        FROM public.student_posts post
        JOIN public.students student ON student.id = post.student_id AND student.class_id = post.class_id
        JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id AND review.class_id = post.class_id AND review.student_id = post.student_id
         AND review.review_status IN ('checked', 'commented')
        JOIN public.reading_log_entries entry
          ON entry.post_id = post.id AND entry.class_id = post.class_id AND entry.student_id = post.student_id
        JOIN public.student_library_items item
          ON item.id = entry.library_item_id AND item.class_id = entry.class_id AND item.student_id = entry.student_id
        JOIN public.book_catalog book ON book.id = item.book_id
        WHERE post.class_id = p_class_id AND post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log' AND post.is_submitted IS TRUE
          AND COALESCE(post.published_at, post.created_at) >= COALESCE(v_campaign.started_at, v_campaign.created_at)
          AND (v_campaign.ends_on IS NULL OR COALESCE(post.published_at, post.created_at) < v_campaign.ends_on + 1)
          AND (book.page_count IS NULL OR book.page_count > public.reading_marathon_max_pages_v1())
        ORDER BY COALESCE(post.published_at, post.created_at) DESC, post.id DESC LIMIT 20
    ), pending_all AS MATERIALIZED (
        -- 배지·요약에 쓰는 전체 수. 위 목록은 화면용이라 LIMIT 20 이 걸려 있어,
        -- 그대로 세면 21권째부터 없는 것처럼 보인다.
        SELECT post.id
        FROM public.student_posts post
        JOIN public.students student ON student.id = post.student_id AND student.class_id = post.class_id
        JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id AND review.class_id = post.class_id AND review.student_id = post.student_id
         AND review.review_status IN ('checked', 'commented')
        JOIN public.reading_log_entries entry
          ON entry.post_id = post.id AND entry.class_id = post.class_id AND entry.student_id = post.student_id
        JOIN public.student_library_items item
          ON item.id = entry.library_item_id AND item.class_id = entry.class_id AND item.student_id = entry.student_id
        JOIN public.book_catalog book ON book.id = item.book_id
        WHERE post.class_id = p_class_id AND post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log' AND post.is_submitted IS TRUE
          AND COALESCE(post.published_at, post.created_at) >= COALESCE(v_campaign.started_at, v_campaign.created_at)
          AND (v_campaign.ends_on IS NULL OR COALESCE(post.published_at, post.created_at) < v_campaign.ends_on + 1)
          AND (book.page_count IS NULL OR book.page_count > public.reading_marathon_max_pages_v1())
    )
    SELECT jsonb_build_object(
        'campaign', jsonb_build_object(
            'id', v_campaign.id, 'title', v_campaign.title,
            'competition_type', v_campaign.competition_type,
            'target_distance_m', v_campaign.target_distance_m,
            'meters_per_page', v_campaign.meters_per_page,
            'medal_requirement_type', v_campaign.medal_requirement_type,
            'medal_requirement_value', v_campaign.medal_requirement_value,
            'status', v_campaign.status,
            'is_enabled', v_campaign.status IN ('active', 'completed')
                AND (v_campaign.ends_on IS NULL OR v_campaign.ends_on >= CURRENT_DATE),
            'is_ended', v_campaign.ends_on IS NOT NULL AND v_campaign.ends_on < CURRENT_DATE,
            'started_at', v_campaign.started_at, 'ends_on', v_campaign.ends_on,
            'completed_at', v_campaign.completed_at
        ),
        'summary', jsonb_build_object(
            'total_pages', totals.total_pages, 'total_distance_m', totals.total_distance_m,
            'contributors', totals.contributors, 'book_count', totals.book_count,
            'target_distance_m', v_campaign.target_distance_m,
            'progress_percent', CASE WHEN v_campaign.target_distance_m > 0
                THEN LEAST(100, ROUND(totals.total_distance_m * 100.0 / v_campaign.target_distance_m, 1)) ELSE 0 END,
            'pending_book_count', (SELECT COUNT(*) FROM pending_all)
        ),
        'leaderboard', COALESCE((
            SELECT jsonb_agg(to_jsonb(visible) ORDER BY visible.rank, visible.name, visible.student_id)
            FROM ranked visible
            WHERE v_is_teacher OR visible.rank <= 3 OR visible.student_id = v_student_id
        ), '[]'::JSONB),
        'teams', COALESCE((SELECT jsonb_agg(to_jsonb(team_ranked) ORDER BY team_ranked.sort_order, team_ranked.id) FROM team_ranked), '[]'::JSONB),
        'team_leaderboard', COALESCE((SELECT jsonb_agg(to_jsonb(team_ranked) ORDER BY team_ranked.rank, team_ranked.sort_order, team_ranked.id) FROM team_ranked), '[]'::JSONB),
        'pending_books', CASE WHEN v_is_teacher THEN COALESCE((SELECT jsonb_agg(to_jsonb(pending_rows) ORDER BY pending_rows.completed_at DESC, pending_rows.post_id) FROM pending_rows), '[]'::JSONB) ELSE '[]'::JSONB END,
        'my', CASE WHEN v_student_id IS NULL THEN NULL ELSE (SELECT to_jsonb(ranked) FROM ranked WHERE ranked.student_id = v_student_id) END,
        'my_team', CASE WHEN v_student_id IS NULL THEN NULL ELSE (
            SELECT to_jsonb(team_ranked) FROM team_ranked
            WHERE team_ranked.id = (SELECT ranked.team_id FROM ranked WHERE ranked.student_id = v_student_id)
        ) END,
        'roster', CASE WHEN v_is_teacher THEN COALESCE((SELECT jsonb_agg(to_jsonb(ranked) ORDER BY ranked.name, ranked.student_id) FROM ranked), '[]'::JSONB) ELSE '[]'::JSONB END,
        'is_teacher', v_is_teacher, 'generated_at', NOW()
    ) INTO v_result FROM totals;
    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_reading_marathon_snapshot_v2(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reading_marathon_snapshot_v2(UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- [3] 쪽수 확인이 필요한 책 세기 (메뉴 배지 전용)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_teacher_reading_pending_books_badge_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
    v_count INTEGER := 0;
BEGIN
    -- 배지는 메뉴를 그릴 때마다 불리므로, 권한이 없으면 오류 대신 0 을 준다(메뉴가 깨지지 않게).
    IF auth.uid() IS NULL
       OR NOT (public.auth_user_role() = 'ADMIN'
               OR EXISTS (SELECT 1 FROM public.classes c
                          WHERE c.id = p_class_id AND c.teacher_id = auth.uid())) THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    -- 진행 중인 캠페인이 없으면 셀 기간이 없다. 화면 목록도 같은 이유로 비어 있다.
    SELECT campaign.* INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = p_class_id
      AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC
    LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('count', 0);
    END IF;

    -- ⚠️ 아래 조건은 get_reading_marathon_snapshot_v2 의 pending_all 과 같아야 한다.
    --    어긋나면 배지 숫자와 화면 목록이 달라 교사가 헷갈린다.
    --    tests/readingMarathonPendingBadge.test.mjs 가 두 곳을 함께 본다.
    SELECT count(*)::INTEGER INTO v_count
    FROM public.student_posts post
    JOIN public.students student ON student.id = post.student_id AND student.class_id = post.class_id
    JOIN public.reading_log_teacher_reviews review
      ON review.post_id = post.id AND review.class_id = post.class_id AND review.student_id = post.student_id
     AND review.review_status IN ('checked', 'commented')
    JOIN public.reading_log_entries entry
      ON entry.post_id = post.id AND entry.class_id = post.class_id AND entry.student_id = post.student_id
    JOIN public.student_library_items item
      ON item.id = entry.library_item_id AND item.class_id = entry.class_id AND item.student_id = entry.student_id
    JOIN public.book_catalog book ON book.id = item.book_id
    WHERE post.class_id = p_class_id AND post.writing_context = 'self'
      AND post.self_writing_type = 'reading_log' AND post.is_submitted IS TRUE
      AND COALESCE(post.published_at, post.created_at) >= COALESCE(v_campaign.started_at, v_campaign.created_at)
      AND (v_campaign.ends_on IS NULL OR COALESCE(post.published_at, post.created_at) < v_campaign.ends_on + 1)
      AND (book.page_count IS NULL OR book.page_count > public.reading_marathon_max_pages_v1());

    RETURN jsonb_build_object('count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_reading_pending_books_badge_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_reading_pending_books_badge_v1(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_teacher_reading_pending_books_badge_v1(UUID) IS
    '메뉴 배지용 — 쪽수를 모르거나 상한을 넘어 달린 거리에 넣지 못한 책의 수. 세는 기준은 교사 화면 목록과 같다.';

-- ---------------------------------------------------------------------------
-- 지금까지 쪽수만 고쳐지고 거리가 붙지 않은 책을 되살린다.
-- 교사가 보정한 책(page_count_source='teacher')을 읽은 독서록을 모두 다시 센다.
-- record_reading_marathon_contribution 이 캠페인·참가자·확인 상태를 스스로 보므로
-- 조건에 맞지 않는 글은 그냥 지나간다.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
    v_post_id UUID;
BEGIN
    FOR v_post_id IN
        SELECT post.id
        FROM public.student_posts post
        JOIN public.reading_log_entries entry
          ON entry.post_id = post.id
         AND entry.class_id = post.class_id
         AND entry.student_id = post.student_id
        JOIN public.student_library_items item
          ON item.id = entry.library_item_id
         AND item.class_id = entry.class_id
         AND item.student_id = entry.student_id
        JOIN public.book_catalog book ON book.id = item.book_id
        WHERE post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log'
          AND book.page_count_source = 'teacher'
          AND book.page_count BETWEEN 1 AND public.reading_marathon_max_pages_v1()
    LOOP
        PERFORM public.record_reading_marathon_contribution(v_post_id);
    END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 독서마라톤 운영 문제 수정(2026-09-07, 사용자 요청).
--
-- 문제: 한 학생이 4,040쪽짜리 전집을 불러와 독서록을 내자 곧바로 4.04km 가 달린 거리로 잡혔다.
-- 교사가 되돌릴 방법이 마땅치 않았다. 확인을 취소하면 마라톤 거리는 줄었지만 **포인트는 그대로 남았다**
-- (과제 글에는 있는 `승인 취소로 인한 포인트 회수` 가 독서록·일기에는 없었다).
--
-- 고침 세 가지:
--   1. 마라톤에 넣을 쪽수 상한을 한 곳(`reading_marathon_max_pages_v1`)에 두고 1,000쪽으로 낮춘다.
--      실제 책 목록의 96.4%가 400쪽 이하이고 800쪽 초과는 문제의 그 전집 한 권뿐이라 정상 독서를 막지 않는다.
--   2. 상한을 넘는 책은 거리로 세지 않고 교사의 `쪽수 확인` 목록에 이유(`too_long`)와 함께 띄운다.
--      기존에 쪽수를 모르는 책(`unknown`)을 띄우던 자리를 함께 쓴다.
--   3. 독서록·일기 확인을 취소하면 준 포인트를 회수한다. 회수 뒤 다시 확인하면 정상 지급된다.
-- 이미 들어간 상한 초과 기록은 아래에서 정리하고 캠페인 거리를 다시 계산한다.
BEGIN;

-- 상한의 정본. 여기 하나만 고치면 집계·교사 목록이 함께 움직인다.
CREATE OR REPLACE FUNCTION public.reading_marathon_max_pages_v1()
RETURNS INTEGER LANGUAGE sql IMMUTABLE SET search_path=public AS $$ SELECT 1000 $$;
REVOKE ALL ON FUNCTION public.reading_marathon_max_pages_v1() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.record_reading_marathon_contribution(p_post_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_post RECORD;
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
BEGIN
    SELECT post.id AS post_id, post.student_id, post.class_id, post.published_at,
           post.is_submitted, item.book_id,
           book.source || ':' || book.source_key AS book_key,
           book.title AS book_title, book.page_count, review.review_status
    INTO v_post
    FROM public.student_posts post
    LEFT JOIN public.reading_log_entries entry
      ON entry.post_id = post.id AND entry.class_id = post.class_id AND entry.student_id = post.student_id
    LEFT JOIN public.student_library_items item
      ON item.id = entry.library_item_id AND item.class_id = entry.class_id AND item.student_id = entry.student_id
    LEFT JOIN public.book_catalog book ON book.id = item.book_id
    LEFT JOIN public.reading_log_teacher_reviews review
      ON review.post_id = post.id AND review.class_id = post.class_id AND review.student_id = post.student_id
    WHERE post.id = p_post_id
      AND post.writing_context = 'self'
      AND post.self_writing_type = 'reading_log';
    IF NOT FOUND THEN RETURN; END IF;

    SELECT campaign.* INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = v_post.class_id
      AND campaign.archived_at IS NULL
      AND campaign.status IN ('active', 'completed')
      AND campaign.started_at IS NOT NULL
      AND COALESCE(v_post.published_at, NOW()) >= campaign.started_at
      AND (campaign.ends_on IS NULL OR COALESCE(v_post.published_at, NOW()) < campaign.ends_on + 1)
    ORDER BY campaign.created_at DESC
    LIMIT 1
    FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.reading_marathon_participants participant
        WHERE participant.campaign_id = v_campaign.id
          AND participant.class_id = v_post.class_id
          AND participant.student_id = v_post.student_id
    ) THEN RETURN; END IF;

    -- 확인 전 또는 쪽수 미확인 상태는 정상적인 대기 상태다. 저장 실패가 아니다.
    IF COALESCE(v_post.review_status, '') NOT IN ('checked', 'commented')
       OR v_post.is_submitted IS NOT TRUE
       OR v_post.book_id IS NULL
       OR NULLIF(v_post.book_key, '') IS NULL
       OR NULLIF(v_post.book_title, '') IS NULL
       OR COALESCE(v_post.page_count, 0) NOT BETWEEN 1 AND public.reading_marathon_max_pages_v1() THEN
        DELETE FROM public.reading_marathon_contributions contribution
        WHERE contribution.campaign_id = v_campaign.id
          AND contribution.class_id = v_post.class_id
          AND contribution.student_id = v_post.student_id
          AND contribution.post_id = v_post.post_id;
        PERFORM public.refresh_reading_marathon_campaign_v1(v_campaign.id);
        RETURN;
    END IF;

    INSERT INTO public.reading_marathon_contributions (
        campaign_id, class_id, student_id, post_id, book_id, book_key, book_title,
        page_count, distance_m, contributed_at
    ) VALUES (
        v_campaign.id, v_post.class_id, v_post.student_id, v_post.post_id,
        v_post.book_id, v_post.book_key, v_post.book_title, v_post.page_count,
        v_post.page_count * v_campaign.meters_per_page, COALESCE(v_post.published_at, NOW())
    )
    ON CONFLICT (campaign_id, student_id, book_key) DO UPDATE
    SET post_id = EXCLUDED.post_id, book_title = EXCLUDED.book_title,
        page_count = EXCLUDED.page_count, distance_m = EXCLUDED.distance_m, updated_at = NOW();

    PERFORM public.refresh_reading_marathon_campaign_v1(v_campaign.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_reading_marathon_snapshot(p_class_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_student_id UUID;
    v_is_teacher BOOLEAN := false;
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.id
    INTO v_student_id
    FROM public.students student
    WHERE student.class_id = p_class_id
      AND student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;

    SELECT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) INTO v_is_teacher;

    IF v_student_id IS NULL AND NOT v_is_teacher THEN
        RAISE EXCEPTION '이 학급의 독서마라톤을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT campaign.*
    INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = p_class_id
      AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC
    LIMIT 1;

    IF v_campaign.id IS NULL THEN
        RETURN jsonb_build_object(
            'campaign', NULL,
            'summary', jsonb_build_object('total_pages', 0, 'total_distance_m', 0, 'contributors', 0),
            'leaderboard', '[]'::JSONB,
            'recent', '[]'::JSONB,
            'pending_books', '[]'::JSONB,
            'my', NULL,
            'is_teacher', v_is_teacher
        );
    END IF;

    WITH roster AS MATERIALIZED (
        SELECT student.id, student.name
        FROM public.students student
        WHERE student.class_id = p_class_id
          AND student.is_active IS DISTINCT FROM false
          AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
        ORDER BY student.name, student.id
        LIMIT 100
    ), totals AS MATERIALIZED (
        SELECT
            roster.id AS student_id,
            roster.name,
            COALESCE(SUM(contribution.page_count), 0)::BIGINT AS total_pages,
            COALESCE(SUM(contribution.distance_m), 0)::BIGINT AS distance_m,
            COUNT(contribution.id)::INTEGER AS book_count
        FROM roster
        LEFT JOIN public.reading_marathon_contributions contribution
          ON contribution.student_id = roster.id
         AND contribution.class_id = p_class_id
         AND contribution.campaign_id = v_campaign.id
        GROUP BY roster.id, roster.name
    ), ranked AS MATERIALIZED (
        SELECT
            totals.*,
            DENSE_RANK() OVER (ORDER BY totals.distance_m DESC) AS rank
        FROM totals
    ), summary AS MATERIALIZED (
        SELECT
            COALESCE(SUM(contribution.page_count), 0)::BIGINT AS total_pages,
            COALESCE(SUM(contribution.distance_m), 0)::BIGINT AS total_distance_m,
            COUNT(DISTINCT contribution.student_id)::INTEGER AS contributors,
            COUNT(contribution.id)::INTEGER AS book_count
        FROM public.reading_marathon_contributions contribution
        WHERE contribution.class_id = p_class_id
          AND contribution.campaign_id = v_campaign.id
    ), recent_rows AS MATERIALIZED (
        SELECT
            contribution.id,
            contribution.student_id,
            roster.name AS student_name,
            contribution.book_title,
            contribution.page_count,
            contribution.distance_m,
            contribution.contributed_at
        FROM public.reading_marathon_contributions contribution
        JOIN roster ON roster.id = contribution.student_id
        WHERE contribution.class_id = p_class_id
          AND contribution.campaign_id = v_campaign.id
        ORDER BY contribution.contributed_at DESC, contribution.id DESC
        LIMIT 6
    ), pending_rows AS MATERIALIZED (
        SELECT
            post.id AS post_id,
            post.student_id,
            roster.name AS student_name,
            book.id AS book_id,
            book.title AS book_title,
            book.isbn13,
            book.isbn10,
            book.page_count,
            CASE WHEN book.page_count IS NULL THEN 'unknown' ELSE 'too_long' END AS reason,
            COALESCE(post.published_at, post.created_at) AS completed_at
        FROM public.student_posts post
        JOIN roster ON roster.id = post.student_id
        JOIN public.reading_log_entries entry
          ON entry.post_id = post.id
         AND entry.class_id = post.class_id
         AND entry.student_id = post.student_id
        JOIN public.student_library_items item
          ON item.id = entry.library_item_id
         AND item.class_id = entry.class_id
         AND item.student_id = entry.student_id
        JOIN public.book_catalog book ON book.id = item.book_id
        WHERE post.class_id = p_class_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log'
          AND post.is_submitted IS TRUE
          AND COALESCE(post.published_at, post.created_at) >= COALESCE(v_campaign.started_at, v_campaign.created_at)
          AND (v_campaign.ends_on IS NULL OR COALESCE(post.published_at, post.created_at) < v_campaign.ends_on + 1)
          AND (book.page_count IS NULL OR book.page_count > public.reading_marathon_max_pages_v1())
        ORDER BY COALESCE(post.published_at, post.created_at) DESC, post.id DESC
        LIMIT 20
    ), pending_count AS MATERIALIZED (
        SELECT COUNT(*)::INTEGER AS count
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
        WHERE post.class_id = p_class_id
          AND entry.class_id = p_class_id
          AND item.class_id = p_class_id
          AND post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log'
          AND post.is_submitted IS TRUE
          AND COALESCE(post.published_at, post.created_at) >= COALESCE(v_campaign.started_at, v_campaign.created_at)
          AND (v_campaign.ends_on IS NULL OR COALESCE(post.published_at, post.created_at) < v_campaign.ends_on + 1)
          AND (book.page_count IS NULL OR book.page_count > public.reading_marathon_max_pages_v1())
    )
    SELECT jsonb_build_object(
        'campaign', jsonb_build_object(
            'id', v_campaign.id,
            'title', v_campaign.title,
            'target_distance_m', v_campaign.target_distance_m,
            'meters_per_page', v_campaign.meters_per_page,
            'status', v_campaign.status,
            'is_enabled', v_campaign.status IN ('active', 'completed'),
            'started_at', v_campaign.started_at,
            'ends_on', v_campaign.ends_on,
            'completed_at', v_campaign.completed_at
        ),
        'summary', jsonb_build_object(
            'total_pages', summary.total_pages,
            'total_distance_m', summary.total_distance_m,
            'contributors', summary.contributors,
            'book_count', summary.book_count,
            'target_distance_m', v_campaign.target_distance_m,
            'progress_percent', LEAST(100, ROUND(summary.total_distance_m * 100.0 / v_campaign.target_distance_m, 1)),
            'pending_book_count', (SELECT count FROM pending_count)
        ),
        'leaderboard', COALESCE((
            SELECT jsonb_agg(to_jsonb(ranked) ORDER BY ranked.rank, ranked.name, ranked.student_id)
            FROM ranked
        ), '[]'::JSONB),
        'recent', COALESCE((
            SELECT jsonb_agg(to_jsonb(recent) ORDER BY recent.contributed_at DESC, recent.id DESC)
            FROM recent_rows recent
        ), '[]'::JSONB),
        'pending_books', CASE WHEN v_is_teacher THEN COALESCE((
            SELECT jsonb_agg(to_jsonb(pending) ORDER BY pending.completed_at DESC, pending.post_id)
            FROM pending_rows pending
        ), '[]'::JSONB) ELSE '[]'::JSONB END,
        'my', CASE WHEN v_student_id IS NULL THEN NULL ELSE (
            SELECT to_jsonb(ranked)
            FROM ranked
            WHERE ranked.student_id = v_student_id
        ) END,
        'is_teacher', v_is_teacher,
        'generated_at', NOW()
    )
    INTO v_result
    FROM summary;

    RETURN v_result;
END;
$function$;


CREATE OR REPLACE FUNCTION public.award_self_writing_review_points_v1(p_post_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_post RECORD;
    v_book_id UUID;
    v_source_key TEXT;
    v_type_label TEXT;
    v_policy_enabled BOOLEAN := TRUE;
    v_min_chars INTEGER := 0;
    v_daily_limit INTEGER := 1;
    v_rewarded_on_submission_day INTEGER := 0;
    v_points INTEGER := 0;
    v_status TEXT := 'no_reward';
    v_claim_id UUID;
    v_existing RECORD;
    v_point_result JSONB;
    v_total_points INTEGER := 0;
    v_day_start TIMESTAMPTZ;
    v_day_end TIMESTAMPTZ;
    v_policy_snapshot JSONB;
    v_recover_cycle INTEGER := 0;
BEGIN
    SELECT post.id, post.student_id, post.class_id, post.self_writing_type,
           post.created_at, post.char_count,
           COALESCE(post.awarded_base_reward, 0) AS base_reward,
           COALESCE(post.awarded_bonus_threshold, 0) AS bonus_threshold,
           COALESCE(post.awarded_bonus_reward, 0) AS bonus_reward,
           post.awarded_min_chars,
           COALESCE(post.awarded_repeat_bonus_enabled, FALSE) AS repeat_bonus_enabled,
           COALESCE(post.awarded_repeat_bonus_threshold, 0) AS repeat_bonus_threshold,
           COALESCE(post.awarded_repeat_bonus_reward, 0) AS repeat_bonus_reward,
           COALESCE(post.awarded_repeat_bonus_max_count, 0) AS repeat_bonus_max_count,
           post.structured_content
    INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id AND post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '보상할 자율 글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(student.total_points, 0) INTO v_total_points
    FROM public.students student
    WHERE student.id = v_post.student_id AND student.class_id = v_post.class_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '활성 학생 정보를 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF v_post.self_writing_type = 'reading_log' THEN
        SELECT item.book_id INTO v_book_id
        FROM public.reading_log_entries entry
        JOIN public.student_library_items item
          ON item.id = entry.library_item_id AND item.class_id = entry.class_id
         AND item.student_id = entry.student_id
        WHERE entry.post_id = v_post.id AND entry.class_id = v_post.class_id
          AND entry.student_id = v_post.student_id;
        v_source_key := COALESCE(v_book_id::TEXT, format('post:%s', v_post.id));
        v_type_label := '독서록';
    ELSE
        v_source_key := COALESCE(
            NULLIF(v_post.structured_content ->> 'diaryDate', ''),
            (v_post.created_at AT TIME ZONE 'Asia/Seoul')::DATE::TEXT
        );
        v_type_label := '일기';
    END IF;

    SELECT claim.id, claim.awarded_points, claim.reward_status INTO v_existing
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_post.student_id
      AND claim.writing_type = v_post.self_writing_type
      AND claim.reward_kind = 'completion'
      AND (claim.source_post_id = v_post.id OR claim.source_key = v_source_key)
    ORDER BY claim.created_at, claim.id LIMIT 1;
    IF FOUND THEN
        RETURN jsonb_build_object(
            'points_awarded', 0, 'reward_status', 'already_claimed',
            'original_reward_status', v_existing.reward_status,
            'original_points', v_existing.awarded_points, 'total_points', v_total_points
        );
    END IF;

    SELECT COALESCE(policy.is_enabled, TRUE), COALESCE(policy.min_chars, 0),
           GREATEST(1, COALESCE(policy.daily_reward_limit, 1))
    INTO v_policy_enabled, v_min_chars, v_daily_limit
    FROM public.class_writing_policies policy
    WHERE policy.class_id = v_post.class_id
      AND policy.writing_type = v_post.self_writing_type;
    v_policy_enabled := COALESCE(v_policy_enabled, TRUE);
    v_daily_limit := GREATEST(1, COALESCE(v_daily_limit, 1));

    -- 확인 취소로 회수한 횟수. 열쇠에 넣어야 회수 뒤 다시 확인할 때 재지급된다.
    -- 같은 회차 안에서는 열쇠가 같아 되풀이 확인이 두 번 지급하지 않는다.
    SELECT count(*)::INTEGER INTO v_recover_cycle
    FROM public.point_logs pl
    WHERE pl.post_id = v_post.id AND pl.student_id = v_post.student_id
      AND pl.amount < 0 AND pl.reason ILIKE '%확인 취소%';

    v_day_start := ((v_post.created_at AT TIME ZONE 'Asia/Seoul')::DATE::TIMESTAMP AT TIME ZONE 'Asia/Seoul');
    v_day_end := v_day_start + INTERVAL '1 day';
    SELECT COUNT(*)::INTEGER INTO v_rewarded_on_submission_day
    FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_post.student_id AND claim.class_id = v_post.class_id
      AND claim.writing_type = v_post.self_writing_type AND claim.reward_kind = 'completion'
      AND claim.awarded_points > 0
      AND claim.created_at >= v_day_start AND claim.created_at < v_day_end;

    IF NOT v_policy_enabled THEN
        v_status := 'policy_disabled';
    ELSIF v_rewarded_on_submission_day >= v_daily_limit THEN
        v_status := 'daily_limit';
    ELSE
        v_points := public.calculate_writing_reward_total_v1(
            v_post.base_reward, COALESCE(v_post.awarded_min_chars, v_min_chars, 0), v_post.char_count,
            v_post.bonus_threshold, v_post.bonus_reward,
            v_post.repeat_bonus_enabled, v_post.repeat_bonus_threshold,
            v_post.repeat_bonus_reward, v_post.repeat_bonus_max_count
        );
        v_status := CASE WHEN v_points > 0 THEN 'awarded' ELSE 'no_reward' END;
    END IF;

    v_policy_snapshot := jsonb_build_object(
        'reward_gate', 'teacher_review', 'submitted_at', v_post.created_at,
        'daily_reward_limit', v_daily_limit, 'base_reward', v_post.base_reward,
        'bonus_threshold', v_post.bonus_threshold, 'bonus_reward', v_post.bonus_reward,
        'repeat_bonus_enabled', v_post.repeat_bonus_enabled,
        'repeat_bonus_threshold', v_post.repeat_bonus_threshold,
        'repeat_bonus_reward', v_post.repeat_bonus_reward,
        'repeat_bonus_max_count', v_post.repeat_bonus_max_count
    );

    INSERT INTO public.writing_reward_claims (
        class_id, student_id, writing_type, source_key, source_post_id,
        reward_kind, awarded_points, reward_status, policy_snapshot, created_at
    ) VALUES (
        v_post.class_id, v_post.student_id, v_post.self_writing_type,
        v_source_key, v_post.id, 'completion', v_points, v_status,
        v_policy_snapshot, v_post.created_at
    )
    ON CONFLICT (student_id, writing_type, source_key, reward_kind) DO NOTHING
    RETURNING id INTO v_claim_id;

    IF v_claim_id IS NULL THEN
        RETURN jsonb_build_object(
            'points_awarded', 0, 'reward_status', 'already_claimed',
            'total_points', v_total_points
        );
    END IF;

    IF v_points > 0 THEN
        v_point_result := public.point_engine_apply(
            v_post.student_id, v_points, format('%s 선생님 확인 보상', v_type_label),
            'writing_reward', format('self-writing-review:%s:%s', v_post.id, v_recover_cycle),
            v_post.id, NULL,
            jsonb_build_object('source', 'self_writing_teacher_review',
                'writing_type', v_post.self_writing_type)
        );
        v_total_points := COALESCE((v_point_result ->> 'total_points')::INTEGER, v_total_points);
    END IF;

    RETURN jsonb_build_object(
        'points_awarded', v_points, 'reward_status', v_status,
        'total_points', v_total_points
    );
END;
$function$;

-- 독서록·일기 확인 취소 시 포인트 회수. 과제 글의 recover_assignment_post_approval 과 같은 방식이다.
CREATE OR REPLACE FUNCTION public.recover_self_writing_review_points_v1(p_post_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
    v_post RECORD; v_net INTEGER := 0; v_cycle INTEGER; v_type_label TEXT; v_result JSONB;
BEGIN
    SELECT post.id, post.student_id, post.class_id, post.self_writing_type INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id AND post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary');
    IF NOT FOUND THEN RETURN jsonb_build_object('points_recovered', 0); END IF;
    v_type_label := CASE WHEN v_post.self_writing_type = 'reading_log' THEN '독서록' ELSE '일기' END;

    -- 이 글로 오간 보상의 순합만 되돌린다. 이미 회수한 뒤 또 부르면 0이 되어 두 번 깎지 않는다.
    SELECT GREATEST(0, COALESCE(sum(pl.amount), 0))::INTEGER INTO v_net
    FROM public.point_logs pl
    WHERE pl.post_id = v_post.id AND pl.student_id = v_post.student_id
      AND pl.activity_type = 'writing_reward';
    IF v_net <= 0 THEN RETURN jsonb_build_object('points_recovered', 0); END IF;

    SELECT count(*)::INTEGER + 1 INTO v_cycle
    FROM public.point_logs pl
    WHERE pl.post_id = v_post.id AND pl.student_id = v_post.student_id
      AND pl.amount < 0 AND pl.reason ILIKE '%확인 취소%';

    v_result := public.point_engine_apply(
        v_post.student_id, -v_net,
        format('%s 확인 취소로 인한 포인트 회수 ⚠️', v_type_label),
        'writing_reward', format('self-writing-recover:%s:%s', v_post.id, v_cycle),
        v_post.id, NULL,
        jsonb_build_object('source', 'self_writing_review_recovery', 'cycle', v_cycle,
            'writing_type', v_post.self_writing_type)
    );
    -- 다시 확인하면 정상 지급되도록 지급 기록을 지운다(멱등 열쇠가 남아 있으면 재지급이 막힌다).
    DELETE FROM public.writing_reward_claims claim
    WHERE claim.student_id = v_post.student_id AND claim.source_post_id = v_post.id;

    RETURN jsonb_build_object(
        'points_recovered', abs(COALESCE((v_result->>'applied_amount')::INTEGER, 0)),
        'total_points', (v_result->>'total_points')::INTEGER);
END; $$;
REVOKE ALL ON FUNCTION public.recover_self_writing_review_points_v1(UUID) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.save_teacher_self_writing_review_v2(p_post_id uuid, p_teacher_comment text DEFAULT ''::text, p_decision text DEFAULT 'accepted'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_post RECORD;
    v_old public.reading_log_teacher_reviews%ROWTYPE;
    v_comment TEXT := left(btrim(COALESCE(p_teacher_comment, '')), 500);
    v_status TEXT;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_module_id TEXT;
    v_event_type TEXT;
    v_type_label TEXT;
    v_marathon_applied BOOLEAN := FALSE;
    v_reward JSONB := jsonb_build_object(
        'points_awarded', 0, 'reward_status', 'not_awarded', 'total_points', NULL
    );
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_decision NOT IN ('accepted', 'revision_requested') THEN
        RAISE EXCEPTION '확인 결과가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT post.id, post.student_id, post.class_id, post.title, post.self_writing_type
    INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id AND post.writing_context = 'self'
      AND post.self_writing_type IN ('reading_log', 'diary')
      AND post.is_submitted IS TRUE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '확인할 학생 글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF public.auth_user_role() <> 'ADMIN' AND NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = v_post.class_id AND class.teacher_id = auth.uid()
    ) THEN
        RAISE EXCEPTION '이 학급의 학생 글을 확인할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    v_status := CASE WHEN p_decision = 'revision_requested'
        THEN 'revision_requested' ELSE 'checked' END;

    SELECT review.* INTO v_old
    FROM public.reading_log_teacher_reviews review
    WHERE review.post_id = p_post_id
    FOR UPDATE;

    IF v_old.post_id IS NOT NULL
       AND v_old.review_status = v_status
       AND v_old.teacher_comment = v_comment THEN
        IF v_status = 'checked' THEN
            v_reward := public.award_self_writing_review_points_v1(p_post_id);
        END IF;
        RETURN jsonb_build_object(
            'success', TRUE, 'changed', FALSE, 'post_id', p_post_id,
            'review_status', v_status, 'teacher_comment', v_comment,
            'reviewed_at', v_old.reviewed_at
        ) || v_reward;
    END IF;

    INSERT INTO public.reading_log_teacher_reviews (
        post_id, student_id, class_id, teacher_id, review_status, teacher_comment, reviewed_at
    ) VALUES (
        p_post_id, v_post.student_id, v_post.class_id, auth.uid(), v_status, v_comment, v_now
    )
    ON CONFLICT (post_id) DO UPDATE
    SET student_id = EXCLUDED.student_id, class_id = EXCLUDED.class_id,
        teacher_id = EXCLUDED.teacher_id, review_status = EXCLUDED.review_status,
        teacher_comment = EXCLUDED.teacher_comment, reviewed_at = EXCLUDED.reviewed_at,
        updated_at = v_now;

    IF v_status = 'checked' THEN
        v_reward := public.award_self_writing_review_points_v1(p_post_id);
    ELSIF v_old.review_status = 'checked' THEN
        -- 확인을 취소하면 준 포인트를 되돌린다. 과제 글(recover_assignment_post_approval)과 같은 방식이다.
        -- 이게 없어서, 잘못 올린 독서록의 확인을 취소해도 포인트만 남았다.
        v_reward := public.recover_self_writing_review_points_v1(p_post_id);
    END IF;

    v_module_id := CASE WHEN v_post.self_writing_type = 'reading_log' THEN 'reading-log' ELSE 'diary' END;
    v_type_label := CASE WHEN v_post.self_writing_type = 'reading_log' THEN '독서록' ELSE '일기' END;
    v_event_type := format('%s.%s', v_module_id, CASE
        WHEN v_status = 'revision_requested' THEN 'revision_requested'
        ELSE 'review_completed'
    END);

    DELETE FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id AND event.class_id = v_post.class_id
      AND event.module_id = v_module_id AND event.entity_type = 'student_post'
      AND event.entity_id = p_post_id AND event.read_at IS NULL;

    IF v_post.self_writing_type = 'reading_log' AND v_status = 'checked' THEN
        SELECT EXISTS (
            SELECT 1
            FROM public.reading_marathon_contributions contribution
            JOIN public.reading_marathon_campaigns campaign
              ON campaign.id = contribution.campaign_id
             AND campaign.class_id = contribution.class_id
            WHERE contribution.class_id = v_post.class_id
              AND contribution.student_id = v_post.student_id
              AND contribution.post_id = p_post_id
              AND campaign.archived_at IS NULL
        ) INTO v_marathon_applied;
    END IF;

    PERFORM public.notification_emit_v1(
        v_post.student_id, v_module_id, v_event_type,
        'student_post', p_post_id,
        jsonb_build_object(
            'post_id', p_post_id,
            'post_title', COALESCE(v_post.title, '제목 없는 글'),
            'content_type', v_post.self_writing_type,
            'content_type_label', v_type_label,
            'has_comment', v_comment <> '',
            'marathon_applied', v_marathon_applied,
            'points_awarded', COALESCE((v_reward ->> 'points_awarded')::INTEGER, 0)
        ),
        format('self-review:%s:%s:%s', p_post_id, v_status,
            floor(extract(epoch FROM v_now) * 1000000)::BIGINT)
    );

    RETURN jsonb_build_object(
        'success', TRUE, 'changed', TRUE, 'post_id', p_post_id,
        'review_status', v_status, 'teacher_comment', v_comment,
        'reviewed_at', v_now, 'marathon_applied', v_marathon_applied
    ) || v_reward;
END;
$function$;

-- 이미 들어간 상한 초과 기록을 정리하고 캠페인 거리를 다시 계산한다.
DELETE FROM public.reading_marathon_contributions
 WHERE page_count > public.reading_marathon_max_pages_v1();
DO $$ DECLARE c UUID; BEGIN
  FOR c IN SELECT id FROM public.reading_marathon_campaigns WHERE archived_at IS NULL LOOP
    PERFORM public.refresh_reading_marathon_campaign_v1(c);
  END LOOP;
END; $$;

NOTIFY pgrst,'reload schema';
COMMIT;

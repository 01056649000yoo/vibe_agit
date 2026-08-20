-- 교사 확인 전이거나 쪽수를 아직 찾지 못한 독서록은 저장은 허용하고,
-- 독서마라톤 집계만 보류한다.
--
-- SQL의 `NULL NOT IN (...)`과 `NULL NOT BETWEEN ...` 결과도 NULL이므로,
-- 기존 IF 조건이 실행되지 않아 NULL 쪽수를 기여 테이블에 넣고 저장 전체를
-- 롤백시키던 회귀를 바로잡는다.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_reading_marathon_contribution(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
       OR COALESCE(v_post.page_count, 0) NOT BETWEEN 1 AND 10000 THEN
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
$$;

REVOKE ALL ON FUNCTION public.record_reading_marathon_contribution(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_reading_marathon_contribution(UUID) TO service_role;

-- 회귀가 배포된 짧은 동안 확인 전에 잘못 잡힌 기여가 있다면 제거하고 누계를 맞춘다.
DO $$
DECLARE
    v_campaign_id UUID;
BEGIN
    FOR v_campaign_id IN
        SELECT DISTINCT contribution.campaign_id
        FROM public.reading_marathon_contributions contribution
        WHERE NOT EXISTS (
            SELECT 1
            FROM public.student_posts post
            JOIN public.reading_log_entries entry
              ON entry.post_id = post.id
             AND entry.class_id = post.class_id
             AND entry.student_id = post.student_id
            JOIN public.student_library_items item
              ON item.id = entry.library_item_id
             AND item.class_id = entry.class_id
             AND item.student_id = entry.student_id
            JOIN public.book_catalog book
              ON book.id = item.book_id
            JOIN public.reading_log_teacher_reviews review
              ON review.post_id = post.id
             AND review.class_id = post.class_id
             AND review.student_id = post.student_id
             AND review.review_status IN ('checked', 'commented')
            WHERE post.id = contribution.post_id
              AND post.class_id = contribution.class_id
              AND post.student_id = contribution.student_id
              AND post.writing_context = 'self'
              AND post.self_writing_type = 'reading_log'
              AND post.is_submitted IS TRUE
              AND book.page_count BETWEEN 1 AND 10000
        )
        ORDER BY contribution.campaign_id
    LOOP
        DELETE FROM public.reading_marathon_contributions contribution
        WHERE contribution.campaign_id = v_campaign_id
          AND NOT EXISTS (
              SELECT 1
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
              JOIN public.reading_log_teacher_reviews review
                ON review.post_id = post.id
               AND review.class_id = post.class_id
               AND review.student_id = post.student_id
               AND review.review_status IN ('checked', 'commented')
              WHERE post.id = contribution.post_id
                AND post.class_id = contribution.class_id
                AND post.student_id = contribution.student_id
                AND post.writing_context = 'self'
                AND post.self_writing_type = 'reading_log'
                AND post.is_submitted IS TRUE
                AND book.page_count BETWEEN 1 AND 10000
          );
        PERFORM public.refresh_reading_marathon_campaign_v1(v_campaign_id);
    END LOOP;
END;
$$;

COMMIT;

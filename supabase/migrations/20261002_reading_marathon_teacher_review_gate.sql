-- 독서마라톤 거리는 학생이 독서록을 작성 완료한 뒤 교사가 확인한 글만 반영한다.
-- 작성 완료·책 연결·페이지 수·교사 확인의 순서가 달라도 마지막 조건이 갖춰지는 순간 한 번만 집계한다.

BEGIN;

CREATE OR REPLACE FUNCTION public.record_reading_marathon_contribution(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post RECORD;
    v_campaign RECORD;
    v_total_distance BIGINT;
BEGIN
    SELECT
        post.id AS post_id,
        post.student_id,
        post.class_id,
        post.published_at,
        item.book_id,
        book.source || ':' || book.source_key AS book_key,
        book.title AS book_title,
        book.page_count
    INTO v_post
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
    WHERE post.id = p_post_id
      AND post.class_id = entry.class_id
      AND post.writing_context = 'self'
      AND post.self_writing_type = 'reading_log'
      AND post.is_submitted IS TRUE
      AND book.page_count BETWEEN 1 AND 10000
      AND EXISTS (
          SELECT 1
          FROM public.reading_log_teacher_reviews review
          WHERE review.post_id = post.id
            AND review.class_id = post.class_id
            AND review.student_id = post.student_id
      );

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT campaign.*
    INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = v_post.class_id
      AND campaign.archived_at IS NULL
      AND campaign.status IN ('active', 'completed')
      AND campaign.started_at IS NOT NULL
      AND COALESCE(v_post.published_at, NOW()) >= campaign.started_at
      AND (campaign.ends_on IS NULL OR COALESCE(v_post.published_at, NOW()) < campaign.ends_on + 1)
    ORDER BY campaign.created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    INSERT INTO public.reading_marathon_contributions (
        campaign_id, class_id, student_id, post_id, book_id, book_key, book_title,
        page_count, distance_m, contributed_at
    ) VALUES (
        v_campaign.id, v_post.class_id, v_post.student_id, v_post.post_id,
        v_post.book_id, v_post.book_key, v_post.book_title, v_post.page_count,
        v_post.page_count * v_campaign.meters_per_page,
        COALESCE(v_post.published_at, NOW())
    )
    ON CONFLICT (campaign_id, student_id, book_key) DO UPDATE
    SET post_id = EXCLUDED.post_id,
        book_title = EXCLUDED.book_title,
        page_count = EXCLUDED.page_count,
        distance_m = EXCLUDED.distance_m,
        updated_at = NOW();

    SELECT COALESCE(SUM(contribution.distance_m), 0)
    INTO v_total_distance
    FROM public.reading_marathon_contributions contribution
    WHERE contribution.class_id = v_post.class_id
      AND contribution.campaign_id = v_campaign.id;

    IF v_total_distance >= v_campaign.target_distance_m THEN
        UPDATE public.reading_marathon_campaigns campaign
        SET status = 'completed',
            completed_at = COALESCE(campaign.completed_at, NOW()),
            updated_at = NOW()
        WHERE campaign.id = v_campaign.id
          AND campaign.class_id = v_post.class_id
          AND campaign.status = 'active';
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.record_reading_marathon_contribution(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_reading_marathon_contribution(UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.on_reading_log_teacher_review_marathon_contribution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    PERFORM public.record_reading_marathon_contribution(NEW.post_id);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reading_log_teacher_review_marathon_contribution
    ON public.reading_log_teacher_reviews;
CREATE TRIGGER trg_reading_log_teacher_review_marathon_contribution
AFTER INSERT OR UPDATE OF review_status, reviewed_at
ON public.reading_log_teacher_reviews
FOR EACH ROW EXECUTE FUNCTION public.on_reading_log_teacher_review_marathon_contribution();

REVOKE ALL ON FUNCTION public.on_reading_log_teacher_review_marathon_contribution()
    FROM PUBLIC, anon, authenticated;

-- 이미 확인된 독서록도 현재 캠페인 기간·페이지 수 조건에 맞으면 빠짐없이 채운다.
DO $$
DECLARE
    v_post_id UUID;
BEGIN
    FOR v_post_id IN
        SELECT review.post_id
        FROM public.reading_log_teacher_reviews review
        JOIN public.student_posts post
          ON post.id = review.post_id
         AND post.class_id = review.class_id
         AND post.student_id = review.student_id
        WHERE post.writing_context = 'self'
          AND post.self_writing_type = 'reading_log'
          AND post.is_submitted IS TRUE
        ORDER BY review.reviewed_at, review.post_id
    LOOP
        PERFORM public.record_reading_marathon_contribution(v_post_id);
    END LOOP;
END;
$$;

COMMIT;

-- 자율 글은 학생이 스스로 완료하되, 교사는 `확인 완료`와 `보완 요청`을 구분한다.
-- 확인 완료된 독서록만 진행 중인 독서마라톤에 반영하고, 두 처리 결과는 기존 학생 활동
-- 알림 원장에 같은 트랜잭션으로 남긴다. 과거 확인 기록은 그대로 인정하되 소급 알림하지 않는다.

BEGIN;

ALTER TABLE public.reading_log_teacher_reviews
    DROP CONSTRAINT IF EXISTS reading_log_teacher_reviews_review_status_check;
ALTER TABLE public.reading_log_teacher_reviews
    DROP CONSTRAINT IF EXISTS reading_log_review_comment_shape;
ALTER TABLE public.reading_log_teacher_reviews
    ADD CONSTRAINT reading_log_teacher_reviews_review_status_check
        CHECK (review_status IN ('checked', 'commented', 'revision_requested')),
    ADD CONSTRAINT reading_log_review_comment_shape CHECK (
        (review_status = 'checked' AND teacher_comment = '')
        OR (review_status = 'commented' AND btrim(teacher_comment) <> '')
        OR (review_status = 'revision_requested' AND btrim(teacher_comment) <> '')
    );

CREATE OR REPLACE FUNCTION public.record_reading_marathon_contribution(p_post_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post RECORD;
    v_campaign RECORD;
    v_review_status TEXT;
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
        book.page_count,
        review.review_status
    INTO v_post
    FROM public.student_posts post
    LEFT JOIN public.reading_log_entries entry
      ON entry.post_id = post.id
     AND entry.class_id = post.class_id
     AND entry.student_id = post.student_id
    LEFT JOIN public.student_library_items item
      ON item.id = entry.library_item_id
     AND item.class_id = entry.class_id
     AND item.student_id = entry.student_id
    LEFT JOIN public.book_catalog book ON book.id = item.book_id
    LEFT JOIN public.reading_log_teacher_reviews review
      ON review.post_id = post.id
     AND review.class_id = post.class_id
     AND review.student_id = post.student_id
    WHERE post.id = p_post_id
      AND post.writing_context = 'self'
      AND post.self_writing_type = 'reading_log';

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

    v_review_status := v_post.review_status;
    IF v_review_status NOT IN ('checked', 'commented')
       OR v_post.page_count NOT BETWEEN 1 AND 10000 THEN
        DELETE FROM public.reading_marathon_contributions contribution
        WHERE contribution.campaign_id = v_campaign.id
          AND contribution.class_id = v_post.class_id
          AND contribution.student_id = v_post.student_id
          AND contribution.post_id = v_post.post_id;

        SELECT COALESCE(SUM(contribution.distance_m), 0)
        INTO v_total_distance
        FROM public.reading_marathon_contributions contribution
        WHERE contribution.class_id = v_post.class_id
          AND contribution.campaign_id = v_campaign.id;

        -- 아직 결과를 보관하지 않은 공동 캠페인은 잘못 인정한 글을 취소했을 때 진행 상태도 되돌린다.
        UPDATE public.reading_marathon_campaigns campaign
        SET status = 'active', completed_at = NULL, updated_at = NOW()
        WHERE campaign.id = v_campaign.id
          AND campaign.class_id = v_post.class_id
          AND campaign.status = 'completed'
          AND v_total_distance < campaign.target_distance_m;
        RETURN;
    END IF;

    IF v_post.book_id IS NULL OR v_post.book_key IS NULL OR v_post.book_title IS NULL
       OR NOT EXISTS (
           SELECT 1 FROM public.student_posts post
           WHERE post.id = v_post.post_id
             AND post.is_submitted IS TRUE
       ) THEN
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

CREATE OR REPLACE FUNCTION public.save_teacher_self_writing_review_v2(
    p_post_id UUID,
    p_teacher_comment TEXT DEFAULT '',
    p_decision TEXT DEFAULT 'accepted'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_decision NOT IN ('accepted', 'revision_requested') THEN
        RAISE EXCEPTION '확인 결과가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;
    IF p_decision = 'revision_requested' AND v_comment = '' THEN
        RAISE EXCEPTION '보완할 내용을 학생에게 적어주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT post.id, post.student_id, post.class_id, post.title, post.self_writing_type
    INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id
      AND post.writing_context = 'self'
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

    v_status := CASE
        WHEN p_decision = 'revision_requested' THEN 'revision_requested'
        WHEN v_comment = '' THEN 'checked'
        ELSE 'commented'
    END;

    SELECT review.* INTO v_old
    FROM public.reading_log_teacher_reviews review
    WHERE review.post_id = p_post_id
    FOR UPDATE;

    IF v_old.post_id IS NOT NULL
       AND v_old.review_status = v_status
       AND v_old.teacher_comment = v_comment THEN
        RETURN jsonb_build_object(
            'success', TRUE, 'changed', FALSE, 'post_id', p_post_id,
            'review_status', v_status, 'teacher_comment', v_comment,
            'reviewed_at', v_old.reviewed_at
        );
    END IF;

    INSERT INTO public.reading_log_teacher_reviews (
        post_id, student_id, class_id, teacher_id, review_status, teacher_comment, reviewed_at
    ) VALUES (
        p_post_id, v_post.student_id, v_post.class_id, auth.uid(), v_status, v_comment, v_now
    )
    ON CONFLICT (post_id) DO UPDATE
    SET student_id = EXCLUDED.student_id,
        class_id = EXCLUDED.class_id,
        teacher_id = EXCLUDED.teacher_id,
        review_status = EXCLUDED.review_status,
        teacher_comment = EXCLUDED.teacher_comment,
        reviewed_at = EXCLUDED.reviewed_at,
        updated_at = v_now;

    v_module_id := CASE WHEN v_post.self_writing_type = 'reading_log' THEN 'reading-log' ELSE 'diary' END;
    v_type_label := CASE WHEN v_post.self_writing_type = 'reading_log' THEN '독서록' ELSE '일기' END;
    v_event_type := format('%s.%s', v_module_id, CASE
        WHEN v_status = 'revision_requested' THEN 'revision_requested'
        ELSE 'review_completed'
    END);

    DELETE FROM public.student_notification_events event
    WHERE event.student_id = v_post.student_id
      AND event.class_id = v_post.class_id
      AND event.module_id = v_module_id
      AND event.entity_type = 'student_post'
      AND event.entity_id = p_post_id
      AND event.read_at IS NULL;

    IF v_post.self_writing_type = 'reading_log' AND v_status IN ('checked', 'commented') THEN
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
        v_post.student_id,
        v_module_id,
        v_event_type,
        'student_post',
        p_post_id,
        jsonb_build_object(
            'post_id', p_post_id,
            'post_title', COALESCE(v_post.title, '제목 없는 글'),
            'content_type', v_post.self_writing_type,
            'content_type_label', v_type_label,
            'has_comment', v_comment <> '',
            'marathon_applied', v_marathon_applied
        ),
        format('self-review:%s:%s:%s', p_post_id, v_status, floor(extract(epoch FROM v_now) * 1000000)::BIGINT)
    );

    RETURN jsonb_build_object(
        'success', TRUE, 'changed', TRUE, 'post_id', p_post_id,
        'review_status', v_status, 'teacher_comment', v_comment,
        'reviewed_at', v_now, 'marathon_applied', v_marathon_applied
    );
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_self_writing_review_v2(UUID, TEXT, TEXT)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_self_writing_review_v2(UUID, TEXT, TEXT)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_teacher_reading_log_reviews_bulk_v2(p_post_ids UUID[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_requested_count INTEGER;
    v_confirmed_count INTEGER := 0;
    v_post_id UUID;
    v_result JSONB;
BEGIN
    SELECT COUNT(DISTINCT post_id)::INTEGER
    INTO v_requested_count
    FROM unnest(COALESCE(p_post_ids, '{}'::UUID[])) AS post_id;
    IF v_requested_count NOT BETWEEN 1 AND 100 THEN
        RAISE EXCEPTION '한 번에 확인할 독서록은 1~100편이어야 합니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_post_id IN SELECT DISTINCT post_id FROM unnest(p_post_ids) AS post_id
    LOOP
        v_result := public.save_teacher_self_writing_review_v2(v_post_id, '', 'accepted');
        IF COALESCE((v_result->>'changed')::BOOLEAN, FALSE) THEN
            v_confirmed_count := v_confirmed_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', TRUE,
        'requested_count', v_requested_count,
        'confirmed_count', v_confirmed_count,
        'already_reviewed_count', v_requested_count - v_confirmed_count,
        'reviewed_at', NOW()
    );
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_reading_log_reviews_bulk_v2(UUID[])
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_reading_log_reviews_bulk_v2(UUID[])
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_post_engagement(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_post public.student_posts%ROWTYPE;
    v_type_label TEXT;
    v_teacher JSONB;
    v_status TEXT;
    v_status_label TEXT;
    v_result JSONB;
BEGIN
    IF public.auth_user_role() <> 'STUDENT' OR v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_post
    FROM public.student_posts post
    WHERE post.id = p_post_id AND post.student_id = v_student_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION '내 글을 찾지 못했습니다.' USING ERRCODE = 'P0002';
    END IF;

    SELECT COALESCE(writing_type.label, '선생님 과제') INTO v_type_label
    FROM (SELECT 1) one
    LEFT JOIN public.writing_types writing_type ON writing_type.id = v_post.self_writing_type;

    IF v_post.writing_context = 'self' THEN
        SELECT jsonb_build_object(
            'has_comment', NULLIF(btrim(COALESCE(review.teacher_comment, '')), '') IS NOT NULL,
            'comment', NULLIF(btrim(COALESCE(review.teacher_comment, '')), ''),
            'checked', review.post_id IS NOT NULL AND review.review_status <> 'revision_requested',
            'revision_requested', review.review_status = 'revision_requested',
            'checked_at', review.reviewed_at
        ) INTO v_teacher
        FROM public.reading_log_teacher_reviews review
        WHERE review.post_id = v_post.id AND review.class_id = v_post.class_id;

        v_teacher := COALESCE(v_teacher, jsonb_build_object(
            'has_comment', FALSE, 'comment', NULL, 'checked', FALSE,
            'revision_requested', FALSE, 'checked_at', NULL
        ));
        v_status := CASE
            WHEN NOT COALESCE(v_post.is_submitted, FALSE) THEN 'draft'
            WHEN (v_teacher->>'revision_requested')::BOOLEAN THEN 'revision_requested'
            WHEN (v_teacher->>'checked')::BOOLEAN THEN 'reviewed'
            ELSE 'submitted'
        END;
        v_status_label := CASE v_status
            WHEN 'draft' THEN '아직 완료하지 않았어요'
            WHEN 'revision_requested' THEN '선생님이 보완을 요청했어요'
            WHEN 'reviewed' THEN '선생님이 확인했어요'
            ELSE '작성 완료했어요'
        END;
    ELSE
        v_teacher := jsonb_build_object(
            'has_comment', NULLIF(btrim(COALESCE(v_post.ai_feedback, '')), '') IS NOT NULL,
            'comment', NULLIF(btrim(COALESCE(v_post.ai_feedback, '')), ''),
            'checked', COALESCE(v_post.is_confirmed, FALSE),
            'revision_requested', COALESCE(v_post.is_returned, FALSE),
            'checked_at', v_post.approved_at
        );
        v_status := CASE
            WHEN COALESCE(v_post.is_confirmed, FALSE) THEN 'approved'
            WHEN COALESCE(v_post.is_returned, FALSE) THEN 'returned'
            WHEN COALESCE(v_post.is_submitted, FALSE) THEN 'submitted'
            ELSE 'draft'
        END;
        v_status_label := CASE v_status
            WHEN 'approved' THEN '선생님이 승인했어요'
            WHEN 'returned' THEN '다시 쓰기를 받았어요'
            WHEN 'submitted' THEN '냈어요. 선생님 확인을 기다려요'
            ELSE '아직 내지 않았어요'
        END;
    END IF;

    SELECT jsonb_build_object(
        'post_id', v_post.id,
        'writing_context', v_post.writing_context,
        'self_writing_type', v_post.self_writing_type,
        'type_label', CASE WHEN v_post.writing_context = 'self' THEN v_type_label ELSE '선생님 과제' END,
        'visibility', v_post.visibility,
        'submission', jsonb_build_object(
            'is_submitted', COALESCE(v_post.is_submitted, FALSE),
            'submitted_at', v_post.first_submitted_at,
            'status', v_status,
            'status_label', v_status_label
        ),
        'teacher', v_teacher,
        'comments', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', comment.id,
                'content', comment.content,
                'created_at', comment.created_at,
                'is_teacher', comment.teacher_id IS NOT NULL AND comment.student_id IS NULL,
                'author_name', CASE
                    WHEN comment.teacher_id IS NOT NULL AND comment.student_id IS NULL THEN '선생님'
                    ELSE COALESCE(writer.name, '알 수 없는 친구')
                END
            ) ORDER BY comment.created_at)
            FROM public.post_comments comment
            LEFT JOIN public.students writer
              ON writer.id = comment.student_id AND writer.class_id = comment.class_id
            WHERE comment.post_id = v_post.id
              AND comment.class_id = v_post.class_id
              AND ((comment.teacher_id IS NOT NULL AND comment.student_id IS NULL) OR comment.status = 'approved')
              AND (writer.id IS NULL OR writer.deleted_at IS NULL)
        ), '[]'::JSONB),
        'reaction_count', (
            SELECT count(*)::INTEGER FROM public.post_reactions reaction
            WHERE reaction.post_id = v_post.id AND reaction.class_id = v_post.class_id
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_post_engagement(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_post_engagement(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

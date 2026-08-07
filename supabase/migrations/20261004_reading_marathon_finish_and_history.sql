-- 진행 중인 독서마라톤을 기록을 보존한 채 중간 종료하고,
-- 교사가 종료된 캠페인의 최종 집계·학생별 순위를 다시 볼 수 있게 한다.

BEGIN;

ALTER TABLE public.reading_marathon_campaigns
    ADD COLUMN IF NOT EXISTS finish_reason TEXT;

ALTER TABLE public.reading_marathon_campaigns
    DROP CONSTRAINT IF EXISTS reading_marathon_finish_reason;
ALTER TABLE public.reading_marathon_campaigns
    ADD CONSTRAINT reading_marathon_finish_reason
    CHECK (finish_reason IS NULL OR finish_reason IN ('completed', 'ended_early', 'replaced'));

UPDATE public.reading_marathon_campaigns
SET finish_reason = CASE WHEN completed_at IS NULL THEN 'replaced' ELSE 'completed' END
WHERE archived_at IS NOT NULL
  AND finish_reason IS NULL;

CREATE INDEX IF NOT EXISTS idx_reading_marathon_class_archived
    ON public.reading_marathon_campaigns (class_id, archived_at DESC)
    WHERE archived_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.save_teacher_reading_marathon(
    p_class_id UUID,
    p_title TEXT,
    p_target_distance_m INTEGER,
    p_ends_on DATE DEFAULT NULL,
    p_enabled BOOLEAN DEFAULT true,
    p_start_new BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current public.reading_marathon_campaigns%ROWTYPE;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public.classes class
    WHERE class.id = p_class_id
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 독서마라톤을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION '마라톤 이름은 1~60자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_target_distance_m NOT BETWEEN 1000 AND 10000000 THEN
        RAISE EXCEPTION '목표 거리는 1km~10,000km 사이로 정해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_ends_on IS NOT NULL AND p_ends_on < CURRENT_DATE THEN
        RAISE EXCEPTION '종료일은 오늘 이후로 정해주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT campaign.*
    INTO v_current
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = p_class_id
      AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF p_start_new AND v_current.id IS NOT NULL THEN
        UPDATE public.reading_marathon_campaigns
        SET status = 'archived',
            finish_reason = CASE WHEN v_current.status = 'completed' THEN 'completed' ELSE 'replaced' END,
            archived_at = v_now,
            updated_at = v_now
        WHERE id = v_current.id AND class_id = p_class_id;
        v_current.id := NULL;
    END IF;

    IF v_current.id IS NULL THEN
        INSERT INTO public.reading_marathon_campaigns (
            class_id, teacher_id, title, target_distance_m, status, started_at, ends_on
        ) VALUES (
            p_class_id, auth.uid(), btrim(p_title), p_target_distance_m,
            CASE WHEN p_enabled THEN 'active' ELSE 'draft' END,
            CASE WHEN p_enabled THEN v_now ELSE NULL END,
            p_ends_on
        );
    ELSE
        IF v_current.status = 'completed' AND p_enabled AND NOT p_start_new THEN
            RAISE EXCEPTION '완주한 마라톤은 그대로 보관하고 새 마라톤을 시작해주세요.' USING ERRCODE = '22023';
        END IF;

        UPDATE public.reading_marathon_campaigns campaign
        SET title = btrim(p_title),
            target_distance_m = p_target_distance_m,
            ends_on = p_ends_on,
            status = CASE
                WHEN campaign.status = 'completed' THEN 'completed'
                WHEN p_enabled THEN 'active'
                WHEN campaign.started_at IS NULL THEN 'draft'
                ELSE 'paused'
            END,
            started_at = CASE
                WHEN p_enabled THEN COALESCE(campaign.started_at, v_now)
                ELSE campaign.started_at
            END,
            teacher_id = auth.uid(),
            updated_at = v_now
        WHERE campaign.id = v_current.id
          AND campaign.class_id = p_class_id;
    END IF;

    RETURN public.get_reading_marathon_snapshot(p_class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_reading_marathon(UUID, TEXT, INTEGER, DATE, BOOLEAN, BOOLEAN)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_reading_marathon(UUID, TEXT, INTEGER, DATE, BOOLEAN, BOOLEAN)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.finish_teacher_reading_marathon(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current public.reading_marathon_campaigns%ROWTYPE;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM 1
    FROM public.classes class
    WHERE class.id = p_class_id
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION '이 학급의 독서마라톤을 관리할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT campaign.*
    INTO v_current
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = p_class_id
      AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC
    LIMIT 1
    FOR UPDATE;

    IF v_current.id IS NULL THEN
        RAISE EXCEPTION '종료할 독서마라톤이 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    IF v_current.started_at IS NULL THEN
        RAISE EXCEPTION '아직 시작하지 않은 마라톤은 사용 설정을 저장해 먼저 시작해주세요.' USING ERRCODE = '22023';
    END IF;

    UPDATE public.reading_marathon_campaigns
    SET status = 'archived',
        finish_reason = CASE WHEN v_current.status = 'completed' THEN 'completed' ELSE 'ended_early' END,
        archived_at = v_now,
        updated_at = v_now
    WHERE id = v_current.id
      AND class_id = p_class_id;

    RETURN public.get_reading_marathon_snapshot(p_class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.finish_teacher_reading_marathon(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_teacher_reading_marathon(UUID)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_teacher_reading_marathon_history(
    p_class_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM public.classes class
        WHERE class.id = p_class_id
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '이 학급의 지난 마라톤을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH history_campaigns AS MATERIALIZED (
        SELECT campaign.*
        FROM public.reading_marathon_campaigns campaign
        WHERE campaign.class_id = p_class_id
          AND campaign.archived_at IS NOT NULL
        ORDER BY campaign.archived_at DESC, campaign.id DESC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    ), campaign_totals AS MATERIALIZED (
        SELECT
            campaign.id AS campaign_id,
            COALESCE(SUM(contribution.page_count), 0)::BIGINT AS total_pages,
            COALESCE(SUM(contribution.distance_m), 0)::BIGINT AS total_distance_m,
            COUNT(contribution.id)::INTEGER AS book_count,
            COUNT(DISTINCT contribution.student_id)::INTEGER AS contributors
        FROM history_campaigns campaign
        LEFT JOIN public.reading_marathon_contributions contribution
          ON contribution.campaign_id = campaign.id
         AND contribution.class_id = p_class_id
        GROUP BY campaign.id
    )
    SELECT jsonb_build_object(
        'campaigns', COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', campaign.id,
                'title', campaign.title,
                'target_distance_m', campaign.target_distance_m,
                'meters_per_page', campaign.meters_per_page,
                'started_at', campaign.started_at,
                'ends_on', campaign.ends_on,
                'finished_at', campaign.archived_at,
                'finish_reason', COALESCE(campaign.finish_reason, 'replaced'),
                'completed_at', campaign.completed_at,
                'total_pages', totals.total_pages,
                'total_distance_m', totals.total_distance_m,
                'book_count', totals.book_count,
                'contributors', totals.contributors,
                'progress_percent', CASE
                    WHEN campaign.target_distance_m <= 0 THEN 0
                    ELSE LEAST(100, ROUND(totals.total_distance_m * 100.0 / campaign.target_distance_m, 1))
                END,
                'leaderboard', COALESCE((
                    SELECT jsonb_agg(to_jsonb(ranked) ORDER BY ranked.rank, ranked.name, ranked.student_id)
                    FROM (
                        SELECT
                            student_totals.student_id,
                            student_totals.name,
                            student_totals.total_pages,
                            student_totals.distance_m,
                            student_totals.book_count,
                            DENSE_RANK() OVER (ORDER BY student_totals.distance_m DESC) AS rank
                        FROM (
                            SELECT
                                contribution.student_id,
                                student.name,
                                SUM(contribution.page_count)::BIGINT AS total_pages,
                                SUM(contribution.distance_m)::BIGINT AS distance_m,
                                COUNT(contribution.id)::INTEGER AS book_count
                            FROM public.reading_marathon_contributions contribution
                            JOIN public.students student
                              ON student.id = contribution.student_id
                             AND student.class_id = contribution.class_id
                            WHERE contribution.class_id = p_class_id
                              AND contribution.campaign_id = campaign.id
                            GROUP BY contribution.student_id, student.name
                        ) student_totals
                    ) ranked
                ), '[]'::JSONB)
            ) ORDER BY campaign.archived_at DESC, campaign.id DESC
        ), '[]'::JSONB)
    )
    INTO v_result
    FROM history_campaigns campaign
    JOIN campaign_totals totals ON totals.campaign_id = campaign.id;

    RETURN COALESCE(v_result, jsonb_build_object('campaigns', '[]'::JSONB));
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_reading_marathon_history(UUID, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_reading_marathon_history(UUID, INTEGER)
    TO authenticated, service_role;

COMMIT;

-- 독서마라톤 1차: 개인 거리 경쟁 + 학급 공동 목표.
--
-- 페이지 수는 ISBN API가 연결되면 book_catalog.page_count에 자동 저장한다.
-- 지금은 교사가 페이지 정보가 없는 책만 보정할 수 있다. 학생 입력값은 신뢰하지 않는다.
-- 한 학생의 같은 책은 캠페인마다 한 번만 집계하며 독서록 수정·삭제로 거리가 중복되지 않는다.

BEGIN;

ALTER TABLE public.book_catalog
    ADD COLUMN IF NOT EXISTS page_count INTEGER,
    ADD COLUMN IF NOT EXISTS page_count_source TEXT,
    ADD COLUMN IF NOT EXISTS page_count_updated_at TIMESTAMPTZ;

ALTER TABLE public.book_catalog
    DROP CONSTRAINT IF EXISTS book_catalog_page_count_range;
ALTER TABLE public.book_catalog
    ADD CONSTRAINT book_catalog_page_count_range
    CHECK (page_count IS NULL OR page_count BETWEEN 1 AND 10000);

ALTER TABLE public.book_catalog
    DROP CONSTRAINT IF EXISTS book_catalog_page_count_source;
ALTER TABLE public.book_catalog
    ADD CONSTRAINT book_catalog_page_count_source
    CHECK (page_count_source IS NULL OR page_count_source IN ('nl', 'google', 'teacher'));

COMMENT ON COLUMN public.book_catalog.page_count IS
    'ISBN 판본 기준 전체 페이지 수. 학생이 직접 입력하지 않고 서지 API 또는 교사 보정으로만 저장한다.';
COMMENT ON COLUMN public.book_catalog.page_count_source IS
    '페이지 수 출처: 국립중앙도서관(nl), Google Books(google), 교사 보정(teacher).';

CREATE INDEX IF NOT EXISTS idx_student_library_book_class
    ON public.student_library_items (book_id, class_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.reading_marathon_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    teacher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title TEXT NOT NULL CHECK (char_length(btrim(title)) BETWEEN 1 AND 60),
    target_distance_m INTEGER NOT NULL CHECK (target_distance_m BETWEEN 1000 AND 10000000),
    meters_per_page INTEGER NOT NULL DEFAULT 10 CHECK (meters_per_page BETWEEN 1 AND 100),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'active', 'paused', 'completed', 'archived')),
    started_at TIMESTAMPTZ,
    ends_on DATE,
    completed_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reading_marathon_campaign_time_order
        CHECK (ends_on IS NULL OR started_at IS NULL OR ends_on >= started_at::DATE)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_reading_marathon_one_current
    ON public.reading_marathon_campaigns (class_id)
    WHERE archived_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_reading_marathon_class_updated
    ON public.reading_marathon_campaigns (class_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.reading_marathon_contributions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.reading_marathon_campaigns(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    post_id UUID REFERENCES public.student_posts(id) ON DELETE SET NULL,
    book_id UUID REFERENCES public.book_catalog(id) ON DELETE SET NULL,
    book_key TEXT NOT NULL,
    book_title TEXT NOT NULL,
    page_count INTEGER NOT NULL CHECK (page_count BETWEEN 1 AND 10000),
    distance_m INTEGER NOT NULL CHECK (distance_m BETWEEN 1 AND 1000000),
    contributed_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT reading_marathon_one_book_per_student
        UNIQUE (campaign_id, student_id, book_key)
);

CREATE INDEX IF NOT EXISTS idx_reading_marathon_contribution_class
    ON public.reading_marathon_contributions (class_id, contributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_marathon_contribution_campaign
    ON public.reading_marathon_contributions (campaign_id, contributed_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_marathon_contribution_student
    ON public.reading_marathon_contributions (campaign_id, student_id, contributed_at DESC);

ALTER TABLE public.reading_marathon_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_marathon_contributions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reading_marathon_campaigns FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reading_marathon_contributions FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.reading_marathon_campaigns TO service_role;
GRANT ALL ON TABLE public.reading_marathon_contributions TO service_role;

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
      AND book.page_count BETWEEN 1 AND 10000;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    SELECT campaign.*
    INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = v_post.class_id
      AND campaign.archived_at IS NULL
      -- 공동 목표를 완주한 뒤에도 캠페인을 새로 시작하기 전까지 개인 레이스는 계속된다.
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

CREATE OR REPLACE FUNCTION public.on_reading_log_marathon_contribution()
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

DROP TRIGGER IF EXISTS trg_reading_log_marathon_contribution ON public.reading_log_entries;
CREATE TRIGGER trg_reading_log_marathon_contribution
AFTER INSERT OR UPDATE OF library_item_id ON public.reading_log_entries
FOR EACH ROW EXECUTE FUNCTION public.on_reading_log_marathon_contribution();

CREATE OR REPLACE FUNCTION public.on_book_page_count_marathon_sync()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post_id UUID;
BEGIN
    IF NEW.page_count IS NULL OR NEW.page_count < 1 THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.page_count IS NOT DISTINCT FROM OLD.page_count THEN
        RETURN NEW;
    END IF;

    FOR v_post_id IN
        SELECT entry.post_id
        FROM public.student_library_items item
        JOIN public.reading_log_entries entry
          ON entry.library_item_id = item.id
         AND entry.class_id = item.class_id
         AND entry.student_id = item.student_id
        WHERE item.book_id = NEW.id
        ORDER BY entry.updated_at DESC
        LIMIT 1000
    LOOP
        PERFORM public.record_reading_marathon_contribution(v_post_id);
    END LOOP;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_book_page_count_marathon_sync ON public.book_catalog;
CREATE TRIGGER trg_book_page_count_marathon_sync
AFTER INSERT OR UPDATE OF page_count ON public.book_catalog
FOR EACH ROW EXECUTE FUNCTION public.on_book_page_count_marathon_sync();

CREATE OR REPLACE FUNCTION public.get_reading_marathon_snapshot(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
          AND book.page_count IS NULL
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
          AND book.page_count IS NULL
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
$$;

REVOKE ALL ON FUNCTION public.get_reading_marathon_snapshot(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_reading_marathon_snapshot(UUID) TO authenticated, service_role;

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
        SET status = 'archived', archived_at = v_now, updated_at = v_now
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

    RETURN public.get_reading_marathon_snapshot(p_class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.set_teacher_reading_book_page_count(UUID, UUID, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_teacher_reading_book_page_count(UUID, UUID, INTEGER)
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.on_reading_log_marathon_contribution() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.on_book_page_count_marathon_sync() FROM PUBLIC, anon, authenticated;

COMMIT;

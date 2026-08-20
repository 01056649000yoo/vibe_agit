-- 독서마라톤 2차: 개인전 / 학급 전체전 / 교사 지정 모둠전과 영구 완주 메달.
--
-- 참가 명단과 누계를 캠페인 단위로 고정해, 화면을 열 때마다 모든 독서록을 다시 합산하지 않는다.
-- 팀전 메달은 팀 완주 + 교사가 정한 개인 최소 요건을 모두 만족한 학생에게만 지급한다.

BEGIN;

ALTER TABLE public.reading_marathon_campaigns
    ADD COLUMN IF NOT EXISTS competition_type TEXT NOT NULL DEFAULT 'class_team',
    ADD COLUMN IF NOT EXISTS medal_requirement_type TEXT NOT NULL DEFAULT 'books',
    ADD COLUMN IF NOT EXISTS medal_requirement_value INTEGER NOT NULL DEFAULT 1;

ALTER TABLE public.reading_marathon_campaigns
    DROP CONSTRAINT IF EXISTS reading_marathon_competition_type_check;
ALTER TABLE public.reading_marathon_campaigns
    ADD CONSTRAINT reading_marathon_competition_type_check
    CHECK (competition_type IN ('individual', 'class_team', 'group_team'));

ALTER TABLE public.reading_marathon_campaigns
    DROP CONSTRAINT IF EXISTS reading_marathon_medal_requirement_check;
ALTER TABLE public.reading_marathon_campaigns
    ADD CONSTRAINT reading_marathon_medal_requirement_check
    CHECK (
        medal_requirement_type IN ('none', 'books', 'pages')
        AND medal_requirement_value BETWEEN 0 AND 100000
        AND (medal_requirement_type <> 'none' OR medal_requirement_value = 0)
    );

CREATE TABLE IF NOT EXISTS public.reading_marathon_teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.reading_marathon_campaigns(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 30),
    color TEXT NOT NULL DEFAULT '#F97316' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    sort_order SMALLINT NOT NULL DEFAULT 0,
    total_pages BIGINT NOT NULL DEFAULT 0 CHECK (total_pages >= 0),
    total_distance_m BIGINT NOT NULL DEFAULT 0 CHECK (total_distance_m >= 0),
    book_count INTEGER NOT NULL DEFAULT 0 CHECK (book_count >= 0),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, name),
    UNIQUE (id, campaign_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_marathon_teams_campaign
    ON public.reading_marathon_teams (campaign_id, sort_order, id);

CREATE TABLE IF NOT EXISTS public.reading_marathon_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.reading_marathon_campaigns(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.reading_marathon_teams(id) ON DELETE SET NULL,
    name_snapshot TEXT NOT NULL CHECK (char_length(btrim(name_snapshot)) BETWEEN 1 AND 100),
    total_pages BIGINT NOT NULL DEFAULT 0 CHECK (total_pages >= 0),
    total_distance_m BIGINT NOT NULL DEFAULT 0 CHECK (total_distance_m >= 0),
    book_count INTEGER NOT NULL DEFAULT 0 CHECK (book_count >= 0),
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, student_id),
    UNIQUE (id, campaign_id, class_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_marathon_participants_campaign_rank
    ON public.reading_marathon_participants (campaign_id, total_distance_m DESC, student_id);
CREATE INDEX IF NOT EXISTS idx_reading_marathon_participants_student
    ON public.reading_marathon_participants (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reading_marathon_participants_team
    ON public.reading_marathon_participants (team_id, total_distance_m DESC, student_id)
    WHERE team_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.reading_marathon_medals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES public.reading_marathon_campaigns(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    team_id UUID REFERENCES public.reading_marathon_teams(id) ON DELETE SET NULL,
    medal_kind TEXT NOT NULL CHECK (medal_kind IN ('individual', 'team')),
    competition_type TEXT NOT NULL CHECK (competition_type IN ('individual', 'class_team', 'group_team')),
    campaign_title TEXT NOT NULL,
    team_name TEXT,
    total_pages BIGINT NOT NULL DEFAULT 0,
    total_distance_m BIGINT NOT NULL DEFAULT 0,
    book_count INTEGER NOT NULL DEFAULT 0,
    awarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (campaign_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_reading_marathon_medals_student
    ON public.reading_marathon_medals (student_id, awarded_at DESC, id DESC);

ALTER TABLE public.reading_marathon_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_marathon_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reading_marathon_medals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.reading_marathon_teams FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reading_marathon_participants FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.reading_marathon_medals FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.reading_marathon_teams TO service_role;
GRANT ALL ON TABLE public.reading_marathon_participants TO service_role;
GRANT ALL ON TABLE public.reading_marathon_medals TO service_role;

-- 기존 캠페인은 현재 동작과 같은 '학급 전체전'으로 옮긴다.
INSERT INTO public.reading_marathon_teams (campaign_id, class_id, name, color, sort_order)
SELECT campaign.id, campaign.class_id, '우리 반', '#F97316', 0
FROM public.reading_marathon_campaigns campaign
WHERE campaign.competition_type = 'class_team'
ON CONFLICT (campaign_id, name) DO NOTHING;

INSERT INTO public.reading_marathon_participants (
    campaign_id, class_id, student_id, team_id, name_snapshot,
    total_pages, total_distance_m, book_count
)
SELECT
    campaign.id,
    campaign.class_id,
    student.id,
    team.id,
    student.name,
    COALESCE(SUM(contribution.page_count), 0)::BIGINT,
    COALESCE(SUM(contribution.distance_m), 0)::BIGINT,
    COUNT(contribution.id)::INTEGER
FROM public.reading_marathon_campaigns campaign
JOIN public.students student
  ON student.class_id = campaign.class_id
 AND (
      campaign.archived_at IS NULL
      OR EXISTS (
          SELECT 1 FROM public.reading_marathon_contributions old_contribution
          WHERE old_contribution.campaign_id = campaign.id
            AND old_contribution.class_id = campaign.class_id
            AND old_contribution.student_id = student.id
      )
 )
JOIN public.reading_marathon_teams team
  ON team.campaign_id = campaign.id
 AND team.class_id = campaign.class_id
LEFT JOIN public.reading_marathon_contributions contribution
  ON contribution.campaign_id = campaign.id
 AND contribution.class_id = campaign.class_id
 AND contribution.student_id = student.id
WHERE campaign.archived_at IS NOT NULL
   OR (
       student.is_active IS DISTINCT FROM false
       AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
   )
GROUP BY campaign.id, campaign.class_id, student.id, team.id, student.name
ON CONFLICT (campaign_id, student_id) DO UPDATE
SET team_id = EXCLUDED.team_id,
    name_snapshot = EXCLUDED.name_snapshot,
    total_pages = EXCLUDED.total_pages,
    total_distance_m = EXCLUDED.total_distance_m,
    book_count = EXCLUDED.book_count,
    updated_at = NOW();

CREATE OR REPLACE FUNCTION public.refresh_reading_marathon_campaign_v1(p_campaign_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_all_teams_completed BOOLEAN := FALSE;
BEGIN
    SELECT campaign.* INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.id = p_campaign_id
    FOR UPDATE;
    IF NOT FOUND THEN RETURN; END IF;

    UPDATE public.reading_marathon_participants participant
    SET total_pages = totals.total_pages,
        total_distance_m = totals.total_distance_m,
        book_count = totals.book_count,
        completed_at = CASE
            WHEN v_campaign.competition_type = 'individual'
             AND totals.total_distance_m >= v_campaign.target_distance_m
            THEN COALESCE(participant.completed_at, v_now)
            ELSE NULL
        END,
        updated_at = v_now
    FROM (
        SELECT roster.id AS participant_id,
               COALESCE(SUM(contribution.page_count), 0)::BIGINT AS total_pages,
               COALESCE(SUM(contribution.distance_m), 0)::BIGINT AS total_distance_m,
               COUNT(contribution.id)::INTEGER AS book_count
        FROM public.reading_marathon_participants roster
        LEFT JOIN public.reading_marathon_contributions contribution
          ON contribution.campaign_id = roster.campaign_id
         AND contribution.class_id = roster.class_id
         AND contribution.student_id = roster.student_id
        WHERE roster.campaign_id = p_campaign_id
        GROUP BY roster.id
    ) totals
    WHERE participant.id = totals.participant_id;

    UPDATE public.reading_marathon_teams team
    SET total_pages = totals.total_pages,
        total_distance_m = totals.total_distance_m,
        book_count = totals.book_count,
        completed_at = CASE
            WHEN totals.total_distance_m >= v_campaign.target_distance_m
            THEN COALESCE(team.completed_at, v_now)
            ELSE NULL
        END,
        updated_at = v_now
    FROM (
        SELECT marathon_team.id AS team_id,
               COALESCE(SUM(participant.total_pages), 0)::BIGINT AS total_pages,
               COALESCE(SUM(participant.total_distance_m), 0)::BIGINT AS total_distance_m,
               COALESCE(SUM(participant.book_count), 0)::INTEGER AS book_count
        FROM public.reading_marathon_teams marathon_team
        LEFT JOIN public.reading_marathon_participants participant
          ON participant.team_id = marathon_team.id
         AND participant.campaign_id = marathon_team.campaign_id
         AND participant.class_id = marathon_team.class_id
        WHERE marathon_team.campaign_id = p_campaign_id
        GROUP BY marathon_team.id
    ) totals
    WHERE team.id = totals.team_id;

    -- 아직 보관하지 않은 결과는 잘못 확인한 글을 보완 요청으로 돌리면 함께 되돌린다.
    DELETE FROM public.reading_marathon_medals medal
    USING public.reading_marathon_participants participant
    LEFT JOIN public.reading_marathon_teams team ON team.id = participant.team_id
    WHERE medal.campaign_id = p_campaign_id
      AND medal.student_id = participant.student_id
      AND v_campaign.archived_at IS NULL
      AND NOT (
          CASE
              WHEN v_campaign.competition_type = 'individual'
                  THEN participant.total_distance_m >= v_campaign.target_distance_m
              ELSE team.completed_at IS NOT NULL AND (
                  v_campaign.medal_requirement_type = 'none'
                  OR (v_campaign.medal_requirement_type = 'books' AND participant.book_count >= v_campaign.medal_requirement_value)
                  OR (v_campaign.medal_requirement_type = 'pages' AND participant.total_pages >= v_campaign.medal_requirement_value)
              )
          END
      );

    INSERT INTO public.reading_marathon_medals (
        campaign_id, class_id, student_id, team_id, medal_kind, competition_type,
        campaign_title, team_name, total_pages, total_distance_m, book_count, awarded_at
    )
    SELECT
        v_campaign.id, v_campaign.class_id, participant.student_id, participant.team_id,
        CASE WHEN v_campaign.competition_type = 'individual' THEN 'individual' ELSE 'team' END,
        v_campaign.competition_type, v_campaign.title, team.name,
        participant.total_pages, participant.total_distance_m, participant.book_count,
        COALESCE(participant.completed_at, team.completed_at, v_now)
    FROM public.reading_marathon_participants participant
    LEFT JOIN public.reading_marathon_teams team ON team.id = participant.team_id
    WHERE participant.campaign_id = v_campaign.id
      AND (
          (v_campaign.competition_type = 'individual'
           AND participant.total_distance_m >= v_campaign.target_distance_m)
          OR
          (v_campaign.competition_type <> 'individual'
           AND team.completed_at IS NOT NULL
           AND (
               v_campaign.medal_requirement_type = 'none'
               OR (v_campaign.medal_requirement_type = 'books' AND participant.book_count >= v_campaign.medal_requirement_value)
               OR (v_campaign.medal_requirement_type = 'pages' AND participant.total_pages >= v_campaign.medal_requirement_value)
           ))
      )
    ON CONFLICT (campaign_id, student_id) DO NOTHING;

    IF v_campaign.competition_type <> 'individual' THEN
        SELECT COUNT(*) > 0 AND BOOL_AND(team.completed_at IS NOT NULL)
        INTO v_all_teams_completed
        FROM public.reading_marathon_teams team
        WHERE team.campaign_id = v_campaign.id;

        UPDATE public.reading_marathon_campaigns campaign
        SET status = CASE
                WHEN v_all_teams_completed THEN 'completed'
                WHEN campaign.status = 'completed' THEN 'active'
                ELSE campaign.status
            END,
            completed_at = CASE
                WHEN v_all_teams_completed THEN COALESCE(campaign.completed_at, v_now)
                WHEN campaign.status = 'completed' THEN NULL
                ELSE campaign.completed_at
            END,
            updated_at = v_now
        WHERE campaign.id = v_campaign.id
          AND campaign.archived_at IS NULL
          AND campaign.status IN ('active', 'completed');
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_reading_marathon_campaign_v1(UUID)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_reading_marathon_campaign_v1(UUID) TO service_role;

-- 기존 누계와 완주 결과를 새 참가자/메달 구조에 채운다. 소급 알림은 만들지 않는다.
DO $$
DECLARE v_campaign_id UUID;
BEGIN
    FOR v_campaign_id IN
        SELECT campaign.id FROM public.reading_marathon_campaigns campaign ORDER BY campaign.created_at, campaign.id
    LOOP
        PERFORM public.refresh_reading_marathon_campaign_v1(v_campaign_id);
    END LOOP;
END;
$$;

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

    IF v_post.review_status NOT IN ('checked', 'commented')
       OR v_post.is_submitted IS NOT TRUE
       OR v_post.book_id IS NULL
       OR v_post.book_key IS NULL
       OR v_post.book_title IS NULL
       OR v_post.page_count NOT BETWEEN 1 AND 10000 THEN
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
               book.title AS book_title, book.isbn13, book.isbn10,
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
          AND book.page_count IS NULL
        ORDER BY COALESCE(post.published_at, post.created_at) DESC, post.id DESC LIMIT 20
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
            'pending_book_count', (SELECT COUNT(*) FROM pending_rows)
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

CREATE OR REPLACE FUNCTION public.get_teacher_reading_marathon_history(
    p_class_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501'; END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '이 학급의 지난 마라톤을 볼 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    WITH history_campaigns AS MATERIALIZED (
        SELECT campaign.* FROM public.reading_marathon_campaigns campaign
        WHERE campaign.class_id = p_class_id AND campaign.archived_at IS NOT NULL
        ORDER BY campaign.archived_at DESC, campaign.id DESC
        LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50)
    )
    SELECT jsonb_build_object('campaigns', COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', campaign.id, 'title', campaign.title,
            'competition_type', campaign.competition_type,
            'target_distance_m', campaign.target_distance_m,
            'medal_requirement_type', campaign.medal_requirement_type,
            'medal_requirement_value', campaign.medal_requirement_value,
            'started_at', campaign.started_at, 'ends_on', campaign.ends_on,
            'finished_at', campaign.archived_at,
            'finish_reason', COALESCE(campaign.finish_reason, 'replaced'),
            'completed_at', campaign.completed_at,
            'total_pages', COALESCE((SELECT SUM(participant.total_pages) FROM public.reading_marathon_participants participant WHERE participant.campaign_id = campaign.id), 0),
            'total_distance_m', COALESCE((SELECT SUM(participant.total_distance_m) FROM public.reading_marathon_participants participant WHERE participant.campaign_id = campaign.id), 0),
            'book_count', COALESCE((SELECT SUM(participant.book_count) FROM public.reading_marathon_participants participant WHERE participant.campaign_id = campaign.id), 0),
            'contributors', (SELECT COUNT(*) FROM public.reading_marathon_participants participant WHERE participant.campaign_id = campaign.id AND participant.total_distance_m > 0),
            'medal_count', (SELECT COUNT(*) FROM public.reading_marathon_medals medal WHERE medal.campaign_id = campaign.id),
            'progress_percent', LEAST(100, ROUND(COALESCE((SELECT SUM(participant.total_distance_m) FROM public.reading_marathon_participants participant WHERE participant.campaign_id = campaign.id), 0) * 100.0 / campaign.target_distance_m, 1)),
            'leaderboard', COALESCE((
                SELECT jsonb_agg(to_jsonb(ranked) ORDER BY ranked.rank, ranked.name, ranked.student_id)
                FROM (
                    SELECT participant.student_id, participant.name_snapshot AS name,
                           participant.team_id, participant.total_pages,
                           participant.total_distance_m AS distance_m, participant.book_count,
                           DENSE_RANK() OVER (ORDER BY participant.total_distance_m DESC) AS rank
                    FROM public.reading_marathon_participants participant
                    WHERE participant.campaign_id = campaign.id
                    ORDER BY participant.total_distance_m DESC, participant.name_snapshot, participant.student_id
                    LIMIT 100
                ) ranked
            ), '[]'::JSONB),
            'teams', COALESCE((
                SELECT jsonb_agg(jsonb_build_object(
                    'id', team.id, 'name', team.name, 'color', team.color,
                    'total_pages', team.total_pages, 'total_distance_m', team.total_distance_m,
                    'book_count', team.book_count, 'completed_at', team.completed_at,
                    'member_count', (SELECT COUNT(*) FROM public.reading_marathon_participants member WHERE member.team_id = team.id)
                ) ORDER BY team.total_distance_m DESC, team.sort_order, team.id)
                FROM public.reading_marathon_teams team WHERE team.campaign_id = campaign.id
            ), '[]'::JSONB)
        ) ORDER BY campaign.archived_at DESC, campaign.id DESC), '[]'::JSONB))
    INTO v_result
    FROM history_campaigns campaign;

    RETURN COALESCE(v_result, jsonb_build_object('campaigns', '[]'::JSONB));
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_reading_marathon_history(UUID, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_reading_marathon_history(UUID, INTEGER) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.save_teacher_reading_marathon_v2(
    p_class_id UUID,
    p_title TEXT,
    p_target_distance_m INTEGER,
    p_competition_type TEXT DEFAULT 'class_team',
    p_medal_requirement_type TEXT DEFAULT 'books',
    p_medal_requirement_value INTEGER DEFAULT 1,
    p_teams JSONB DEFAULT '[]'::JSONB,
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
    v_campaign_id UUID;
    v_now TIMESTAMPTZ := clock_timestamp();
    v_team JSONB;
    v_team_id UUID;
    v_active_students INTEGER;
    v_assigned_students INTEGER;
BEGIN
    IF auth.uid() IS NULL THEN RAISE EXCEPTION '로그인이 필요합니다.' USING ERRCODE = '42501'; END IF;
    PERFORM 1 FROM public.classes class
    WHERE class.id = p_class_id AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION '이 학급의 독서마라톤을 관리할 권한이 없습니다.' USING ERRCODE = '42501'; END IF;

    IF char_length(btrim(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 60 THEN
        RAISE EXCEPTION '마라톤 이름은 1~60자로 입력해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_target_distance_m NOT BETWEEN 1000 AND 10000000 THEN
        RAISE EXCEPTION '목표 거리는 1km~10,000km 사이로 정해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_competition_type NOT IN ('individual', 'class_team', 'group_team') THEN
        RAISE EXCEPTION '경기 방식을 다시 선택해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_medal_requirement_type NOT IN ('none', 'books', 'pages')
       OR p_medal_requirement_value NOT BETWEEN 0 AND 100000
       OR (p_medal_requirement_type = 'none' AND p_medal_requirement_value <> 0) THEN
        RAISE EXCEPTION '메달 최소 참여 조건을 다시 확인해주세요.' USING ERRCODE = '22023';
    END IF;
    IF p_ends_on IS NOT NULL AND p_ends_on < CURRENT_DATE THEN
        RAISE EXCEPTION '종료일은 오늘 이후로 정해주세요.' USING ERRCODE = '22023';
    END IF;

    SELECT campaign.* INTO v_current
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = p_class_id AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC LIMIT 1 FOR UPDATE;

    IF p_start_new AND v_current.id IS NOT NULL THEN
        UPDATE public.reading_marathon_campaigns
        SET status = 'archived',
            finish_reason = CASE WHEN v_current.status = 'completed' THEN 'completed' ELSE 'replaced' END,
            archived_at = v_now, updated_at = v_now
        WHERE id = v_current.id AND class_id = p_class_id;
        v_current.id := NULL;
    END IF;

    IF v_current.id IS NOT NULL AND v_current.started_at IS NOT NULL
       AND v_current.competition_type <> p_competition_type THEN
        RAISE EXCEPTION '시작한 마라톤의 경기 방식은 바꿀 수 없습니다. 결과를 보관한 뒤 새 마라톤을 만들어주세요.' USING ERRCODE = '22023';
    END IF;

    IF v_current.id IS NULL THEN
        INSERT INTO public.reading_marathon_campaigns (
            class_id, teacher_id, title, target_distance_m, competition_type,
            medal_requirement_type, medal_requirement_value, status, started_at, ends_on
        ) VALUES (
            p_class_id, auth.uid(), btrim(p_title), p_target_distance_m, p_competition_type,
            CASE WHEN p_competition_type = 'individual' THEN 'none' ELSE p_medal_requirement_type END,
            CASE WHEN p_competition_type = 'individual' THEN 0 ELSE p_medal_requirement_value END,
            CASE WHEN p_enabled THEN 'active' ELSE 'draft' END,
            CASE WHEN p_enabled THEN v_now ELSE NULL END, p_ends_on
        ) RETURNING id INTO v_campaign_id;
    ELSE
        IF v_current.status = 'completed' AND p_enabled AND NOT p_start_new THEN
            RAISE EXCEPTION '완주한 마라톤은 결과를 보관한 뒤 새 마라톤을 시작해주세요.' USING ERRCODE = '22023';
        END IF;
        UPDATE public.reading_marathon_campaigns campaign
        SET title = btrim(p_title), target_distance_m = p_target_distance_m,
            competition_type = p_competition_type,
            medal_requirement_type = CASE WHEN p_competition_type = 'individual' THEN 'none' ELSE p_medal_requirement_type END,
            medal_requirement_value = CASE WHEN p_competition_type = 'individual' THEN 0 ELSE p_medal_requirement_value END,
            ends_on = p_ends_on,
            status = CASE WHEN campaign.status = 'completed' THEN 'completed'
                          WHEN p_enabled THEN 'active'
                          WHEN campaign.started_at IS NULL THEN 'draft' ELSE 'paused' END,
            started_at = CASE WHEN p_enabled THEN COALESCE(campaign.started_at, v_now) ELSE campaign.started_at END,
            teacher_id = auth.uid(), updated_at = v_now
        WHERE campaign.id = v_current.id AND campaign.class_id = p_class_id
        RETURNING id INTO v_campaign_id;
    END IF;

    -- 시작 전에는 저장할 때마다 최신 학급 명단과 팀 배치를 다시 만든다. 시작 뒤에는 결과 안정성을 위해 고정한다.
    IF v_current.id IS NULL OR v_current.started_at IS NULL THEN
        DELETE FROM public.reading_marathon_participants WHERE campaign_id = v_campaign_id;
        DELETE FROM public.reading_marathon_teams WHERE campaign_id = v_campaign_id;

        IF p_competition_type = 'class_team' THEN
            INSERT INTO public.reading_marathon_teams (campaign_id, class_id, name, color, sort_order)
            VALUES (v_campaign_id, p_class_id, '우리 반', '#F97316', 0)
            RETURNING id INTO v_team_id;
            INSERT INTO public.reading_marathon_participants (campaign_id, class_id, student_id, team_id, name_snapshot)
            SELECT v_campaign_id, p_class_id, student.id, v_team_id, student.name
            FROM public.students student
            WHERE student.class_id = p_class_id AND student.is_active IS DISTINCT FROM false
              AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
            ORDER BY student.name, student.id LIMIT 100;
        ELSIF p_competition_type = 'individual' THEN
            INSERT INTO public.reading_marathon_participants (campaign_id, class_id, student_id, name_snapshot)
            SELECT v_campaign_id, p_class_id, student.id, student.name
            FROM public.students student
            WHERE student.class_id = p_class_id AND student.is_active IS DISTINCT FROM false
              AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
            ORDER BY student.name, student.id LIMIT 100;
        ELSE
            IF jsonb_typeof(COALESCE(p_teams, '[]'::JSONB)) <> 'array' OR jsonb_array_length(COALESCE(p_teams, '[]'::JSONB)) NOT BETWEEN 2 AND 20 THEN
                RAISE EXCEPTION '모둠전은 2~20개 모둠을 만들어주세요.' USING ERRCODE = '22023';
            END IF;
            FOR v_team IN SELECT value FROM jsonb_array_elements(p_teams)
            LOOP
                IF char_length(btrim(COALESCE(v_team->>'name', ''))) NOT BETWEEN 1 AND 30 THEN
                    RAISE EXCEPTION '모둠 이름은 1~30자로 입력해주세요.' USING ERRCODE = '22023';
                END IF;
                INSERT INTO public.reading_marathon_teams (campaign_id, class_id, name, color, sort_order)
                VALUES (
                    v_campaign_id, p_class_id, btrim(v_team->>'name'),
                    CASE WHEN COALESCE(v_team->>'color', '') ~ '^#[0-9A-Fa-f]{6}$' THEN v_team->>'color' ELSE '#F97316' END,
                    COALESCE((v_team->>'sort_order')::SMALLINT, 0)
                ) RETURNING id INTO v_team_id;

                INSERT INTO public.reading_marathon_participants (campaign_id, class_id, student_id, team_id, name_snapshot)
                SELECT v_campaign_id, p_class_id, student.id, v_team_id, student.name
                FROM public.students student
                JOIN jsonb_array_elements_text(COALESCE(v_team->'student_ids', '[]'::JSONB)) member
                  ON member.value::UUID = student.id
                WHERE student.class_id = p_class_id AND student.is_active IS DISTINCT FROM false
                  AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
            END LOOP;

            SELECT COUNT(*)::INTEGER INTO v_active_students
            FROM public.students student
            WHERE student.class_id = p_class_id AND student.is_active IS DISTINCT FROM false
              AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
            SELECT COUNT(*)::INTEGER INTO v_assigned_students
            FROM public.reading_marathon_participants participant
            WHERE participant.campaign_id = v_campaign_id;
            IF v_assigned_students <> LEAST(v_active_students, 100) THEN
                RAISE EXCEPTION '모든 학생을 한 모둠에 한 번씩 배정해주세요.' USING ERRCODE = '22023';
            END IF;
        END IF;
    END IF;

    PERFORM public.refresh_reading_marathon_campaign_v1(v_campaign_id);
    RETURN public.get_reading_marathon_snapshot_v2(p_class_id);
END;
$$;

REVOKE ALL ON FUNCTION public.save_teacher_reading_marathon_v2(UUID, TEXT, INTEGER, TEXT, TEXT, INTEGER, JSONB, DATE, BOOLEAN, BOOLEAN)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_reading_marathon_v2(UUID, TEXT, INTEGER, TEXT, TEXT, INTEGER, JSONB, DATE, BOOLEAN, BOOLEAN)
    TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_my_reading_marathon_medals_v1(p_limit INTEGER DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_student public.students%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    SELECT student.* INTO v_student FROM public.students student
    WHERE student.auth_id = auth.uid() AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW()) LIMIT 1;
    IF v_student.id IS NULL THEN RAISE EXCEPTION '학생 정보를 찾지 못했습니다.' USING ERRCODE = '42501'; END IF;

    RETURN jsonb_build_object(
        'count', (SELECT COUNT(*) FROM public.reading_marathon_medals medal
                  WHERE medal.class_id = v_student.class_id AND medal.student_id = v_student.id),
        'medals', COALESCE((
            SELECT jsonb_agg(to_jsonb(medal_row) ORDER BY medal_row.awarded_at DESC, medal_row.id DESC)
            FROM (
                SELECT medal.id, medal.campaign_id, medal.medal_kind, medal.competition_type,
                       medal.campaign_title, medal.team_name, medal.total_pages,
                       medal.total_distance_m, medal.book_count, medal.awarded_at
                FROM public.reading_marathon_medals medal
                WHERE medal.class_id = v_student.class_id AND medal.student_id = v_student.id
                ORDER BY medal.awarded_at DESC, medal.id DESC
                LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 50)
            ) medal_row
        ), '[]'::JSONB)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_reading_marathon_medals_v1(INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_reading_marathon_medals_v1(INTEGER) TO authenticated, service_role;

-- 학생 홈 RPC 호출 수를 늘리지 않고 경기 방식·내 팀·대표 메달을 기존 응답에 붙인다.
-- 홈 본체를 보존한 얇은 래퍼라 이후 홈 기능과 마라톤 기능을 각각 독립적으로 관리할 수 있다.
DO $$
BEGIN
    IF to_regprocedure('public.get_student_home_bootstrap_core_20261126()') IS NULL THEN
        ALTER FUNCTION public.get_student_home_bootstrap_v1()
            RENAME TO get_student_home_bootstrap_core_20261126;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_home_bootstrap_core_20261126()
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_home_bootstrap_core_20261126() TO service_role;

CREATE OR REPLACE FUNCTION public.get_student_home_bootstrap_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_base JSONB;
    v_student_id UUID;
    v_class_id UUID;
    v_campaign public.reading_marathon_campaigns%ROWTYPE;
    v_participant public.reading_marathon_participants%ROWTYPE;
    v_team public.reading_marathon_teams%ROWTYPE;
    v_latest_medal JSONB;
    v_medal_count INTEGER := 0;
    v_marathon JSONB;
BEGIN
    v_base := public.get_student_home_bootstrap_core_20261126();
    v_student_id := NULLIF(v_base #>> '{student,id}', '')::UUID;
    v_class_id := NULLIF(v_base #>> '{student,class_id}', '')::UUID;

    SELECT to_jsonb(medal_row) INTO v_latest_medal
    FROM (
        SELECT medal.id, medal.medal_kind, medal.competition_type,
               medal.campaign_title, medal.team_name, medal.awarded_at
        FROM public.reading_marathon_medals medal
        WHERE medal.class_id = v_class_id AND medal.student_id = v_student_id
        ORDER BY medal.awarded_at DESC, medal.id DESC
        LIMIT 1
    ) medal_row;

    SELECT COUNT(*)::INTEGER INTO v_medal_count
    FROM public.reading_marathon_medals medal
    WHERE medal.class_id = v_class_id AND medal.student_id = v_student_id;

    v_marathon := COALESCE(v_base->'reading_marathon', '{}'::JSONB)
        || jsonb_build_object('latest_medal', v_latest_medal, 'medal_count', v_medal_count);

    SELECT campaign.* INTO v_campaign
    FROM public.reading_marathon_campaigns campaign
    WHERE campaign.class_id = v_class_id AND campaign.archived_at IS NULL
    ORDER BY campaign.created_at DESC LIMIT 1;

    IF v_campaign.id IS NOT NULL THEN
        SELECT participant.* INTO v_participant
        FROM public.reading_marathon_participants participant
        WHERE participant.campaign_id = v_campaign.id
          AND participant.class_id = v_class_id
          AND participant.student_id = v_student_id;

        IF v_participant.team_id IS NOT NULL THEN
            SELECT team.* INTO v_team
            FROM public.reading_marathon_teams team
            WHERE team.id = v_participant.team_id
              AND team.campaign_id = v_campaign.id
              AND team.class_id = v_class_id;
        END IF;

        v_marathon := jsonb_set(
            v_marathon,
            '{campaign}',
            COALESCE(v_marathon->'campaign', '{}'::JSONB) || jsonb_build_object(
                'competition_type', v_campaign.competition_type,
                'medal_requirement_type', v_campaign.medal_requirement_type,
                'medal_requirement_value', v_campaign.medal_requirement_value,
                'is_enabled', v_campaign.status IN ('active', 'completed')
                    AND (v_campaign.ends_on IS NULL OR v_campaign.ends_on >= CURRENT_DATE),
                'is_ended', v_campaign.ends_on IS NOT NULL AND v_campaign.ends_on < CURRENT_DATE
            ),
            TRUE
        );

        v_marathon := jsonb_set(v_marathon, '{my}', jsonb_build_object(
            'student_id', v_student_id,
            'name', COALESCE(v_participant.name_snapshot, v_base #>> '{student,name}'),
            'team_id', v_participant.team_id,
            'total_pages', COALESCE(v_participant.total_pages, 0),
            'distance_m', COALESCE(v_participant.total_distance_m, 0),
            'book_count', COALESCE(v_participant.book_count, 0),
            'completed_at', v_participant.completed_at,
            'rank', NULL
        ), TRUE);

        IF v_team.id IS NOT NULL THEN
            v_marathon := jsonb_set(v_marathon, '{my_team}', jsonb_build_object(
                'id', v_team.id, 'name', v_team.name, 'color', v_team.color,
                'total_pages', v_team.total_pages,
                'total_distance_m', v_team.total_distance_m,
                'book_count', v_team.book_count,
                'completed_at', v_team.completed_at,
                'member_count', (SELECT COUNT(*) FROM public.reading_marathon_participants participant
                                 WHERE participant.campaign_id = v_campaign.id AND participant.team_id = v_team.id),
                'rank', (SELECT COUNT(*) + 1 FROM public.reading_marathon_teams other_team
                         WHERE other_team.campaign_id = v_campaign.id
                           AND other_team.total_distance_m > v_team.total_distance_m)
            ), TRUE);
        END IF;
    END IF;

    RETURN jsonb_set(v_base, '{reading_marathon}', v_marathon, TRUE);
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_home_bootstrap_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_student_home_bootstrap_v1() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

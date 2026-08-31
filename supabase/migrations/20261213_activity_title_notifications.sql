-- 작가 전용 성장 모달은 유지하고, 소통·기록가·독서가의 새 단계만 공용 활동 알림 원장에 남긴다.
-- 적용 전 현재 단계를 기준점으로 저장해 과거 성장을 소급 알리지 않는다. 이후 반응·댓글 승인과
-- 자율 글 확인 트랜잭션이 끝난 자리에서 실제 단계를 다시 계산해 한 시즌·단계당 한 번만 발행한다.

BEGIN;

CREATE TABLE IF NOT EXISTS public.student_activity_title_notification_state (
    season_id UUID NOT NULL REFERENCES public.dragon_growth_seasons(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    track_id TEXT NOT NULL CHECK (track_id IN ('reader', 'diary', 'reading')),
    last_notified_level SMALLINT NOT NULL CHECK (last_notified_level BETWEEN 1 AND 7),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (season_id, student_id, track_id)
);

CREATE INDEX IF NOT EXISTS idx_student_activity_title_notification_state_student
    ON public.student_activity_title_notification_state (class_id, student_id, season_id);

ALTER TABLE public.student_activity_title_notification_state ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.student_activity_title_notification_state
    FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON TABLE public.student_activity_title_notification_state IS
    '소통·기록가·독서가의 시즌별 마지막 활동 알림 단계. 브라우저와 service_role이 직접 읽거나 쓰지 않는다.';

-- 시험 단계 덮어쓰기는 넣지 않는다. 실제 활동으로 얻은 단계와 독서가 전환 보호 하한만 계산한다.
CREATE OR REPLACE FUNCTION public.get_student_activity_title_levels_v1(p_student_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_class_started_at TIMESTAMPTZ;
    v_season public.dragon_growth_seasons%ROWTYPE;
    v_reader_score BIGINT := 0;
    v_diary_days INTEGER := 0;
    v_reading_log_count INTEGER := 0;
    v_reading_floor SMALLINT := 1;
    v_rewards_enabled BOOLEAN := FALSE;
BEGIN
    SELECT student.class_id, COALESCE(class_row.season_started_at, class_row.created_at)
    INTO v_class_id, v_class_started_at
    FROM public.students student
    JOIN public.classes class_row ON class_row.id = student.class_id
    WHERE student.id = p_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
      AND class_row.deleted_at IS NULL;
    IF v_class_id IS NULL THEN RETURN NULL; END IF;

    SELECT season.* INTO v_season
    FROM public.dragon_growth_seasons season
    WHERE season.class_id = v_class_id
      AND season.status IN ('active', 'closing')
    ORDER BY (season.status = 'active') DESC, season.season_number DESC
    LIMIT 1;
    IF v_season.id IS NULL THEN RETURN NULL; END IF;

    -- 반응 한 번마다 학급 전체 글을 다시 세지 않는다. 해당 학생의 확인 완료 자율 글만 직접 좁힌다.
    WITH checked_self_writing AS (
        SELECT post.id, post.self_writing_type, post.structured_content,
               COALESCE(post.published_at, post.updated_at, post.created_at) AS completed_at
        FROM public.student_posts post
        JOIN public.reading_log_teacher_reviews review
          ON review.post_id = post.id
         AND review.class_id = post.class_id
         AND review.student_id = post.student_id
         AND review.review_status = 'checked'
        WHERE post.class_id = v_class_id
          AND post.student_id = p_student_id
          AND post.writing_context = 'self'
          AND post.self_writing_type IN ('diary', 'reading_log')
          AND public.writing_counts_as_completed(post.writing_context, post.is_confirmed, post.is_submitted)
          AND COALESCE(post.published_at, post.updated_at, post.created_at)
              >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (
              v_season.closing_started_at IS NULL
              OR COALESCE(post.published_at, post.updated_at, post.created_at) <= v_season.closing_started_at
          )
        ORDER BY post.created_at DESC, post.id
        LIMIT 1000
    )
    SELECT
        COUNT(DISTINCT CASE
            WHEN activity.self_writing_type = 'diary'
             AND COALESCE(activity.structured_content ->> 'diaryDate', '') ~ '^\d{4}-\d{2}-\d{2}$'
                THEN (activity.structured_content ->> 'diaryDate')::DATE
            WHEN activity.self_writing_type = 'diary'
                THEN (activity.completed_at AT TIME ZONE 'Asia/Seoul')::DATE
        END)::INTEGER,
        COUNT(DISTINCT activity.id) FILTER (WHERE activity.self_writing_type = 'reading_log')::INTEGER
    INTO v_diary_days, v_reading_log_count
    FROM checked_self_writing activity;

    WITH comment_activity AS (
        SELECT comment.post_id,
               SUM(char_length(translate(
                   COALESCE(comment.content, ''),
                   chr(8203) || chr(8204) || chr(8205) || chr(8288) || chr(65279),
                   ''
               )))::BIGINT AS comment_chars
        FROM public.post_comments comment
        JOIN public.student_posts post
          ON post.id = comment.post_id
         AND post.class_id = comment.class_id
        WHERE comment.class_id = v_class_id
          AND comment.student_id = p_student_id
          AND comment.status = 'approved'
          AND post.student_id <> comment.student_id
          AND comment.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR comment.created_at <= v_season.closing_started_at)
        GROUP BY comment.post_id
    ), reaction_activity AS (
        SELECT DISTINCT reaction.post_id
        FROM public.post_reactions reaction
        JOIN public.student_posts post
          ON post.id = reaction.post_id
         AND post.class_id = reaction.class_id
        WHERE reaction.class_id = v_class_id
          AND reaction.student_id = p_student_id
          AND post.student_id <> reaction.student_id
          AND reaction.created_at >= COALESCE(v_season.started_at, v_class_started_at, NOW())
          AND (v_season.closing_started_at IS NULL OR reaction.created_at <= v_season.closing_started_at)
    ), reader_per_post AS (
        SELECT COALESCE(comment.post_id, reaction.post_id) AS post_id,
               COALESCE(comment.comment_chars, 0)::BIGINT AS comment_chars
        FROM comment_activity comment
        FULL OUTER JOIN reaction_activity reaction ON reaction.post_id = comment.post_id
    )
    SELECT COALESCE(SUM(1 + LEAST(activity.comment_chars / 20, 3)), 0)
    INTO v_reader_score
    FROM reader_per_post activity;

    SELECT COALESCE(floor.minimum_level, 1)
    INTO v_reading_floor
    FROM public.student_reading_title_level_floors floor
    WHERE floor.season_id = v_season.id
      AND floor.class_id = v_class_id
      AND floor.student_id = p_student_id;

    v_rewards_enabled := COALESCE(
        (public.get_title_season_context_v1(v_class_id) ->> 'rewards_enabled')::BOOLEAN,
        FALSE
    );

    RETURN jsonb_build_object(
        'season_id', v_season.id,
        'class_id', v_class_id,
        'reader_level', public.dragon_reader_level(v_reader_score),
        'diary_level', public.dragon_diary_level(COALESCE(v_diary_days, 0)),
        'reading_level', GREATEST(
            public.dragon_reading_level(
                COALESCE(v_reading_log_count, 0),
                0
            ),
            COALESCE(v_reading_floor, 1)
        ),
        'rewards_enabled', v_rewards_enabled
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_student_activity_title_levels_v1(UUID)
    FROM PUBLIC, anon, authenticated, service_role;

-- 기존 학생은 현재 단계가 기준점이다. 그래서 마이그레이션 직후에는 새 알림이 생기지 않는다.
INSERT INTO public.student_activity_title_notification_state (
    season_id, class_id, student_id, track_id, last_notified_level
)
SELECT
    (levels.value ->> 'season_id')::UUID,
    (levels.value ->> 'class_id')::UUID,
    student.id,
    track.track_id,
    CASE track.track_id
        WHEN 'reader' THEN (levels.value ->> 'reader_level')::SMALLINT
        WHEN 'diary' THEN (levels.value ->> 'diary_level')::SMALLINT
        ELSE (levels.value ->> 'reading_level')::SMALLINT
    END
FROM public.students student
CROSS JOIN LATERAL (
    SELECT public.get_student_activity_title_levels_v1(student.id) AS value
) levels
CROSS JOIN (VALUES ('reader'), ('diary'), ('reading')) AS track(track_id)
WHERE levels.value IS NOT NULL
ON CONFLICT (season_id, student_id, track_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_student_activity_title_notification_v1(
    p_student_id UUID,
    p_track_id TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_season_id UUID;
    v_levels JSONB;
    v_previous_level SMALLINT;
    v_current_level SMALLINT;
    v_event_id UUID;
BEGIN
    IF p_student_id IS NULL OR p_track_id NOT IN ('reader', 'diary', 'reading') THEN
        RETURN NULL;
    END IF;

    SELECT student.class_id, season.id
    INTO v_class_id, v_season_id
    FROM public.students student
    JOIN public.classes class_row
      ON class_row.id = student.class_id
     AND class_row.deleted_at IS NULL
    JOIN LATERAL (
        SELECT candidate.id
        FROM public.dragon_growth_seasons candidate
        WHERE candidate.class_id = student.class_id
          AND candidate.status IN ('active', 'closing')
        ORDER BY (candidate.status = 'active') DESC, candidate.season_number DESC
        LIMIT 1
    ) season ON TRUE
    WHERE student.id = p_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW());
    IF v_season_id IS NULL THEN RETURN NULL; END IF;

    -- 새 시즌·새 학생은 1단계에서 출발한다. 행을 먼저 잠근 뒤 단계를 계산해야 동시에 들어온
    -- 두 반응의 합으로 문턱을 넘는 경우도 마지막 트랜잭션이 놓치지 않는다.
    INSERT INTO public.student_activity_title_notification_state (
        season_id, class_id, student_id, track_id, last_notified_level
    ) VALUES (v_season_id, v_class_id, p_student_id, p_track_id, 1)
    ON CONFLICT (season_id, student_id, track_id) DO NOTHING;

    SELECT state.last_notified_level
    INTO v_previous_level
    FROM public.student_activity_title_notification_state state
    WHERE state.season_id = v_season_id
      AND state.student_id = p_student_id
      AND state.track_id = p_track_id
    FOR UPDATE;

    v_levels := public.get_student_activity_title_levels_v1(p_student_id);
    IF v_levels IS NULL OR NULLIF(v_levels ->> 'season_id', '')::UUID IS DISTINCT FROM v_season_id THEN
        RETURN NULL;
    END IF;
    v_current_level := CASE p_track_id
        WHEN 'reader' THEN (v_levels ->> 'reader_level')::SMALLINT
        WHEN 'diary' THEN (v_levels ->> 'diary_level')::SMALLINT
        ELSE (v_levels ->> 'reading_level')::SMALLINT
    END;

    IF v_current_level IS NULL OR v_current_level <= v_previous_level THEN
        RETURN NULL;
    END IF;

    UPDATE public.student_activity_title_notification_state
    SET last_notified_level = v_current_level, updated_at = NOW()
    WHERE season_id = v_season_id
      AND student_id = p_student_id
      AND track_id = p_track_id;

    v_event_id := public.notification_emit_v1(
        p_student_id,
        'titles',
        'titles.level_up',
        'title_season',
        v_season_id,
        jsonb_build_object(
            'track_id', p_track_id,
            'from_level', v_previous_level,
            'level', v_current_level,
            'reward_claimable', p_track_id IN ('diary', 'reading')
                AND COALESCE((v_levels ->> 'rewards_enabled')::BOOLEAN, FALSE)
        ),
        format('title-level:%s:%s:%s', v_season_id, p_track_id, v_current_level)
    );
    RETURN v_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_student_activity_title_notification_v1(UUID, TEXT)
    FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.emit_reader_title_level_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID;
BEGIN
    v_student_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.student_id ELSE NEW.student_id END;
    IF v_student_id IS NOT NULL THEN
        PERFORM public.sync_student_activity_title_notification_v1(v_student_id, 'reader');
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_reader_title_level_notification_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_reader_title_level_from_reaction_v1 ON public.post_reactions;
CREATE TRIGGER trg_reader_title_level_from_reaction_v1
AFTER INSERT OR DELETE OR UPDATE OF reaction_type ON public.post_reactions
FOR EACH ROW EXECUTE FUNCTION public.emit_reader_title_level_notification_v1();

DROP TRIGGER IF EXISTS trg_reader_title_level_from_comment_v1 ON public.post_comments;
CREATE TRIGGER trg_reader_title_level_from_comment_v1
AFTER INSERT OR DELETE OR UPDATE OF status, content ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.emit_reader_title_level_notification_v1();

CREATE OR REPLACE FUNCTION public.emit_self_writing_title_level_notification_v1()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post_id UUID;
    v_student_id UUID;
    v_track_id TEXT;
BEGIN
    v_post_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.post_id ELSE NEW.post_id END;
    SELECT post.student_id,
           CASE post.self_writing_type WHEN 'diary' THEN 'diary' WHEN 'reading_log' THEN 'reading' END
    INTO v_student_id, v_track_id
    FROM public.student_posts post
    WHERE post.id = v_post_id
      AND post.writing_context = 'self';
    IF v_student_id IS NOT NULL AND v_track_id IS NOT NULL THEN
        PERFORM public.sync_student_activity_title_notification_v1(v_student_id, v_track_id);
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.emit_self_writing_title_level_notification_v1()
    FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS trg_self_writing_title_level_notification_v1
    ON public.reading_log_teacher_reviews;
CREATE TRIGGER trg_self_writing_title_level_notification_v1
AFTER INSERT OR DELETE OR UPDATE OF review_status, student_id, post_id
ON public.reading_log_teacher_reviews
FOR EACH ROW EXECUTE FUNCTION public.emit_self_writing_title_level_notification_v1();

COMMENT ON FUNCTION public.sync_student_activity_title_notification_v1(UUID, TEXT) IS
    '실제 활동 칭호 단계가 올랐을 때 최종 단계 하나만 기존 학생 활동 알림 원장에 중복 없이 발행한다.';

COMMIT;

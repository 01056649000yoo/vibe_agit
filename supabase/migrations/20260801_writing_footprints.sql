-- ============================================================================
-- 글쓰기 발자국 1차
-- - 이 마이그레이션 적용 이후 활동만 append-only 이벤트로 기록한다.
-- - 원문, 댓글 내용, 평가 점수는 저장하지 않는다.
-- - 학생/친구 화면은 원천 이벤트가 아니라 최신 일별 스냅샷 1건만 읽는다.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.writing_footprint_settings (
    id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    tracking_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.writing_footprint_settings (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.writing_activity_events (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    actor_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL CHECK (event_type IN (
        'post_created',
        'post_saved',
        'post_submitted',
        'post_resubmitted',
        'post_revised',
        'post_published',
        'post_unpublished',
        'post_deleted',
        'feedback_received',
        'comment_added',
        'comment_removed',
        'reaction_added',
        'reaction_removed'
    )),
    post_id UUID,
    object_id UUID,
    metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_writing_events_student_time
    ON public.writing_activity_events (student_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_writing_events_actor_time
    ON public.writing_activity_events (actor_student_id, occurred_at DESC)
    WHERE actor_student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_writing_events_object_time
    ON public.writing_activity_events (object_id, occurred_at DESC, id DESC)
    WHERE object_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_writing_events_class_time
    ON public.writing_activity_events (class_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.student_writing_daily_snapshots (
    student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    snapshot_date DATE NOT NULL,
    posts_written_count INTEGER NOT NULL DEFAULT 0 CHECK (posts_written_count >= 0),
    revisions_count INTEGER NOT NULL DEFAULT 0 CHECK (revisions_count >= 0),
    feedbacks_received_count INTEGER NOT NULL DEFAULT 0 CHECK (feedbacks_received_count >= 0),
    comments_given_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_given_count >= 0),
    comments_received_count INTEGER NOT NULL DEFAULT 0 CHECK (comments_received_count >= 0),
    reactions_given_count INTEGER NOT NULL DEFAULT 0 CHECK (reactions_given_count >= 0),
    reactions_received_count INTEGER NOT NULL DEFAULT 0 CHECK (reactions_received_count >= 0),
    active_days_count INTEGER NOT NULL DEFAULT 0 CHECK (active_days_count >= 0),
    last_activity_at TIMESTAMPTZ,
    generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (student_id, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_writing_snapshots_class_date
    ON public.student_writing_daily_snapshots (class_id, snapshot_date DESC);

ALTER TABLE public.writing_footprint_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_writing_daily_snapshots ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.writing_footprint_settings FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.writing_activity_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.student_writing_daily_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.writing_footprint_settings TO service_role;
GRANT ALL ON TABLE public.writing_activity_events TO service_role;
GRANT ALL ON TABLE public.student_writing_daily_snapshots TO service_role;

CREATE OR REPLACE FUNCTION public.prevent_writing_activity_event_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_setting('app.writing_footprint_maintenance', true) = 'on' THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    RAISE EXCEPTION '글쓰기 발자국 원천 이벤트는 수정하거나 삭제할 수 없습니다.'
        USING ERRCODE = '55000';
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_writing_activity_event_mutation
ON public.writing_activity_events;
CREATE TRIGGER trg_prevent_writing_activity_event_mutation
BEFORE UPDATE OR DELETE ON public.writing_activity_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_writing_activity_event_mutation();

CREATE OR REPLACE FUNCTION public.record_writing_activity_event(
    p_class_id UUID,
    p_student_id UUID,
    p_actor_student_id UUID,
    p_event_type TEXT,
    p_post_id UUID DEFAULT NULL,
    p_object_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_class_id IS NULL OR p_student_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.writing_activity_events (
        class_id,
        student_id,
        actor_student_id,
        event_type,
        post_id,
        object_id,
        metadata
    ) VALUES (
        p_class_id,
        p_student_id,
        p_actor_student_id,
        p_event_type,
        p_post_id,
        p_object_id,
        COALESCE(p_metadata, '{}'::JSONB)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.track_student_post_writing_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_actor_student_id UUID := public.auth_student_id();
    v_is_student_action BOOLEAN;
    v_was_revised BOOLEAN;
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF v_actor_student_id = OLD.student_id THEN
            PERFORM public.record_writing_activity_event(
                OLD.class_id, OLD.student_id, v_actor_student_id,
                'post_deleted', OLD.id, OLD.id,
                jsonb_build_object('writing_context', OLD.writing_context)
            );
        END IF;
        RETURN OLD;
    END IF;

    v_is_student_action := v_actor_student_id IS NOT NULL
        AND v_actor_student_id = NEW.student_id;

    IF TG_OP = 'INSERT' THEN
        IF v_is_student_action THEN
            PERFORM public.record_writing_activity_event(
                NEW.class_id, NEW.student_id, v_actor_student_id,
                'post_created', NEW.id, NEW.id,
                jsonb_build_object(
                    'writing_context', NEW.writing_context,
                    'self_writing_type', NEW.self_writing_type
                )
            );

            IF COALESCE(NEW.is_submitted, false) THEN
                PERFORM public.record_writing_activity_event(
                    NEW.class_id, NEW.student_id, v_actor_student_id,
                    'post_submitted', NEW.id, NEW.id,
                    jsonb_build_object('writing_context', NEW.writing_context)
                );
            END IF;

            IF NEW.writing_context = 'self'
               AND NEW.visibility = 'class'
               AND COALESCE(NEW.is_submitted, false) THEN
                PERFORM public.record_writing_activity_event(
                    NEW.class_id, NEW.student_id, v_actor_student_id,
                    'post_published', NEW.id, NEW.id,
                    jsonb_build_object('self_writing_type', NEW.self_writing_type)
                );
            END IF;
        END IF;
        RETURN NEW;
    END IF;

    IF v_is_student_action
       AND (NEW.title IS DISTINCT FROM OLD.title OR NEW.content IS DISTINCT FROM OLD.content) THEN
        v_was_revised := COALESCE(OLD.is_submitted, false)
            OR OLD.first_submitted_at IS NOT NULL;

        PERFORM public.record_writing_activity_event(
            NEW.class_id, NEW.student_id, v_actor_student_id,
            CASE WHEN v_was_revised THEN 'post_revised' ELSE 'post_saved' END,
            NEW.id, NEW.id,
            jsonb_build_object(
                'writing_context', NEW.writing_context,
                'char_count_before', COALESCE(OLD.char_count, 0),
                'char_count_after', COALESCE(NEW.char_count, 0)
            )
        );
    END IF;

    IF v_is_student_action
       AND NOT COALESCE(OLD.is_submitted, false)
       AND COALESCE(NEW.is_submitted, false) THEN
        PERFORM public.record_writing_activity_event(
            NEW.class_id, NEW.student_id, v_actor_student_id,
            CASE
                WHEN OLD.first_submitted_at IS NULL THEN 'post_submitted'
                ELSE 'post_resubmitted'
            END,
            NEW.id, NEW.id,
            jsonb_build_object('writing_context', NEW.writing_context)
        );
    END IF;

    IF v_is_student_action
       AND NEW.visibility IS DISTINCT FROM OLD.visibility THEN
        IF NEW.visibility = 'class' AND COALESCE(NEW.is_submitted, false) THEN
            PERFORM public.record_writing_activity_event(
                NEW.class_id, NEW.student_id, v_actor_student_id,
                'post_published', NEW.id, NEW.id,
                jsonb_build_object('self_writing_type', NEW.self_writing_type)
            );
        ELSIF NEW.visibility = 'private' THEN
            PERFORM public.record_writing_activity_event(
                NEW.class_id, NEW.student_id, v_actor_student_id,
                'post_unpublished', NEW.id, NEW.id,
                jsonb_build_object('self_writing_type', NEW.self_writing_type)
            );
        END IF;
    END IF;

    IF (
        (NEW.ai_feedback IS DISTINCT FROM OLD.ai_feedback
         AND NULLIF(btrim(COALESCE(NEW.ai_feedback, '')), '') IS NOT NULL)
        OR
        (NEW.eval_comment IS DISTINCT FROM OLD.eval_comment
         AND NULLIF(btrim(COALESCE(NEW.eval_comment, '')), '') IS NOT NULL)
    ) THEN
        PERFORM public.record_writing_activity_event(
            NEW.class_id, NEW.student_id, v_actor_student_id,
            'feedback_received', NEW.id, NEW.id,
            jsonb_build_object(
                'has_ai_feedback', NULLIF(btrim(COALESCE(NEW.ai_feedback, '')), '') IS NOT NULL,
                'has_teacher_comment', NULLIF(btrim(COALESCE(NEW.eval_comment, '')), '') IS NOT NULL
            )
        );
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_student_post_writing_activity
ON public.student_posts;
CREATE TRIGGER trg_track_student_post_writing_activity
AFTER INSERT OR UPDATE OR DELETE ON public.student_posts
FOR EACH ROW EXECUTE FUNCTION public.track_student_post_writing_activity();

CREATE OR REPLACE FUNCTION public.track_post_comment_writing_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_should_add BOOLEAN := false;
    v_should_remove BOOLEAN := false;
    v_comment public.post_comments%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_comment := OLD;
    ELSE
        v_comment := NEW;
    END IF;

    SELECT p.* INTO v_post
    FROM public.student_posts p
    WHERE p.id = v_comment.post_id;

    IF NOT FOUND OR v_comment.student_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        v_should_add := COALESCE(NEW.status, 'approved') = 'approved';
    ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
        v_should_add := COALESCE(OLD.status, '') <> 'approved' AND NEW.status = 'approved';
        v_should_remove := OLD.status = 'approved' AND COALESCE(NEW.status, '') <> 'approved';
    ELSIF TG_OP = 'DELETE' THEN
        v_should_remove := COALESCE(OLD.status, 'approved') = 'approved';
    END IF;

    IF v_should_add THEN
        PERFORM public.record_writing_activity_event(
            v_post.class_id, v_post.student_id, v_comment.student_id,
            'comment_added', v_post.id, v_comment.id,
            jsonb_build_object('writing_context', v_post.writing_context)
        );
    ELSIF v_should_remove THEN
        PERFORM public.record_writing_activity_event(
            v_post.class_id, v_post.student_id, v_comment.student_id,
            'comment_removed', v_post.id, v_comment.id,
            jsonb_build_object('writing_context', v_post.writing_context)
        );
    END IF;

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_post_comment_writing_activity
ON public.post_comments;
CREATE TRIGGER trg_track_post_comment_writing_activity
AFTER INSERT OR UPDATE OF status OR DELETE ON public.post_comments
FOR EACH ROW EXECUTE FUNCTION public.track_post_comment_writing_activity();

CREATE OR REPLACE FUNCTION public.track_post_reaction_writing_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_post public.student_posts%ROWTYPE;
    v_reaction public.post_reactions%ROWTYPE;
BEGIN
    IF TG_OP = 'DELETE' THEN
        v_reaction := OLD;
    ELSE
        v_reaction := NEW;
    END IF;

    SELECT p.* INTO v_post
    FROM public.student_posts p
    WHERE p.id = v_reaction.post_id;

    IF NOT FOUND OR v_reaction.student_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
    END IF;

    PERFORM public.record_writing_activity_event(
        v_post.class_id, v_post.student_id, v_reaction.student_id,
        CASE WHEN TG_OP = 'DELETE' THEN 'reaction_removed' ELSE 'reaction_added' END,
        v_post.id, v_reaction.id,
        jsonb_build_object(
            'writing_context', v_post.writing_context,
            'reaction_type', v_reaction.reaction_type
        )
    );

    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_track_post_reaction_writing_activity
ON public.post_reactions;
CREATE TRIGGER trg_track_post_reaction_writing_activity
AFTER INSERT OR DELETE ON public.post_reactions
FOR EACH ROW EXECUTE FUNCTION public.track_post_reaction_writing_activity();

CREATE OR REPLACE FUNCTION public.refresh_writing_footprint_snapshots(
    p_snapshot_date DATE DEFAULT ((timezone('Asia/Seoul', NOW()))::DATE - 1)
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cutoff TIMESTAMPTZ;
    v_rows INTEGER;
BEGIN
    IF p_snapshot_date IS NULL THEN
        RAISE EXCEPTION '스냅샷 기준일이 필요합니다.' USING ERRCODE = '22023';
    END IF;

    v_cutoff := ((p_snapshot_date + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul');

    WITH event_base AS (
        SELECT e.*
        FROM public.writing_activity_events e
        WHERE e.occurred_at < v_cutoff
    ),
    post_stats AS (
        SELECT
            e.student_id,
            count(*) FILTER (WHERE e.event_type = 'post_submitted')::INTEGER AS posts_written_count,
            count(DISTINCT (e.post_id, (timezone('Asia/Seoul', e.occurred_at))::DATE))
                FILTER (WHERE e.event_type = 'post_revised')::INTEGER AS revisions_count,
            count(DISTINCT (e.post_id, (timezone('Asia/Seoul', e.occurred_at))::DATE))
                FILTER (WHERE e.event_type = 'feedback_received')::INTEGER AS feedbacks_received_count
        FROM event_base e
        GROUP BY e.student_id
    ),
    latest_comment_events AS (
        SELECT DISTINCT ON (e.object_id)
            e.object_id, e.event_type, e.post_id, e.student_id, e.actor_student_id
        FROM event_base e
        WHERE e.event_type IN ('comment_added', 'comment_removed')
          AND e.object_id IS NOT NULL
        ORDER BY e.object_id, e.occurred_at DESC, e.id DESC
    ),
    active_comments AS (
        SELECT * FROM latest_comment_events WHERE event_type = 'comment_added'
    ),
    comments_received AS (
        SELECT student_id,
               count(DISTINCT (post_id, actor_student_id))::INTEGER AS comments_received_count
        FROM active_comments
        GROUP BY student_id
    ),
    comments_given AS (
        SELECT actor_student_id AS student_id,
               count(DISTINCT (post_id, actor_student_id))::INTEGER AS comments_given_count
        FROM active_comments
        WHERE actor_student_id IS NOT NULL
        GROUP BY actor_student_id
    ),
    latest_reaction_events AS (
        SELECT DISTINCT ON (e.object_id)
            e.object_id, e.event_type, e.post_id, e.student_id, e.actor_student_id
        FROM event_base e
        WHERE e.event_type IN ('reaction_added', 'reaction_removed')
          AND e.object_id IS NOT NULL
        ORDER BY e.object_id, e.occurred_at DESC, e.id DESC
    ),
    active_reactions AS (
        SELECT * FROM latest_reaction_events WHERE event_type = 'reaction_added'
    ),
    reactions_received AS (
        SELECT student_id, count(*)::INTEGER AS reactions_received_count
        FROM active_reactions
        GROUP BY student_id
    ),
    reactions_given AS (
        SELECT actor_student_id AS student_id, count(*)::INTEGER AS reactions_given_count
        FROM active_reactions
        WHERE actor_student_id IS NOT NULL
        GROUP BY actor_student_id
    ),
    active_actions AS (
        SELECT
            e.student_id,
            (timezone('Asia/Seoul', e.occurred_at))::DATE AS activity_date,
            e.occurred_at
        FROM event_base e
        WHERE e.event_type IN (
            'post_created', 'post_saved', 'post_submitted', 'post_resubmitted',
            'post_revised', 'post_published', 'post_unpublished', 'post_deleted'
        )
          AND e.actor_student_id = e.student_id
        UNION ALL
        SELECT
            e.actor_student_id,
            (timezone('Asia/Seoul', e.occurred_at))::DATE,
            e.occurred_at
        FROM event_base e
        WHERE e.event_type IN ('comment_added', 'reaction_added')
          AND e.actor_student_id IS NOT NULL
    ),
    activity_stats AS (
        SELECT
            student_id,
            count(DISTINCT activity_date)::INTEGER AS active_days_count,
            max(occurred_at) AS last_activity_at
        FROM active_actions
        GROUP BY student_id
    )
    INSERT INTO public.student_writing_daily_snapshots (
        student_id,
        class_id,
        snapshot_date,
        posts_written_count,
        revisions_count,
        feedbacks_received_count,
        comments_given_count,
        comments_received_count,
        reactions_given_count,
        reactions_received_count,
        active_days_count,
        last_activity_at,
        generated_at
    )
    SELECT
        s.id,
        s.class_id,
        p_snapshot_date,
        COALESCE(ps.posts_written_count, 0),
        COALESCE(ps.revisions_count, 0),
        COALESCE(ps.feedbacks_received_count, 0),
        COALESCE(cg.comments_given_count, 0),
        COALESCE(cr.comments_received_count, 0),
        COALESCE(rg.reactions_given_count, 0),
        COALESCE(rr.reactions_received_count, 0),
        COALESCE(a.active_days_count, 0),
        a.last_activity_at,
        NOW()
    FROM public.students s
    LEFT JOIN post_stats ps ON ps.student_id = s.id
    LEFT JOIN comments_given cg ON cg.student_id = s.id
    LEFT JOIN comments_received cr ON cr.student_id = s.id
    LEFT JOIN reactions_given rg ON rg.student_id = s.id
    LEFT JOIN reactions_received rr ON rr.student_id = s.id
    LEFT JOIN activity_stats a ON a.student_id = s.id
    WHERE s.class_id IS NOT NULL
      AND s.is_active IS DISTINCT FROM false
      AND (s.deleted_at IS NULL OR s.deleted_at > NOW())
    ON CONFLICT (student_id, snapshot_date) DO UPDATE
    SET class_id = EXCLUDED.class_id,
        posts_written_count = EXCLUDED.posts_written_count,
        revisions_count = EXCLUDED.revisions_count,
        feedbacks_received_count = EXCLUDED.feedbacks_received_count,
        comments_given_count = EXCLUDED.comments_given_count,
        comments_received_count = EXCLUDED.comments_received_count,
        reactions_given_count = EXCLUDED.reactions_given_count,
        reactions_received_count = EXCLUDED.reactions_received_count,
        active_days_count = EXCLUDED.active_days_count,
        last_activity_at = EXCLUDED.last_activity_at,
        generated_at = NOW();

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN v_rows;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_writing_footprint()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_snapshot public.student_writing_daily_snapshots%ROWTYPE;
    v_tracking_started_at TIMESTAMPTZ;
BEGIN
    IF v_student_id IS NULL THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT tracking_started_at INTO v_tracking_started_at
    FROM public.writing_footprint_settings WHERE id = 1;

    SELECT * INTO v_snapshot
    FROM public.student_writing_daily_snapshots
    WHERE student_id = v_student_id
    ORDER BY snapshot_date DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'tracking_started_at', v_tracking_started_at,
        'snapshot_date', v_snapshot.snapshot_date,
        'posts_written_count', COALESCE(v_snapshot.posts_written_count, 0),
        'revisions_count', COALESCE(v_snapshot.revisions_count, 0),
        'feedbacks_received_count', COALESCE(v_snapshot.feedbacks_received_count, 0),
        'comments_given_count', COALESCE(v_snapshot.comments_given_count, 0),
        'comments_received_count', COALESCE(v_snapshot.comments_received_count, 0),
        'reactions_given_count', COALESCE(v_snapshot.reactions_given_count, 0),
        'reactions_received_count', COALESCE(v_snapshot.reactions_received_count, 0),
        'active_days_count', COALESCE(v_snapshot.active_days_count, 0),
        'last_activity_at', v_snapshot.last_activity_at
    );
END;
$$;

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
    v_snapshot public.student_writing_daily_snapshots%ROWTYPE;
    v_tracking_started_at TIMESTAMPTZ;
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

    SELECT tracking_started_at INTO v_tracking_started_at
    FROM public.writing_footprint_settings WHERE id = 1;

    SELECT * INTO v_snapshot
    FROM public.student_writing_daily_snapshots
    WHERE student_id = p_student_id
    ORDER BY snapshot_date DESC
    LIMIT 1;

    RETURN jsonb_build_object(
        'student_name', v_target_name,
        'tracking_started_at', v_tracking_started_at,
        'snapshot_date', v_snapshot.snapshot_date,
        'posts_written_count', COALESCE(v_snapshot.posts_written_count, 0),
        'revisions_count', COALESCE(v_snapshot.revisions_count, 0),
        'comments_given_count', COALESCE(v_snapshot.comments_given_count, 0),
        'comments_received_count', COALESCE(v_snapshot.comments_received_count, 0),
        'reactions_received_count', COALESCE(v_snapshot.reactions_received_count, 0),
        'active_days_count', COALESCE(v_snapshot.active_days_count, 0)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_writing_activity_event_mutation()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_writing_activity_event(UUID, UUID, UUID, TEXT, UUID, UUID, JSONB)
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.track_student_post_writing_activity()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.track_post_comment_writing_activity()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.track_post_reaction_writing_activity()
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_writing_footprint_snapshots(DATE)
    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_writing_footprint_snapshots(DATE)
    TO service_role;

REVOKE ALL ON FUNCTION public.get_my_writing_footprint()
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_writing_footprint()
    TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_friend_writing_footprint(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_friend_writing_footprint(UUID)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

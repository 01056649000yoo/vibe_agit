BEGIN;

-- 학생이 과제 글에서 실제로 참고하기로 정한 연구소 개요 한 건을 보관한다.
-- 글 레코드보다 먼저 선택할 수 있어야 하므로 student_posts가 아니라 학생+과제에 붙인다.
CREATE TABLE IF NOT EXISTS public.writing_assignment_outline_pins (
    class_id UUID NOT NULL
        REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL
        REFERENCES public.students(id) ON DELETE CASCADE,
    mission_id UUID NOT NULL
        REFERENCES public.writing_missions(id) ON DELETE CASCADE,
    result_id UUID NOT NULL
        REFERENCES writing_helper.portable_results(id) ON DELETE RESTRICT,
    pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (class_id, student_id, mission_id)
);

CREATE INDEX IF NOT EXISTS writing_assignment_outline_pins_result_idx
    ON public.writing_assignment_outline_pins(result_id);

COMMENT ON TABLE public.writing_assignment_outline_pins IS
    '학생이 과제 글에 명시적으로 고정한 현재 연구소 개요. 개요 내용은 portable_results의 최신본을 읽는다.';
COMMENT ON COLUMN public.writing_assignment_outline_pins.pinned_at IS
    '현재 result_id를 선택하거나 다른 개요로 교체한 시각.';

-- 현재 포인터를 덮어써도 어떤 개요에서 어떤 개요로 바꿨는지 남긴다.
-- 과거 연구소 결과 정리를 막지 않도록 이력의 결과 UUID에는 FK를 걸지 않는다.
CREATE TABLE IF NOT EXISTS public.writing_assignment_outline_pin_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL
        REFERENCES public.classes(id) ON DELETE CASCADE,
    student_id UUID NOT NULL
        REFERENCES public.students(id) ON DELETE CASCADE,
    mission_id UUID NOT NULL
        REFERENCES public.writing_missions(id) ON DELETE CASCADE,
    previous_result_id UUID,
    result_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('pin', 'replace')),
    actor_auth_id UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS writing_assignment_outline_pin_events_lookup_idx
    ON public.writing_assignment_outline_pin_events(
        class_id, mission_id, student_id, created_at DESC, id DESC
    );

COMMENT ON TABLE public.writing_assignment_outline_pin_events IS
    '과제 개요 최초 고정과 교체 이력. 학생·교사 화면은 현재 포인터만 읽고 감사 시에만 이력을 사용한다.';

ALTER TABLE public.writing_assignment_outline_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.writing_assignment_outline_pin_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.writing_assignment_outline_pins
    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.writing_assignment_outline_pin_events
    FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.writing_assignment_outline_pins
    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.writing_assignment_outline_pin_events
    TO service_role;

-- 과제 연결 자료와 고정 개요를 학생 범위에서 곧바로 찾는다.
CREATE INDEX IF NOT EXISTS portable_results_writing_reference_lookup_idx
    ON writing_helper.portable_results(
        agit_student_id, class_id, room_id, result_kind, id
    );

CREATE OR REPLACE FUNCTION public.set_my_assignment_outline_pin_v1(
    p_mission_id UUID,
    p_result_id UUID,
    p_expected_result_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_current public.writing_assignment_outline_pins%ROWTYPE;
    v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
    IF public.auth_user_role() <> 'STUDENT'
       OR v_student_id IS NULL
       OR p_mission_id IS NULL
       OR p_result_id IS NULL THEN
        RAISE EXCEPTION 'student authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id
      INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL;

    IF v_class_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.writing_missions mission
        WHERE mission.id = p_mission_id
          AND mission.class_id = v_class_id
    ) THEN
        RAISE EXCEPTION 'student mission access required' USING ERRCODE = '42501';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM writing_helper.portable_results result
        WHERE result.id = p_result_id
          AND result.agit_student_id = v_student_id
          AND result.class_id = v_class_id
          AND result.result_kind = 'outline'
    ) THEN
        RAISE EXCEPTION 'student outline result required' USING ERRCODE = '22023';
    END IF;

    -- 서로 다른 탭에서 최초 선택·교체를 동시에 눌러도 한 과제의 포인터를 차례로 비교한다.
    PERFORM pg_advisory_xact_lock(hashtextextended(
        v_student_id::TEXT || ':' || p_mission_id::TEXT,
        0
    ));

    SELECT pin.*
      INTO v_current
    FROM public.writing_assignment_outline_pins pin
    WHERE pin.class_id = v_class_id
      AND pin.student_id = v_student_id
      AND pin.mission_id = p_mission_id
    FOR UPDATE;

    -- 같은 개요 재요청은 승인 뒤에도 안전한 멱등 성공으로 처리한다.
    IF v_current.result_id = p_result_id THEN
        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'unchanged',
            'result_id', v_current.result_id,
            'previous_result_id', v_current.result_id,
            'pinned_at', v_current.pinned_at
        );
    END IF;

    IF v_current.result_id IS DISTINCT FROM p_expected_result_id THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'status', 'conflict',
            'current_result_id', v_current.result_id
        );
    END IF;

    -- 최종 승인 뒤에는 참고 개요 자체를 바꾸지 않는다. 승인 회수 뒤에는 다시 교체할 수 있다.
    IF EXISTS (
        SELECT 1
        FROM public.student_posts post
        WHERE post.class_id = v_class_id
          AND post.student_id = v_student_id
          AND post.mission_id = p_mission_id
          AND post.is_confirmed IS TRUE
    ) THEN
        RETURN jsonb_build_object(
            'success', FALSE,
            'status', 'approved_locked',
            'current_result_id', v_current.result_id
        );
    END IF;

    IF v_current.result_id IS NULL THEN
        INSERT INTO public.writing_assignment_outline_pins (
            class_id, student_id, mission_id, result_id, pinned_at, created_at, updated_at
        ) VALUES (
            v_class_id, v_student_id, p_mission_id, p_result_id, v_now, v_now, v_now
        );

        INSERT INTO public.writing_assignment_outline_pin_events (
            class_id, student_id, mission_id, previous_result_id,
            result_id, action, actor_auth_id, created_at
        ) VALUES (
            v_class_id, v_student_id, p_mission_id, NULL,
            p_result_id, 'pin', auth.uid(), v_now
        );

        RETURN jsonb_build_object(
            'success', TRUE,
            'status', 'pinned',
            'result_id', p_result_id,
            'previous_result_id', NULL,
            'pinned_at', v_now
        );
    END IF;

    UPDATE public.writing_assignment_outline_pins
    SET result_id = p_result_id,
        pinned_at = v_now,
        updated_at = v_now
    WHERE class_id = v_class_id
      AND student_id = v_student_id
      AND mission_id = p_mission_id;

    INSERT INTO public.writing_assignment_outline_pin_events (
        class_id, student_id, mission_id, previous_result_id,
        result_id, action, actor_auth_id, created_at
    ) VALUES (
        v_class_id, v_student_id, p_mission_id, v_current.result_id,
        p_result_id, 'replace', auth.uid(), v_now
    );

    RETURN jsonb_build_object(
        'success', TRUE,
        'status', 'replaced',
        'result_id', p_result_id,
        'previous_result_id', v_current.result_id,
        'pinned_at', v_now
    );
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_assignment_outline_pin_v1(UUID, UUID, UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_assignment_outline_pin_v1(UUID, UUID, UUID)
    TO authenticated, service_role;

-- 고정된 개요, 교사가 과제에 연결한 자료, 최근 자료 순서로 후보 ID만 좁힌 뒤 내용을 읽는다.
DROP FUNCTION IF EXISTS public.get_my_writing_references_v1(UUID, INTEGER);
CREATE OR REPLACE FUNCTION public.get_my_writing_references_v1(
    p_mission_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    id UUID,
    session_id UUID,
    room_id UUID,
    activity_type TEXT,
    activity_version INTEGER,
    schema_version INTEGER,
    result_kind TEXT,
    title TEXT,
    topic TEXT,
    hint TEXT,
    chunks JSONB,
    completed_at TIMESTAMPTZ,
    result_updated_at TIMESTAMPTZ,
    is_linked BOOLEAN,
    is_pinned BOOLEAN,
    pinned_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_student_id UUID := public.auth_student_id();
    v_class_id UUID;
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);
BEGIN
    IF public.auth_user_role() <> 'STUDENT'
       OR v_student_id IS NULL
       OR p_mission_id IS NULL THEN
        RAISE EXCEPTION 'student authentication required' USING ERRCODE = '42501';
    END IF;

    SELECT student.class_id
      INTO v_class_id
    FROM public.students student
    WHERE student.id = v_student_id
      AND student.is_active IS DISTINCT FROM FALSE
      AND student.deleted_at IS NULL;

    IF v_class_id IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.writing_missions mission
        WHERE mission.id = p_mission_id
          AND mission.class_id = v_class_id
    ) THEN
        RAISE EXCEPTION 'student mission access required' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    WITH current_pin AS (
        SELECT pin.result_id, pin.pinned_at
        FROM public.writing_assignment_outline_pins pin
        WHERE pin.class_id = v_class_id
          AND pin.student_id = v_student_id
          AND pin.mission_id = p_mission_id
    ), linked_ids AS (
        SELECT portable.id
        FROM public.writing_mission_lab_sources source
        JOIN writing_helper.portable_results portable
          ON portable.agit_student_id = v_student_id
         AND portable.class_id = source.class_id
         AND portable.room_id = source.room_id
         AND portable.result_kind = source.result_kind
        WHERE source.class_id = v_class_id
          AND source.mission_id = p_mission_id
    ), recent_ids AS (
        SELECT portable.id
        FROM writing_helper.portable_results portable
        WHERE portable.agit_student_id = v_student_id
          AND portable.class_id = v_class_id
          AND portable.result_kind IN ('outline', 'selected_questions', 'one_line')
        ORDER BY portable.completed_at DESC, portable.id DESC
        LIMIT v_limit
    ), candidate_ids AS (
        SELECT pin.result_id AS id, 0 AS priority FROM current_pin pin
        UNION ALL
        SELECT linked.id, 1 AS priority FROM linked_ids linked
        UNION ALL
        SELECT recent.id, 2 AS priority FROM recent_ids recent
    ), deduplicated AS (
        SELECT candidate.id, MIN(candidate.priority) AS priority
        FROM candidate_ids candidate
        GROUP BY candidate.id
    )
    SELECT
        portable.id,
        portable.session_id,
        portable.room_id,
        portable.activity_type,
        portable.activity_version,
        portable.schema_version,
        portable.result_kind,
        portable.title,
        portable.topic,
        public.lab_result_hint_v1(portable.room_id, portable.result_kind) AS hint,
        portable.chunks,
        portable.completed_at,
        portable.updated_at AS result_updated_at,
        source.room_id IS NOT NULL AS is_linked,
        pin.result_id IS NOT NULL AS is_pinned,
        pin.pinned_at
    FROM deduplicated candidate
    JOIN writing_helper.portable_results portable
      ON portable.id = candidate.id
     AND portable.agit_student_id = v_student_id
     AND portable.class_id = v_class_id
     AND portable.result_kind IN ('outline', 'selected_questions', 'one_line')
    LEFT JOIN public.writing_mission_lab_sources source
      ON source.mission_id = p_mission_id
     AND source.class_id = portable.class_id
     AND source.room_id = portable.room_id
     AND source.result_kind = portable.result_kind
    LEFT JOIN current_pin pin
      ON pin.result_id = portable.id
    ORDER BY (pin.result_id IS NOT NULL) DESC,
             (source.room_id IS NOT NULL) DESC,
             portable.completed_at DESC,
             portable.id DESC
    LIMIT v_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_writing_references_v1(UUID, INTEGER)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_writing_references_v1(UUID, INTEGER)
    TO authenticated, service_role;

-- 기존 교사 글 상세 한 번에 현재 고정 개요도 함께 돌려 N+1과 별도 개요 RPC를 만들지 않는다.
CREATE OR REPLACE FUNCTION public.get_teacher_post_detail_v1(p_post_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, writing_helper
AS $$
DECLARE
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1
        FROM public.student_posts post
        JOIN public.classes class
          ON class.id = post.class_id
        WHERE post.id = p_post_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '이 글을 확인할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'version', 2,
        'post', to_jsonb(post),
        'student', jsonb_build_object('id', student.id, 'name', student.name),
        'mission', CASE WHEN mission.id IS NULL THEN NULL ELSE to_jsonb(mission) END,
        'outline_reference', (
            SELECT jsonb_build_object(
                'id', portable.id,
                'session_id', portable.session_id,
                'room_id', portable.room_id,
                'activity_type', portable.activity_type,
                'activity_version', portable.activity_version,
                'schema_version', portable.schema_version,
                'result_kind', portable.result_kind,
                'title', portable.title,
                'topic', portable.topic,
                'hint', public.lab_result_hint_v1(portable.room_id, portable.result_kind),
                'chunks', portable.chunks,
                'completed_at', portable.completed_at,
                'result_updated_at', portable.updated_at,
                'is_pinned', TRUE,
                'pinned_at', pin.pinned_at,
                'selection_changed_after_first_submit',
                    post.first_submitted_at IS NOT NULL AND pin.pinned_at > post.first_submitted_at,
                'content_changed_after_first_submit',
                    post.first_submitted_at IS NOT NULL AND portable.updated_at > post.first_submitted_at,
                'content_changed_after_approval',
                    post.approved_at IS NOT NULL AND portable.updated_at > post.approved_at
            )
            FROM public.writing_assignment_outline_pins pin
            JOIN writing_helper.portable_results portable
              ON portable.id = pin.result_id
             AND portable.agit_student_id = pin.student_id
             AND portable.class_id = pin.class_id
             AND portable.result_kind = 'outline'
            WHERE pin.class_id = post.class_id
              AND pin.student_id = post.student_id
              AND pin.mission_id = post.mission_id
            LIMIT 1
        ),
        'reactions', COALESCE((
            SELECT jsonb_agg(
                to_jsonb(reaction) || jsonb_build_object('student_name', reaction_student.name)
                ORDER BY reaction.created_at
            )
            FROM public.post_reactions reaction
            LEFT JOIN public.students reaction_student
              ON reaction_student.id = reaction.student_id
             AND reaction_student.class_id = post.class_id
            WHERE reaction.post_id = post.id
              AND reaction.class_id = post.class_id
        ), '[]'::JSONB),
        'comments', COALESCE((
            SELECT jsonb_agg(
                to_jsonb(comment) || jsonb_build_object('student_name', comment_student.name)
                ORDER BY comment.created_at
            )
            FROM public.post_comments comment
            LEFT JOIN public.students comment_student
              ON comment_student.id = comment.student_id
             AND comment_student.class_id = post.class_id
            WHERE comment.post_id = post.id
              AND comment.class_id = post.class_id
        ), '[]'::JSONB)
    ) INTO v_result
    FROM public.student_posts post
    JOIN public.students student
      ON student.id = post.student_id
     AND student.class_id = post.class_id
    LEFT JOIN public.writing_missions mission
      ON mission.id = post.mission_id
     AND mission.class_id = post.class_id
    WHERE post.id = p_post_id;

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_post_detail_v1(UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_post_detail_v1(UUID)
    TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

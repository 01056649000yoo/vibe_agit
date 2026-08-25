-- 학생이 어느 화면에 있든 교사의 과제 글 반려·승인을 약 12초 안에 알 수 있도록
-- 기존 활동 알림 원장에서 아주 작은 신호만 읽는다.
--
-- 전체 알림 목록/개수/payload를 주기적으로 읽지 않는다. 인증 학생의 실제 학급·학생을
-- 직접 고정하고, 반려·승인 두 유형의 ID·유형·시각만 한 번에 최대 10건 반환한다.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_student_notification_events_priority_writing_poll
    ON public.student_notification_events (class_id, student_id, created_at, id)
    WHERE event_type IN ('writing.rewrite_requested', 'writing.approved');

CREATE OR REPLACE FUNCTION public.poll_my_priority_writing_notifications_v1(
    p_after_created_at TIMESTAMPTZ,
    p_after_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_student public.students%ROWTYPE;
    v_items JSONB := '[]'::JSONB;
    v_cursor_created_at TIMESTAMPTZ := p_after_created_at;
    v_cursor_id UUID := p_after_id;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;
    IF p_after_created_at IS NULL OR p_after_id IS NULL THEN
        RAISE EXCEPTION '알림 확인 기준 시각과 ID가 필요합니다.' USING ERRCODE = '22023';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM FALSE
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;
    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    -- raw_changes의 마지막 행으로 커서를 전진시킨다. 승인 직후 회수처럼 현재 상태와
    -- 맞지 않아 표시하지 않는 이벤트도 다시 매번 검사하지 않게 하기 위해서다.
    WITH raw_changes AS MATERIALIZED (
        SELECT event.id, event.event_type, event.entity_id, event.created_at
        FROM public.student_notification_events event
        WHERE event.class_id = v_student.class_id
          AND event.student_id = v_student.id
          AND event.event_type IN ('writing.rewrite_requested', 'writing.approved')
          AND (event.created_at, event.id) > (p_after_created_at, p_after_id)
        ORDER BY event.created_at, event.id
        LIMIT 10
    ), current_items AS (
        SELECT change.id, change.event_type, change.entity_id, change.created_at
        FROM raw_changes change
        JOIN public.student_posts post
          ON post.id = change.entity_id
         AND post.class_id = v_student.class_id
         AND post.student_id = v_student.id
        WHERE (
            change.event_type = 'writing.rewrite_requested'
            AND post.writing_context = 'assignment'
            AND post.is_returned IS TRUE
            AND post.is_submitted IS FALSE
            AND post.is_confirmed IS FALSE
            AND post.recalled_at IS NULL
        ) OR (
            change.event_type = 'writing.approved'
            AND post.writing_context = 'assignment'
            AND post.is_confirmed IS TRUE
        )
    ), valid_items AS (
        -- 같은 글이 짧은 시간에 여러 번 반려·승인되어도 현재 상태에 맞는 가장 최신
        -- 신호 하나만 보여 준다. 커서는 raw_changes의 끝까지 전진하므로 중복은 재조회되지 않는다.
        SELECT DISTINCT ON (item.entity_id)
            item.id, item.event_type, item.entity_id, item.created_at
        FROM current_items item
        ORDER BY item.entity_id, item.created_at DESC, item.id DESC
    )
    SELECT
        COALESCE((
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', item.id,
                    'event_type', item.event_type,
                    'entity_id', item.entity_id,
                    'created_at', item.created_at
                ) ORDER BY item.created_at, item.id
            )
            FROM valid_items item
        ), '[]'::JSONB),
        COALESCE((
            SELECT change.created_at
            FROM raw_changes change
            ORDER BY change.created_at DESC, change.id DESC
            LIMIT 1
        ), p_after_created_at),
        COALESCE((
            SELECT change.id
            FROM raw_changes change
            ORDER BY change.created_at DESC, change.id DESC
            LIMIT 1
        ), p_after_id)
    INTO v_items, v_cursor_created_at, v_cursor_id;

    RETURN jsonb_build_object(
        'version', 1,
        'items', v_items,
        'cursor', jsonb_build_object(
            'created_at', v_cursor_created_at,
            'id', v_cursor_id
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.poll_my_priority_writing_notifications_v1(TIMESTAMPTZ, UUID)
    FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.poll_my_priority_writing_notifications_v1(TIMESTAMPTZ, UUID)
    TO authenticated, service_role;

COMMENT ON FUNCTION public.poll_my_priority_writing_notifications_v1(TIMESTAMPTZ, UUID) IS
    '인증 학생 본인의 과제 글 반려·승인 신호를 커서 뒤 최대 10건, 최소 필드로 반환한다.';

NOTIFY pgrst, 'reload schema';

COMMIT;

-- 2026-10-11 보안 점검 정비 두 가지.
-- 1) 과제를 친구들에게 여는 함수: 쉬는(비활성) 학생이 있으면 알림이 거절돼 열기 전체가 취소되던 것을 막고,
--    과제 행을 잠가 동시에 두 번 눌러도 한 번만 열리게 한다.
-- 2) 문집 표지 읽기: 학생은 학급 전체 책 표지가 아니라, 학생에게 공개된 확정판이 있는 우리 반 문집과 내 문집 표지만 읽는다.
CREATE OR REPLACE FUNCTION public.open_mission_peer_reading_v1(
    p_mission_id UUID,
    p_allow_comments BOOLEAN DEFAULT TRUE,
    p_preview BOOLEAN DEFAULT FALSE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_mission public.writing_missions%ROWTYPE;
    v_teacher UUID;
    v_students INTEGER;
    v_submitted INTEGER;
    v_approved INTEGER;
    v_student RECORD;
BEGIN
    SELECT m.* INTO v_mission FROM public.writing_missions m WHERE m.id = p_mission_id FOR UPDATE;  -- 동시에 두 번 열어도 알림·열린 시각이 한 번만
    IF v_mission.id IS NULL THEN
        RAISE EXCEPTION '과제를 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;
    SELECT c.teacher_id INTO v_teacher FROM public.classes c WHERE c.id = v_mission.class_id;
    IF auth.uid() IS NULL OR (v_teacher IS DISTINCT FROM auth.uid() AND public.auth_user_role() IS DISTINCT FROM 'ADMIN') THEN
        RAISE EXCEPTION '담당 학급의 선생님만 열 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT count(*) INTO v_students FROM public.students s WHERE s.class_id = v_mission.class_id AND s.deleted_at IS NULL;
    SELECT count(*) FILTER (WHERE p.is_submitted OR p.is_confirmed), count(*) FILTER (WHERE p.is_confirmed)
    INTO v_submitted, v_approved
    FROM public.student_posts p WHERE p.mission_id = p_mission_id AND p.writing_context = 'assignment';

    IF p_preview OR v_mission.peer_reading_enabled IS NOT FALSE THEN
        RETURN jsonb_build_object(
            'already_open', v_mission.peer_reading_enabled IS NOT FALSE,
            'opened_at', v_mission.peer_reading_opened_at,
            'students', v_students, 'submitted', v_submitted, 'approved', v_approved
        );
    END IF;

    UPDATE public.writing_missions
    SET peer_reading_enabled = TRUE,
        peer_reading_opened_at = clock_timestamp(),
        allow_comments = COALESCE(p_allow_comments, allow_comments)
    WHERE id = p_mission_id
    RETURNING * INTO v_mission;

    -- 그 반 학생에게 알림 한 번(같은 과제는 event_key 가 같아 다시 쌓이지 않는다)
    FOR v_student IN SELECT s.id FROM public.students s WHERE s.class_id = v_mission.class_id AND s.deleted_at IS NULL
                   AND s.is_active IS DISTINCT FROM FALSE LOOP  -- 쉬는(비활성) 학생이 있으면 알림이 거절돼 열기 전체가 취소되던 것
        PERFORM public.notification_emit_v1(
            v_student.id, 'writing', 'writing.peer_reading_opened', 'writing_mission', v_mission.id,
            jsonb_build_object('mission_id', v_mission.id, 'mission_title', v_mission.title,
                               'comments_open', v_mission.allow_comments),
            format('writing:%s:peer_opened', v_mission.id)
        );
    END LOOP;

    RETURN jsonb_build_object(
        'already_open', FALSE,
        'opened_at', v_mission.peer_reading_opened_at,
        'allow_comments', v_mission.allow_comments,
        'students', v_students, 'submitted', v_submitted, 'approved', v_approved
    );
END;
$$;
REVOKE ALL ON FUNCTION public.open_mission_peer_reading_v1(UUID, BOOLEAN, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_mission_peer_reading_v1(UUID, BOOLEAN, BOOLEAN) TO authenticated;

CREATE OR REPLACE FUNCTION public.can_access_class_agit_cover_v1(p_path TEXT, p_write BOOLEAN)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND COALESCE((
        SELECT
            (c.teacher_id = auth.uid() AND public.class_agit_class_is_allowed_v1(c.id) AND (NOT p_write OR NOT b.archived))
            OR (NOT p_write AND public.auth_user_role() = 'ADMIN')
            OR (NOT p_write AND public.auth_student_id() IS NOT NULL AND public.auth_user_class_id() = c.id
                AND NOT b.archived
                AND (b.book_type = 'class' OR b.owner_student_id = public.auth_student_id())
                AND EXISTS (SELECT 1 FROM public.class_agit_book_editions e
                            WHERE e.class_id = b.class_id AND e.book_id = b.id AND e.student_visible))
            OR (NOT p_write AND EXISTS (
                SELECT 1 FROM public.neighbor_shared_books s
                JOIN public.neighbor_space_classes owner_m ON owner_m.space_id = s.space_id AND owner_m.class_id = s.class_id AND owner_m.status = 'active'
                JOIN public.neighbor_space_classes reader_m ON reader_m.space_id = s.space_id AND reader_m.status = 'active'
                WHERE s.book_id = b.id AND s.class_id = c.id AND s.status = 'published'
                  AND (s.shared_until IS NULL OR s.shared_until > NOW())
                  AND (reader_m.class_id = public.auth_user_class_id()
                       OR reader_m.class_id IN (SELECT id FROM public.classes WHERE teacher_id = auth.uid() AND deleted_at IS NULL))
            ))
        FROM public.classes c
        JOIN public.class_agit_books b ON b.class_id = c.id
        WHERE c.id::TEXT = split_part(p_path, '/', 1)
          AND b.id::TEXT = split_part(p_path, '/', 2)
          AND c.deleted_at IS NULL
    ), FALSE);
$$;
REVOKE ALL ON FUNCTION public.can_access_class_agit_cover_v1(TEXT, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_class_agit_cover_v1(TEXT, BOOLEAN) TO authenticated;

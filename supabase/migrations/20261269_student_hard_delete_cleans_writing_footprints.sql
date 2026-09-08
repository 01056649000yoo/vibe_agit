-- 학생 영구 삭제는 writing_activity_events의 학생 FK를 CASCADE로 지운다.
-- 원장 불변 트리거가 이 정상적인 개인정보 파기까지 막고 있었으므로, 권한 확인을 마친
-- 두 삭제 RPC의 DELETE 구간에서만 기존 유지보수 우회를 트랜잭션 로컬로 켠다.

BEGIN;

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
    -- 개인정보 파기 중 연쇄 삭제된 댓글·반응을 새 활동으로 다시 기록하지 않는다.
    IF current_setting('app.writing_footprint_maintenance', true) = 'on' THEN
        RETURN;
    END IF;

    IF p_class_id IS NULL OR p_student_id IS NULL THEN
        RETURN;
    END IF;

    INSERT INTO public.writing_activity_events (
        class_id, student_id, actor_student_id, event_type, post_id, object_id, metadata
    ) VALUES (
        p_class_id, p_student_id, p_actor_student_id, p_event_type, p_post_id, p_object_id,
        COALESCE(p_metadata, '{}'::JSONB)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_student_immediately(p_student_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
BEGIN
    SELECT student.class_id INTO v_class_id
    FROM public.students student
    WHERE student.id = p_student_id;

    IF v_class_id IS NULL THEN
        RAISE EXCEPTION '학생을 찾을 수 없습니다.' USING ERRCODE = 'P0002';
    END IF;

    IF NOT public.is_admin() AND NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = v_class_id
          AND class.teacher_id = auth.uid()
          AND class.deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION '이 학생을 삭제할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.writing_footprint_maintenance', 'on', true);
    DELETE FROM public.students WHERE id = p_student_id;
    PERFORM set_config('app.writing_footprint_maintenance', 'off', true);
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.writing_footprint_maintenance', 'off', true);
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_students(p_class_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.teacher_id = auth.uid()
          AND class.deleted_at IS NULL
    ) AND NOT public.is_admin() THEN
        RAISE EXCEPTION '권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM set_config('app.writing_footprint_maintenance', 'on', true);
    DELETE FROM public.students
    WHERE class_id = p_class_id
      AND deleted_at IS NOT NULL
      AND deleted_at < (NOW() - INTERVAL '3 days');
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    PERFORM set_config('app.writing_footprint_maintenance', 'off', true);
    RETURN v_deleted_count;
EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.writing_footprint_maintenance', 'off', true);
    RAISE;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_student_immediately(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.purge_expired_students(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_student_immediately(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.purge_expired_students(UUID) TO authenticated, service_role;

COMMIT;

BEGIN;

CREATE INDEX IF NOT EXISTS student_sessions_room_status_number_idx
    ON writing_helper.student_sessions(room_id, status, student_number);

ALTER TABLE writing_helper.activity_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE writing_helper.activity_events FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA writing_helper TO authenticated;
GRANT SELECT ON TABLE writing_helper.activity_events TO authenticated;
GRANT ALL ON TABLE writing_helper.activity_events TO service_role;

DROP POLICY IF EXISTS question_generator_result_events_teacher_select
    ON writing_helper.activity_events;

CREATE POLICY question_generator_result_events_teacher_select
ON writing_helper.activity_events
FOR SELECT
TO authenticated
USING (
    event_type = 'question_generator_submitted'
    AND public.auth_user_role() IN ('TEACHER', 'ADMIN')
    AND EXISTS (
        SELECT 1
        FROM writing_helper.rooms room
        WHERE room.id = activity_events.room_id
          AND room.teacher_id = auth.uid()
          AND room.activity_type = 'question_generator'
    )
);

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication
        WHERE pubname = 'supabase_realtime'
    ) THEN
        RAISE EXCEPTION 'supabase_realtime publication is required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'writing_helper'
          AND tablename = 'activity_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime
            ADD TABLE writing_helper.activity_events;
    END IF;
END;
$migration$;

COMMENT ON POLICY question_generator_result_events_teacher_select
    ON writing_helper.activity_events IS
    '실제 승인 역할을 가진 방 소유 교사만 질문 제출 완료 신호를 Realtime으로 읽는다. 질문 본문은 이벤트에 넣지 않는다.';

COMMIT;

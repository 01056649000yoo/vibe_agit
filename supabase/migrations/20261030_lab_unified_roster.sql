BEGIN;

-- 통합 /lab은 아지트의 public.classes / public.students를 학급·학생 원장으로 쓴다.
-- writing_helper 쪽 학급·명단은 과거 연구소 자료를 해석하기 위한 호환 데이터로만 남긴다.
ALTER TABLE writing_helper.classes
  ADD COLUMN IF NOT EXISTS agit_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

ALTER TABLE writing_helper.class_students
  ADD COLUMN IF NOT EXISTS agit_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL;

ALTER TABLE writing_helper.rooms
  ADD COLUMN IF NOT EXISTS agit_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL;

ALTER TABLE writing_helper.student_sessions
  ADD COLUMN IF NOT EXISTS agit_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS rooms_agit_class_id_created_at_idx
  ON writing_helper.rooms(agit_class_id, created_at DESC)
  WHERE agit_class_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS student_sessions_agit_student_id_created_at_idx
  ON writing_helper.student_sessions(agit_student_id, created_at DESC)
  WHERE agit_student_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS student_sessions_room_agit_student_uidx
  ON writing_helper.student_sessions(room_id, agit_student_id)
  WHERE agit_student_id IS NOT NULL;

-- 이미 확정된 과거 학급 매핑을 방에도 내려, 통합 학급 화면에서 과거 활동을 함께 찾는다.
UPDATE writing_helper.rooms room
SET agit_class_id = class.agit_class_id
FROM writing_helper.classes class
WHERE class.id = room.class_id
  AND class.agit_class_id IS NOT NULL
  AND room.agit_class_id IS NULL;

-- 이름·번호가 기존 연구소 명단과 모두 일치하고 agit_student_id가 확정된 세션만 연결한다.
-- 불일치·동명이인 자료는 추정하지 않고 NULL로 보존한다.
UPDATE writing_helper.student_sessions session
SET agit_student_id = roster.agit_student_id
FROM writing_helper.rooms room
JOIN writing_helper.class_students roster
  ON roster.class_id = room.class_id
WHERE session.room_id = room.id
  AND roster.student_number = session.student_number
  AND roster.student_name = session.student_name
  AND roster.agit_student_id IS NOT NULL
  AND session.agit_student_id IS NULL;

COMMENT ON COLUMN writing_helper.rooms.agit_class_id IS
  '통합 연구소 활동이 직접 참조하는 아지트 학급. class_id는 과거 연구소 학급 호환용.';
COMMENT ON COLUMN writing_helper.student_sessions.agit_student_id IS
  '통합 연구소 결과의 아지트 학생 식별자. 번호·이름은 생성 당시 표시 스냅샷.';

NOTIFY pgrst, 'reload schema';
COMMIT;

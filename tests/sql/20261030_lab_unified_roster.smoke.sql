-- 이 파일은 바깥 트랜잭션에서 실행되고 마지막에 전부 롤백된다.

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'writing_helper'
          AND table_name = 'rooms'
          AND column_name = 'agit_class_id'
          AND udt_name = 'uuid'
    ) THEN
        RAISE EXCEPTION '연구소 방의 아지트 학급 연결 컬럼이 없습니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'writing_helper'
          AND table_name = 'student_sessions'
          AND column_name = 'agit_student_id'
          AND udt_name = 'uuid'
    ) THEN
        RAISE EXCEPTION '연구소 세션의 아지트 학생 연결 컬럼이 없습니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'writing_helper'
          AND indexname = 'rooms_agit_class_id_created_at_idx'
    ) THEN
        RAISE EXCEPTION '아지트 학급별 연구소 방 조회 인덱스가 없습니다.';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname = 'writing_helper'
          AND indexname = 'student_sessions_room_agit_student_uidx'
    ) THEN
        RAISE EXCEPTION '방별 아지트 학생 세션 중복 방지 인덱스가 없습니다.';
    END IF;
END;
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM writing_helper.rooms room
        JOIN writing_helper.classes legacy_class ON legacy_class.id = room.class_id
        WHERE legacy_class.agit_class_id IS NOT NULL
          AND room.agit_class_id IS DISTINCT FROM legacy_class.agit_class_id
    ) THEN
        RAISE EXCEPTION '확정된 과거 학급 매핑이 연구소 방에 반영되지 않았습니다.';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM writing_helper.student_sessions session
        JOIN writing_helper.rooms room ON room.id = session.room_id
        JOIN public.students student ON student.id = session.agit_student_id
        WHERE room.agit_class_id IS NOT NULL
          AND student.class_id IS DISTINCT FROM room.agit_class_id
    ) THEN
        RAISE EXCEPTION '연구소 결과가 다른 아지트 학급 학생에게 연결되었습니다.';
    END IF;
END;
$$;

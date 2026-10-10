-- 연구소 친구 개요 모음 — 학생 개요 화면에서 열기 (2026-10-10, 선생님 결정).
--
-- 선생님이 친구 개요 모음을 켠 방이면 학생 개요 화면(쓰는 화면·완성 화면)에 샘링크 주소 띠가 보이고,
-- 누르면 모달로 친구 개요 모음이 열린다. 기간이 지나면 `기간이 끝났어요` 로 보이고, 선생님이 끄면 띠가 사라진다.
--   · 열린 판(open)·기간 지난 판(expired)만 돌려준다. 끈 판·샘링크에서 지운 판(closed)·없는 판은 NULL.
--   · 판 긴 번호(token)는 이 방 학생에게만 준다 — 연구소 서버가 `내 활동인지`(ownsIntegratedStudentSession)를 먼저 확인한다.
--     같은 번호가 샘링크 목적지에 이미 있어, 주소를 받은 학생이 아는 것보다 더 주지 않는다.
-- 연구소 서버(service_role)만 부른다.

BEGIN;

CREATE OR REPLACE FUNCTION writing_helper.get_student_outline_board_v1(p_room_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper
AS $$
DECLARE b writing_helper.outline_boards%ROWTYPE; v_state JSONB;
BEGIN
    SELECT * INTO b FROM writing_helper.outline_boards WHERE room_id = p_room_id AND revoked_at IS NULL;
    IF b.id IS NULL THEN
        RETURN NULL;
    END IF;
    v_state := writing_helper.outline_board_state(b);
    IF v_state->>'state' NOT IN ('open', 'expired') THEN
        RETURN NULL;
    END IF;
    RETURN v_state || jsonb_build_object('token', b.token);
END;
$$;

REVOKE ALL ON FUNCTION writing_helper.get_student_outline_board_v1(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_helper.get_student_outline_board_v1(UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

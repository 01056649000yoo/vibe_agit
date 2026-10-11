-- 친구 개요 모음 — 공유 끄기·1주 늘리기도 방을 먼저 잠근다 (2026-10-11, Codex 독립 검토 지적을 실제로 재현해 고침).
--
-- 재현: 선생님이 `새 주소 만들기` 와 `공유 끄기` 를 거의 동시에 누르면(두 세션) 끄기가 "성공"으로 돌아오는데
--   열린 판이 1개 남았다. 새 주소 만들기만 방 행을 잠가서(20261391), 끄기는 만들기가 커밋하기 전의 옛 판만 보고
--   지나갔다. 끄기·늘리기가 같은 방 행을 같은 순서(방 → 판)로 먼저 잠그게 한다 — 순서가 같아 교착은 없다.
-- 읽기 함수(get_teacher_outline_board_v1 등)는 잠그지 않는다.

BEGIN;

CREATE OR REPLACE FUNCTION writing_helper.close_outline_board_v1(p_room_id UUID, p_teacher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper, samlink
AS $$
DECLARE r writing_helper.rooms%ROWTYPE;
BEGIN
    r := writing_helper.outline_board_room_guard(p_room_id, p_teacher_id);
    -- 같은 방의 새 주소 만들기·늘리기와 겹치면 앞의 것이 끝난 뒤에 이어 간다(아래 문장은 잠근 뒤의 새 상태를 본다).
    PERFORM 1 FROM writing_helper.rooms WHERE id = r.id FOR UPDATE;
    UPDATE samlink.short_links SET is_active = FALSE
    WHERE slug IN (SELECT samlink_slug FROM writing_helper.outline_boards WHERE room_id = r.id AND revoked_at IS NULL);
    UPDATE writing_helper.outline_boards SET revoked_at = now()
    WHERE room_id = r.id AND revoked_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION writing_helper.extend_outline_board_v1(p_room_id UUID, p_teacher_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper, samlink
AS $$
DECLARE r writing_helper.rooms%ROWTYPE; b writing_helper.outline_boards%ROWTYPE;
BEGIN
    r := writing_helper.outline_board_room_guard(p_room_id, p_teacher_id);
    PERFORM 1 FROM writing_helper.rooms WHERE id = r.id FOR UPDATE;
    SELECT * INTO b FROM writing_helper.outline_boards WHERE room_id = r.id AND revoked_at IS NULL;
    IF b.id IS NULL THEN
        RAISE EXCEPTION '열린 친구 개요 모음이 없어요. 새 주소를 만들어 주세요.' USING ERRCODE = '22023';
    END IF;
    UPDATE samlink.short_links
    SET expires_at = LEAST(GREATEST(COALESCE(expires_at, now()), now()) + interval '7 days', now() + interval '90 days')
    WHERE slug = b.samlink_slug AND is_active;
    IF NOT FOUND THEN
        RAISE EXCEPTION '샘링크에서 지웠거나 멈춘 주소예요. 새 주소를 만들어 주세요.' USING ERRCODE = '22023';
    END IF;
    RETURN writing_helper.outline_board_state(b);
END;
$$;

REVOKE ALL ON FUNCTION writing_helper.close_outline_board_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION writing_helper.extend_outline_board_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_helper.close_outline_board_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION writing_helper.extend_outline_board_v1(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

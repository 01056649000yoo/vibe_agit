-- 연구소 친구 개요 모음 — `새 주소 만들기` 때 옛 샘링크 링크도 멈춘다 (2026-10-14)
--
-- 끄기(close_outline_board_v1, 20261394)는 판을 닫으며 샘링크 링크를 is_active = FALSE 로 멈추지만,
-- 열기(open_outline_board_v1)는 열린 판을 닫고 새로 만들 때 옛 링크를 그대로 두었다.
-- 옛 링크는 닫힌 판으로 가서 내용은 나가지 않았지만, 샘링크 `내 링크` 에 살아 있는 링크로 남았다.
-- 함수 본문은 20261391 과 같고, 옛 판을 닫기 직전에 링크를 멈추는 문장 하나만 더했다.

BEGIN;

CREATE OR REPLACE FUNCTION writing_helper.open_outline_board_v1(p_room_id UUID, p_teacher_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper, samlink, public, extensions
AS $$
DECLARE
    r writing_helper.rooms%ROWTYPE;
    b writing_helper.outline_boards%ROWTYPE;
    v_token TEXT := encode(extensions.gen_random_bytes(24), 'hex');
    v_slug TEXT;
    v_link_id BIGINT;
    attempt INTEGER;
BEGIN
    r := writing_helper.outline_board_room_guard(p_room_id, p_teacher_id);
    PERFORM 1 FROM writing_helper.rooms WHERE id = r.id FOR UPDATE;

    -- 옛 주소의 샘링크 링크도 함께 멈춘다(끄기와 같은 순서). 전에는 판만 닫고 링크는 살아 있어,
    -- 아지트 계정에 연결한 선생님의 샘링크 `내 링크` 에 옛 주소가 살아 있는 링크로 남았다.
    UPDATE samlink.short_links SET is_active = FALSE
    WHERE slug IN (SELECT samlink_slug FROM writing_helper.outline_boards WHERE room_id = r.id AND revoked_at IS NULL);
    UPDATE writing_helper.outline_boards SET revoked_at = now()
    WHERE room_id = r.id AND revoked_at IS NULL;

    FOR attempt IN 1..8 LOOP
        v_slug := public.class_agit_samlink_slug_v1(CASE WHEN attempt < 5 THEN 5 ELSE 6 END);
        CONTINUE WHEN v_slug !~ '[2-9]';
        BEGIN
            INSERT INTO samlink.short_links (slug, destination, expires_at, created_by, display_label)
            VALUES (
                v_slug,
                'https://xn--vz0ba242ncqcba79xhwx.site/lab/board/' || v_token,
                now() + interval '7 days',
                'agit-lab-outline',
                left('개요 모음 · ' || COALESCE(NULLIF(btrim(r.topic), ''), r.title, '개요짜기'), 60)
            )
            RETURNING id INTO v_link_id;
            EXIT;
        EXCEPTION WHEN unique_violation THEN
            v_link_id := NULL;
        END;
    END LOOP;

    IF v_link_id IS NULL THEN
        RAISE EXCEPTION '샘링크 주소를 만들지 못했어요. 잠시 뒤 다시 시도해 주세요.' USING ERRCODE = 'PT503';
    END IF;

    -- 샘링크를 아지트 계정과 연결한 선생님은 `내 링크` 에서 기간을 늘리거나 지울 수 있다.
    INSERT INTO samlink.short_link_account_access (link_id, user_id, is_owner)
    SELECT v_link_id, p_teacher_id, TRUE
    WHERE EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_teacher_id)
    ON CONFLICT DO NOTHING;

    INSERT INTO writing_helper.outline_boards (room_id, teacher_id, token, samlink_slug)
    VALUES (r.id, p_teacher_id, v_token, v_slug)
    RETURNING * INTO b;

    RETURN writing_helper.outline_board_state(b);
END;
$$;

REVOKE ALL ON FUNCTION writing_helper.open_outline_board_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_helper.open_outline_board_v1(UUID, UUID) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

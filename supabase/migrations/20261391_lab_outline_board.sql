-- 연구소 개요짜기 — 친구 개요 모음(공유판) (2026-10-10, 선생님 결정).
--
-- 선생님이 공유를 켜면, 그 방에서 학생이 **제출한** 개요를 번호·실명과 함께 보여 주는 공개 페이지
-- (`/lab/board/<긴 번호>`)와 샘링크 짧은 주소(5글자, 1주)를 만든다. 친구들과 돌려 보며 토의하려고.
--   · 로그인 없이 주소만 알면 볼 수 있다(선생님 결정). 쓰는 중인 개요·학생 접속 코드는 싣지 않는다.
--   · 만료의 원본은 샘링크 링크 하나다 — 샘링크에서 늘리거나 지우면 페이지도 따라간다(페이지가 열릴 때마다 확인).
--   · 링크는 선생님 아지트 계정 앞으로 등록해, 샘링크를 연결한 선생님은 `내 링크`에서도 관리한다.
--   · 5글자(32^5 ≈ 3,300만)는 샘링크 열기의 찍어 보기 막기(~/URL 20261010120000)와 함께 쓴다.
--     숫자를 한 글자 이상 넣어 샘링크 예약어(admin 등)와 겹치지 않는다.
--   · `새 주소 만들기` 는 옛 판을 닫고 새 판을 만든다(옛 주소는 곧바로 닫힘).
-- 연구소 서버(service_role)만 부른다. 선생님 확인은 p_teacher_id 와 방 주인 비교(연구소가 로그인한 선생님 id 를 넘김).

BEGIN;

CREATE TABLE IF NOT EXISTS writing_helper.outline_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID NOT NULL REFERENCES writing_helper.rooms(id) ON DELETE CASCADE,
    teacher_id UUID NOT NULL,
    token TEXT NOT NULL UNIQUE CONSTRAINT outline_boards_token_format CHECK (token ~ '^[a-f0-9]{48}$'),
    samlink_slug TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    revoked_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS outline_boards_one_open_per_room
    ON writing_helper.outline_boards (room_id) WHERE revoked_at IS NULL;

ALTER TABLE writing_helper.outline_boards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE writing_helper.outline_boards FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE writing_helper.outline_boards TO service_role;

-- 방 주인이고 개요짜기 방인지(옛 방은 activity_type 이 비어 있으면 개요짜기다).
CREATE OR REPLACE FUNCTION writing_helper.outline_board_room_guard(p_room_id UUID, p_teacher_id UUID)
RETURNS writing_helper.rooms
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper
AS $$
DECLARE r writing_helper.rooms%ROWTYPE;
BEGIN
    SELECT * INTO r FROM writing_helper.rooms WHERE id = p_room_id;
    IF r.id IS NULL OR p_teacher_id IS NULL OR r.teacher_id IS DISTINCT FROM p_teacher_id THEN
        RAISE EXCEPTION '내 활동방에서만 할 수 있어요.' USING ERRCODE = '42501';
    END IF;
    IF COALESCE(r.activity_type, 'outline_builder') <> 'outline_builder' THEN
        RAISE EXCEPTION '개요짜기 활동에서만 친구 개요 모음을 만들 수 있어요.' USING ERRCODE = '22023';
    END IF;
    RETURN r;
END;
$$;

-- 판 하나의 상태: 샘링크 링크가 원본이다.
CREATE OR REPLACE FUNCTION writing_helper.outline_board_state(b writing_helper.outline_boards)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper, samlink
AS $$
DECLARE l samlink.short_links%ROWTYPE; v_state TEXT;
BEGIN
    IF b.id IS NULL THEN
        RETURN jsonb_build_object('state', 'missing');
    END IF;
    SELECT * INTO l FROM samlink.short_links WHERE slug = b.samlink_slug;
    v_state := CASE
        WHEN b.revoked_at IS NOT NULL OR l.id IS NULL OR NOT l.is_active THEN 'closed'
        WHEN l.expires_at IS NOT NULL AND l.expires_at <= now() THEN 'expired'
        ELSE 'open'
    END;
    RETURN jsonb_build_object(
        'state', v_state,
        'slug', b.samlink_slug,
        'expires_at', l.expires_at,
        'created_at', b.created_at
    );
END;
$$;

-- 새 판 만들기(처음 켤 때·새 주소 만들기 모두). 열린 판이 있으면 닫고 새로 만든다.
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

-- 공유 끄기: 판을 닫고 샘링크 링크도 멈춘다(샘링크 목록에는 멈춘 링크로 남는다).
CREATE OR REPLACE FUNCTION writing_helper.close_outline_board_v1(p_room_id UUID, p_teacher_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper, samlink
AS $$
DECLARE r writing_helper.rooms%ROWTYPE;
BEGIN
    r := writing_helper.outline_board_room_guard(p_room_id, p_teacher_id);
    UPDATE samlink.short_links SET is_active = FALSE
    WHERE slug IN (SELECT samlink_slug FROM writing_helper.outline_boards WHERE room_id = r.id AND revoked_at IS NULL);
    UPDATE writing_helper.outline_boards SET revoked_at = now()
    WHERE room_id = r.id AND revoked_at IS NULL;
END;
$$;

-- 1주 늘리기: 같은 주소를 이어 쓴다. 남은 기간 뒤에 7일을 더하고, 오늘부터 90일을 넘지 않는다.
CREATE OR REPLACE FUNCTION writing_helper.extend_outline_board_v1(p_room_id UUID, p_teacher_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper, samlink
AS $$
DECLARE r writing_helper.rooms%ROWTYPE; b writing_helper.outline_boards%ROWTYPE;
BEGIN
    r := writing_helper.outline_board_room_guard(p_room_id, p_teacher_id);
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

-- 선생님 방 화면: 지금 판(없으면 null).
CREATE OR REPLACE FUNCTION writing_helper.get_teacher_outline_board_v1(p_room_id UUID, p_teacher_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper
AS $$
DECLARE r writing_helper.rooms%ROWTYPE; b writing_helper.outline_boards%ROWTYPE;
BEGIN
    r := writing_helper.outline_board_room_guard(p_room_id, p_teacher_id);
    SELECT * INTO b FROM writing_helper.outline_boards WHERE room_id = r.id AND revoked_at IS NULL;
    IF b.id IS NULL THEN
        RETURN NULL;
    END IF;
    RETURN writing_helper.outline_board_state(b);
END;
$$;

-- 공개 페이지: 긴 번호로 판을 찾고, 열려 있을 때만 제출한 개요(번호·이름·답)를 싣는다.
CREATE OR REPLACE FUNCTION writing_helper.get_outline_board_v1(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, writing_helper
AS $$
DECLARE b writing_helper.outline_boards%ROWTYPE; r writing_helper.rooms%ROWTYPE; v_state JSONB;
BEGIN
    IF p_token IS NULL OR p_token !~ '^[a-f0-9]{48}$' THEN
        RETURN jsonb_build_object('state', 'missing');
    END IF;
    SELECT * INTO b FROM writing_helper.outline_boards WHERE token = p_token;
    v_state := writing_helper.outline_board_state(b);
    IF v_state->>'state' <> 'open' THEN
        RETURN jsonb_build_object('state', v_state->>'state');
    END IF;
    SELECT * INTO r FROM writing_helper.rooms WHERE id = b.room_id;
    RETURN jsonb_build_object(
        'state', 'open',
        'expires_at', v_state->'expires_at',
        'topic', COALESCE(NULLIF(btrim(r.topic), ''), r.title),
        'students', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'key', substr(md5(s.id::TEXT), 1, 12),
                'number', s.student_number,
                'name', s.student_name,
                'answers', COALESCE(s.answers, '[]'::JSONB),
                'updated_at', s.updated_at
            ) ORDER BY s.student_number, s.student_name)
            FROM writing_helper.student_sessions s
            WHERE s.room_id = b.room_id AND s.status = 'done'
        ), '[]'::JSONB)
    );
END;
$$;

-- 방을 지우면(판도 함께 지워지면) 샘링크 링크도 지운다 — 갈 곳 없는 주소를 남기지 않는다.
CREATE OR REPLACE FUNCTION writing_helper.outline_board_drop_samlink()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, samlink
AS $$
BEGIN
    IF OLD.samlink_slug IS NOT NULL THEN
        DELETE FROM samlink.short_links WHERE slug = OLD.samlink_slug AND created_by = 'agit-lab-outline';
    END IF;
    RETURN OLD;
END;
$$;
DROP TRIGGER IF EXISTS outline_board_drop_samlink ON writing_helper.outline_boards;
CREATE TRIGGER outline_board_drop_samlink AFTER DELETE ON writing_helper.outline_boards
    FOR EACH ROW EXECUTE FUNCTION writing_helper.outline_board_drop_samlink();

REVOKE ALL ON FUNCTION writing_helper.outline_board_room_guard(UUID, UUID) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION writing_helper.outline_board_state(writing_helper.outline_boards) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION writing_helper.outline_board_drop_samlink() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION writing_helper.open_outline_board_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION writing_helper.close_outline_board_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION writing_helper.extend_outline_board_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION writing_helper.get_teacher_outline_board_v1(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION writing_helper.get_outline_board_v1(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION writing_helper.open_outline_board_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION writing_helper.close_outline_board_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION writing_helper.extend_outline_board_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION writing_helper.get_teacher_outline_board_v1(UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION writing_helper.get_outline_board_v1(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;

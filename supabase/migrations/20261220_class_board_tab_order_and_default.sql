BEGIN;

ALTER TABLE public.class_boards
    ADD COLUMN IF NOT EXISTS display_order INTEGER,
    ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;

WITH ranked AS (
    SELECT board.id,
           ROW_NUMBER() OVER (
               PARTITION BY board.class_id
               ORDER BY board.is_active DESC, board.updated_at DESC, board.id DESC
           ) - 1 AS display_order
    FROM public.class_boards board
)
UPDATE public.class_boards board
SET display_order = ranked.display_order
FROM ranked
WHERE ranked.id = board.id
  AND board.display_order IS NULL;

ALTER TABLE public.class_boards
    ALTER COLUMN display_order SET DEFAULT 0,
    ALTER COLUMN display_order SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'class_boards_display_order_range'
          AND conrelid = 'public.class_boards'::REGCLASS
    ) THEN
        ALTER TABLE public.class_boards
            ADD CONSTRAINT class_boards_display_order_range
            CHECK (display_order BETWEEN 0 AND 1000);
    END IF;
END;
$$;

WITH first_boards AS (
    SELECT DISTINCT ON (board.class_id) board.id
    FROM public.class_boards board
    WHERE board.archived_at IS NULL
    ORDER BY board.class_id, board.is_active DESC, board.display_order, board.id
)
UPDATE public.class_boards board
SET is_default = TRUE
FROM first_boards first
WHERE board.id = first.id
  AND NOT EXISTS (
      SELECT 1 FROM public.class_boards existing
      WHERE existing.class_id = board.class_id
        AND existing.archived_at IS NULL
        AND existing.is_default IS TRUE
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_class_boards_one_default_per_class
    ON public.class_boards (class_id)
    WHERE is_default IS TRUE AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_class_boards_class_display_order
    ON public.class_boards (class_id, display_order, id)
    WHERE archived_at IS NULL;

CREATE OR REPLACE FUNCTION public.get_teacher_class_board_workspace_v1(
    p_class_id UUID,
    p_limit INTEGER DEFAULT 20
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '담당 학급 스크린만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'version', 2,
        'classId', p_class_id,
        'boards', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'id', board.id,
                'title', board.title,
                'layout', board.layout,
                'widgets', board.widgets,
                'isActive', board.is_active,
                'isDefault', board.is_default,
                'displayOrder', board.display_order,
                'revision', board.revision,
                'createdAt', board.created_at,
                'updatedAt', board.updated_at
            ) ORDER BY board.display_order, board.id)
            FROM (
                SELECT item.*
                FROM public.class_boards item
                WHERE item.class_id = p_class_id
                  AND item.archived_at IS NULL
                ORDER BY item.display_order, item.id
                LIMIT v_limit
            ) board
        ), '[]'::JSONB)
    );
END;
$$;

DROP FUNCTION IF EXISTS public.save_teacher_class_board_v1(UUID, UUID, TEXT, JSONB, JSONB, INTEGER);
CREATE FUNCTION public.save_teacher_class_board_v1(
    p_class_id UUID,
    p_board_id UUID,
    p_title TEXT,
    p_layout JSONB,
    p_widgets JSONB,
    p_expected_revision INTEGER DEFAULT NULL,
    p_tab_position INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_board_id UUID := COALESCE(p_board_id, gen_random_uuid());
    v_board public.class_boards%ROWTYPE;
    v_tab_position INTEGER;
    v_visible_count INTEGER;
    v_make_default BOOLEAN;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '담당 학급 스크린만 저장할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF CHAR_LENGTH(BTRIM(COALESCE(p_title, ''))) NOT BETWEEN 1 AND 80 THEN
        RAISE EXCEPTION '스크린 제목은 1~80자로 입력해 주세요.' USING ERRCODE = '22023';
    END IF;
    PERFORM public.validate_class_board_payload_v1(p_class_id, p_layout, p_widgets);

    PERFORM 1 FROM public.classes class WHERE class.id = p_class_id FOR UPDATE;
    PERFORM 1
    FROM public.class_boards board
    WHERE board.class_id = p_class_id
      AND board.archived_at IS NULL
    FOR UPDATE;

    UPDATE public.class_boards
    SET is_active = FALSE
    WHERE class_id = p_class_id AND is_active IS TRUE AND archived_at IS NULL AND id <> v_board_id;

    IF p_board_id IS NULL THEN
        SELECT COUNT(*) INTO v_visible_count
        FROM public.class_boards board
        WHERE board.class_id = p_class_id AND board.archived_at IS NULL;
        IF v_visible_count >= 20 THEN
            RAISE EXCEPTION '스크린 탭은 학급당 최대 20개까지 만들 수 있습니다.' USING ERRCODE = '22023';
        END IF;
        v_tab_position := LEAST(GREATEST(COALESCE(p_tab_position, 0), 0), v_visible_count);
        UPDATE public.class_boards board
        SET display_order = board.display_order + 1
        WHERE board.class_id = p_class_id
          AND board.archived_at IS NULL
          AND board.display_order >= v_tab_position;
        v_make_default := NOT EXISTS (
            SELECT 1 FROM public.class_boards board
            WHERE board.class_id = p_class_id
              AND board.archived_at IS NULL
              AND board.is_default IS TRUE
        );
        INSERT INTO public.class_boards (
            id, class_id, title, layout, widgets, is_active, is_default,
            display_order, revision, created_by
        ) VALUES (
            v_board_id, p_class_id, BTRIM(p_title), p_layout, p_widgets, TRUE,
            v_make_default, v_tab_position, 1, auth.uid()
        ) RETURNING * INTO v_board;
    ELSE
        UPDATE public.class_boards board
        SET title = BTRIM(p_title),
            layout = p_layout,
            widgets = p_widgets,
            is_active = TRUE,
            revision = board.revision + 1,
            updated_at = NOW()
        WHERE board.id = v_board_id
          AND board.class_id = p_class_id
          AND board.archived_at IS NULL
          AND board.revision = p_expected_revision
        RETURNING * INTO v_board;
        IF NOT FOUND THEN
            RAISE EXCEPTION '다른 화면에서 먼저 저장했습니다. 새로고침한 뒤 다시 시도해 주세요.' USING ERRCODE = '40001';
        END IF;
    END IF;

    RETURN JSONB_BUILD_OBJECT(
        'id', v_board.id, 'title', v_board.title, 'layout', v_board.layout,
        'widgets', v_board.widgets, 'isActive', v_board.is_active,
        'isDefault', v_board.is_default, 'displayOrder', v_board.display_order,
        'revision', v_board.revision, 'createdAt', v_board.created_at, 'updatedAt', v_board.updated_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.duplicate_teacher_class_board_v1(p_board_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_source public.class_boards%ROWTYPE;
    v_copy public.class_boards%ROWTYPE;
    v_visible_count INTEGER;
BEGIN
    SELECT board.* INTO v_source
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    WHERE board.id = p_board_id
      AND board.archived_at IS NULL
      AND class.deleted_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE OF board;
    IF NOT FOUND OR auth.uid() IS NULL THEN
        RAISE EXCEPTION '복제할 수 있는 스크린이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.classes class WHERE class.id = v_source.class_id FOR UPDATE;
    SELECT COUNT(*) INTO v_visible_count
    FROM public.class_boards board
    WHERE board.class_id = v_source.class_id AND board.archived_at IS NULL;
    IF v_visible_count >= 20 THEN
        RAISE EXCEPTION '스크린 탭은 학급당 최대 20개까지 만들 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    UPDATE public.class_boards SET is_active = FALSE
    WHERE class_id = v_source.class_id AND is_active IS TRUE AND archived_at IS NULL;
    UPDATE public.class_boards board
    SET display_order = board.display_order + 1
    WHERE board.class_id = v_source.class_id AND board.archived_at IS NULL;
    INSERT INTO public.class_boards (
        class_id, title, layout, widgets, is_active, is_default, display_order, created_by
    ) VALUES (
        v_source.class_id, LEFT(v_source.title, 73) || ' 복사본', v_source.layout,
        v_source.widgets, TRUE, FALSE, 0, auth.uid()
    ) RETURNING * INTO v_copy;

    RETURN JSONB_BUILD_OBJECT(
        'id', v_copy.id, 'title', v_copy.title, 'layout', v_copy.layout,
        'widgets', v_copy.widgets, 'isActive', TRUE, 'isDefault', FALSE,
        'displayOrder', v_copy.display_order, 'revision', v_copy.revision,
        'createdAt', v_copy.created_at, 'updatedAt', v_copy.updated_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_teacher_class_board_v1(p_board_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_class_id UUID;
    v_was_active BOOLEAN;
    v_was_default BOOLEAN;
    v_next_id UUID;
BEGIN
    SELECT board.class_id, board.is_active, board.is_default
    INTO v_class_id, v_was_active, v_was_default
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    WHERE board.id = p_board_id
      AND class.deleted_at IS NULL
      AND board.archived_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE OF board;
    IF NOT FOUND OR auth.uid() IS NULL THEN
        RAISE EXCEPTION '보관할 수 있는 스크린이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.classes class WHERE class.id = v_class_id FOR UPDATE;
    UPDATE public.class_boards board
    SET archived_at = NOW(), is_active = FALSE, is_default = FALSE,
        updated_at = NOW(), revision = board.revision + 1
    WHERE board.id = p_board_id
      AND board.class_id = v_class_id
      AND board.archived_at IS NULL;

    SELECT board.id INTO v_next_id
    FROM public.class_boards board
    WHERE board.class_id = v_class_id AND board.archived_at IS NULL
    ORDER BY board.display_order, board.id
    LIMIT 1;
    IF v_next_id IS NOT NULL AND v_was_active THEN
        UPDATE public.class_boards SET is_active = TRUE WHERE id = v_next_id;
    END IF;
    IF v_next_id IS NOT NULL AND v_was_default THEN
        UPDATE public.class_boards SET is_default = TRUE WHERE id = v_next_id;
    END IF;
    RETURN JSONB_BUILD_OBJECT('success', TRUE, 'activeBoardId', CASE WHEN v_was_active THEN v_next_id ELSE NULL END);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_teacher_class_board_v1(p_board_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_board public.class_boards%ROWTYPE;
    v_make_default BOOLEAN;
    v_visible_count INTEGER;
BEGIN
    SELECT board.* INTO v_board
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    WHERE board.id = p_board_id
      AND board.archived_at IS NOT NULL
      AND class.deleted_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE OF board;
    IF NOT FOUND OR auth.uid() IS NULL THEN
        RAISE EXCEPTION '복구할 수 있는 숨긴 스크린이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    PERFORM 1 FROM public.classes class WHERE class.id = v_board.class_id FOR UPDATE;
    SELECT COUNT(*) INTO v_visible_count
    FROM public.class_boards board
    WHERE board.class_id = v_board.class_id AND board.archived_at IS NULL;
    IF v_visible_count >= 20 THEN
        RAISE EXCEPTION '스크린 탭은 학급당 최대 20개까지 복구할 수 있습니다.' USING ERRCODE = '22023';
    END IF;
    PERFORM 1 FROM public.class_boards board
    WHERE board.class_id = v_board.class_id AND board.archived_at IS NULL
    FOR UPDATE;
    UPDATE public.class_boards SET is_active = FALSE
    WHERE class_id = v_board.class_id AND is_active IS TRUE AND archived_at IS NULL;
    UPDATE public.class_boards board
    SET display_order = board.display_order + 1
    WHERE board.class_id = v_board.class_id AND board.archived_at IS NULL;
    v_make_default := NOT EXISTS (
        SELECT 1 FROM public.class_boards board
        WHERE board.class_id = v_board.class_id
          AND board.archived_at IS NULL
          AND board.is_default IS TRUE
    );
    UPDATE public.class_boards board
    SET archived_at = NULL, is_active = TRUE, is_default = v_make_default,
        display_order = 0, revision = board.revision + 1, updated_at = NOW()
    WHERE board.id = v_board.id
    RETURNING * INTO v_board;

    RETURN JSONB_BUILD_OBJECT(
        'id', v_board.id, 'title', v_board.title, 'layout', v_board.layout,
        'widgets', v_board.widgets, 'isActive', TRUE, 'isDefault', v_board.is_default,
        'displayOrder', v_board.display_order, 'revision', v_board.revision,
        'createdAt', v_board.created_at, 'updatedAt', v_board.updated_at
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reorder_teacher_class_boards_v1(
    p_class_id UUID,
    p_board_ids UUID[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_visible_count INTEGER;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '담당 학급 스크린 순서만 바꿀 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.classes class WHERE class.id = p_class_id FOR UPDATE;
    SELECT COUNT(*) INTO v_visible_count
    FROM public.class_boards board
    WHERE board.class_id = p_class_id AND board.archived_at IS NULL;
    IF COALESCE(CARDINALITY(p_board_ids), 0) <> v_visible_count
       OR (SELECT COUNT(DISTINCT id) FROM UNNEST(COALESCE(p_board_ids, ARRAY[]::UUID[])) id) <> v_visible_count
       OR EXISTS (
           SELECT 1 FROM UNNEST(COALESCE(p_board_ids, ARRAY[]::UUID[])) id
           WHERE NOT EXISTS (
               SELECT 1 FROM public.class_boards board
               WHERE board.id = id AND board.class_id = p_class_id AND board.archived_at IS NULL
           )
       ) THEN
        RAISE EXCEPTION '현재 보이는 스크린 탭 전체를 한 번씩 보내 주세요.' USING ERRCODE = '22023';
    END IF;

    PERFORM 1 FROM public.class_boards board
    WHERE board.class_id = p_class_id AND board.archived_at IS NULL
    FOR UPDATE;
    UPDATE public.class_boards board
    SET display_order = ordered.ordinality - 1
    FROM UNNEST(p_board_ids) WITH ORDINALITY ordered(id, ordinality)
    WHERE board.id = ordered.id AND board.class_id = p_class_id AND board.archived_at IS NULL;

    RETURN JSONB_BUILD_OBJECT('success', TRUE, 'boardIds', TO_JSONB(p_board_ids));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_teacher_default_class_board_v1(p_board_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_board public.class_boards%ROWTYPE;
BEGIN
    SELECT board.* INTO v_board
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    WHERE board.id = p_board_id
      AND board.archived_at IS NULL
      AND class.deleted_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    FOR UPDATE OF board;
    IF NOT FOUND OR auth.uid() IS NULL THEN
        RAISE EXCEPTION '기본으로 지정할 수 있는 스크린이 아닙니다.' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM public.classes class WHERE class.id = v_board.class_id FOR UPDATE;
    UPDATE public.class_boards
    SET is_default = FALSE
    WHERE class_id = v_board.class_id AND archived_at IS NULL AND is_default IS TRUE;
    UPDATE public.class_boards SET is_default = TRUE WHERE id = v_board.id;
    RETURN JSONB_BUILD_OBJECT('boardId', v_board.id, 'title', v_board.title);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_default_class_board_v1(p_class_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_board public.class_boards%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '담당 학급의 기본 스크린만 열 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    SELECT board.* INTO v_board
    FROM public.class_boards board
    WHERE board.class_id = p_class_id AND board.archived_at IS NULL
    ORDER BY board.is_default DESC, board.display_order, board.id
    LIMIT 1;
    RETURN JSONB_BUILD_OBJECT(
        'boardId', v_board.id,
        'title', v_board.title
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_board_workspace_v1(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_teacher_class_board_v1(UUID, UUID, TEXT, JSONB, JSONB, INTEGER, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.duplicate_teacher_class_board_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_teacher_class_board_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_teacher_class_board_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reorder_teacher_class_boards_v1(UUID, UUID[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_teacher_default_class_board_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teacher_default_class_board_v1(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_workspace_v1(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_teacher_class_board_v1(UUID, UUID, TEXT, JSONB, JSONB, INTEGER, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.duplicate_teacher_class_board_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_teacher_class_board_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_teacher_class_board_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reorder_teacher_class_boards_v1(UUID, UUID[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_teacher_default_class_board_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_default_class_board_v1(UUID) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

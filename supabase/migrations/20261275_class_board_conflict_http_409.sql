-- 우리 반 스크린의 업무용 revision 충돌은 PostgREST가 재시도하는 40001을 쓰지 않는다.
-- 2026-09-09 실제 stale 저장 한 건이 초당 약 2,300회 재시도되어 DB CPU 73%를 쓴 사고를 고친다.

BEGIN;

CREATE OR REPLACE FUNCTION public.save_teacher_class_board_v1(
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
            RAISE EXCEPTION '다른 화면에서 먼저 저장했습니다. 새로고침한 뒤 다시 시도해 주세요.' USING ERRCODE = 'PT409';
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

REVOKE ALL ON FUNCTION public.save_teacher_class_board_v1(UUID, UUID, TEXT, JSONB, JSONB, INTEGER, INTEGER)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_teacher_class_board_v1(UUID, UUID, TEXT, JSONB, JSONB, INTEGER, INTEGER)
TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

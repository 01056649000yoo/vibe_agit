BEGIN;

-- 우리 반 스크린은 교사가 만든 배치 정보만 저장한다. 실제 제출 현황은 저장하지 않고
-- 발표 화면이 열려 있는 동안 권한 검증 RPC로 작은 집계만 다시 읽는다.
CREATE TABLE IF NOT EXISTS public.class_boards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    layout JSONB NOT NULL DEFAULT '{"version":1,"preset":"split-8-4"}'::JSONB,
    widgets JSONB NOT NULL DEFAULT '[]'::JSONB,
    is_active BOOLEAN NOT NULL DEFAULT FALSE,
    revision INTEGER NOT NULL DEFAULT 1 CHECK (revision BETWEEN 1 AND 2147483647),
    created_by UUID NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived_at TIMESTAMPTZ,
    CONSTRAINT class_boards_title_length CHECK (CHAR_LENGTH(BTRIM(title)) BETWEEN 1 AND 80),
    CONSTRAINT class_boards_layout_shape CHECK (
        JSONB_TYPEOF(layout) = 'object'
        AND OCTET_LENGTH(layout::TEXT) <= 4096
    ),
    CONSTRAINT class_boards_widgets_shape CHECK (
        JSONB_TYPEOF(widgets) = 'array'
        AND JSONB_ARRAY_LENGTH(widgets) <= 24
        AND OCTET_LENGTH(widgets::TEXT) <= 131072
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_class_boards_one_active_per_class
    ON public.class_boards (class_id)
    WHERE is_active IS TRUE AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_class_boards_class_updated
    ON public.class_boards (class_id, updated_at DESC, id DESC)
    WHERE archived_at IS NULL;

ALTER TABLE public.class_boards ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.class_boards FROM PUBLIC, anon, authenticated, service_role;

-- 화면에 저장할 수 있는 위젯 계약을 서버에서도 확인한다. 셸은 위젯 ID별 UI를 모르지만,
-- 저장 경계는 허용된 ID·크기·사진 경로·미션 소속을 다시 검사한다.
CREATE OR REPLACE FUNCTION public.validate_class_board_payload_v1(
    p_class_id UUID,
    p_layout JSONB,
    p_widgets JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_widget JSONB;
    v_config JSONB;
    v_widget_id TEXT;
    v_instance_count INTEGER;
    v_unique_instance_count INTEGER;
    v_status_count INTEGER := 0;
    v_image_path TEXT;
    v_mission_id UUID;
BEGIN
    IF JSONB_TYPEOF(COALESCE(p_layout, '{}'::JSONB)) <> 'object'
       OR COALESCE((p_layout ->> 'version')::INTEGER, 0) <> 1
       OR p_layout ->> 'preset' IS DISTINCT FROM 'split-8-4'
       OR OCTET_LENGTH(COALESCE(p_layout, '{}'::JSONB)::TEXT) > 4096 THEN
        RAISE EXCEPTION '스크린 배치 형식이 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    IF JSONB_TYPEOF(COALESCE(p_widgets, '[]'::JSONB)) <> 'array'
       OR JSONB_ARRAY_LENGTH(COALESCE(p_widgets, '[]'::JSONB)) > 24
       OR OCTET_LENGTH(COALESCE(p_widgets, '[]'::JSONB)::TEXT) > 131072 THEN
        RAISE EXCEPTION '스크린 위젯 형식이나 크기가 올바르지 않습니다.' USING ERRCODE = '22023';
    END IF;

    SELECT COUNT(*), COUNT(DISTINCT item ->> 'instanceId')
    INTO v_instance_count, v_unique_instance_count
    FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB)) item;
    IF v_instance_count <> v_unique_instance_count THEN
        RAISE EXCEPTION '스크린 위젯 식별자가 겹칩니다.' USING ERRCODE = '22023';
    END IF;

    FOR v_widget IN SELECT value FROM JSONB_ARRAY_ELEMENTS(COALESCE(p_widgets, '[]'::JSONB))
    LOOP
        v_widget_id := COALESCE(v_widget ->> 'widgetId', '');
        v_config := COALESCE(v_widget -> 'config', '{}'::JSONB);
        IF JSONB_TYPEOF(v_widget) <> 'object'
           OR COALESCE(v_widget ->> 'instanceId', '') !~ '^[A-Za-z0-9_-]{1,80}$'
           OR v_widget_id NOT IN ('text', 'image', 'writing-status')
           OR COALESCE((v_widget ->> 'version')::INTEGER, 0) <> 1
           OR COALESCE(v_widget ->> 'zone', '') NOT IN ('content', 'sidebar')
           OR COALESCE(v_widget ->> 'size', '') NOT IN ('small', 'medium', 'large')
           OR COALESCE((v_widget ->> 'order')::INTEGER, 0) NOT BETWEEN 1 AND 1000
           OR JSONB_TYPEOF(v_config) <> 'object' THEN
            RAISE EXCEPTION '지원하지 않는 스크린 위젯 설정입니다.' USING ERRCODE = '22023';
        END IF;

        IF v_widget_id = 'text' THEN
            IF CHAR_LENGTH(COALESCE(v_config ->> 'heading', '')) > 120
               OR CHAR_LENGTH(COALESCE(v_config ->> 'body', '')) > 2000
               OR COALESCE(v_config ->> 'tone', 'paper') NOT IN ('paper', 'sky', 'sun', 'mint') THEN
                RAISE EXCEPTION '텍스트 위젯 내용이 허용 범위를 벗어났습니다.' USING ERRCODE = '22023';
            END IF;
        ELSIF v_widget_id = 'image' THEN
            v_image_path := NULLIF(v_config ->> 'path', '');
            IF CHAR_LENGTH(COALESCE(v_config ->> 'caption', '')) > 240
               OR v_config ? 'url'
               OR v_config ? 'signedUrl'
               OR (v_image_path IS NOT NULL AND (
                    v_image_path !~ ('^' || p_class_id::TEXT || '/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}[.](webp|jpg)$')
                    OR NOT (
                        (v_image_path ~ '[.]webp$' AND v_config ->> 'mimeType' = 'image/webp')
                        OR (v_image_path ~ '[.]jpg$' AND v_config ->> 'mimeType' = 'image/jpeg')
                    )
                    OR COALESCE((v_config ->> 'bytes')::INTEGER, 0) NOT BETWEEN 1 AND 1048576
                    OR COALESCE((v_config ->> 'width')::INTEGER, 0) NOT BETWEEN 1 AND 1920
                    OR COALESCE((v_config ->> 'height')::INTEGER, 0) NOT BETWEEN 1 AND 1920
               )) THEN
                RAISE EXCEPTION '이미지 위젯 정보가 올바르지 않습니다.' USING ERRCODE = '22023';
            END IF;
        ELSE
            v_status_count := v_status_count + 1;
            IF v_status_count > 1 OR v_widget ->> 'zone' IS DISTINCT FROM 'sidebar' THEN
                RAISE EXCEPTION '글쓰기 현황 위젯은 오른쪽에 하나만 둘 수 있습니다.' USING ERRCODE = '22023';
            END IF;
            IF NULLIF(v_config ->> 'missionId', '') IS NOT NULL THEN
                BEGIN
                    v_mission_id := (v_config ->> 'missionId')::UUID;
                EXCEPTION WHEN invalid_text_representation THEN
                    RAISE EXCEPTION '글쓰기 현황의 과제 식별자가 올바르지 않습니다.' USING ERRCODE = '22023';
                END;
                IF NOT EXISTS (
                    SELECT 1
                    FROM (
                        SELECT mission.id
                        FROM public.writing_missions mission
                        WHERE mission.class_id = p_class_id
                          AND mission.is_archived IS FALSE
                          AND mission.mission_type IS DISTINCT FROM 'meeting'
                        ORDER BY mission.created_at DESC, mission.id DESC
                        LIMIT 20
                    ) available_mission
                    WHERE available_mission.id = v_mission_id
                ) THEN
                    RAISE EXCEPTION '선택한 활성 글 과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
                END IF;
            END IF;
        END IF;
    END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_class_board_payload_v1(UUID, JSONB, JSONB)
FROM PUBLIC, anon, authenticated, service_role;

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
        'version', 1,
        'classId', p_class_id,
        'boards', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT(
                'id', board.id,
                'title', board.title,
                'layout', board.layout,
                'widgets', board.widgets,
                'isActive', board.is_active,
                'revision', board.revision,
                'createdAt', board.created_at,
                'updatedAt', board.updated_at
            ) ORDER BY board.is_active DESC, board.updated_at DESC, board.id DESC)
            FROM (
                SELECT item.*
                FROM public.class_boards item
                WHERE item.class_id = p_class_id
                  AND item.archived_at IS NULL
                ORDER BY item.is_active DESC, item.updated_at DESC, item.id DESC
                LIMIT v_limit
            ) board
        ), '[]'::JSONB)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_teacher_class_board_v1(
    p_class_id UUID,
    p_board_id UUID,
    p_title TEXT,
    p_layout JSONB,
    p_widgets JSONB,
    p_expected_revision INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_board_id UUID := COALESCE(p_board_id, gen_random_uuid());
    v_board public.class_boards%ROWTYPE;
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

    -- 저장한 보드가 곧 새 탭에서 열 기본 보드가 된다.
    UPDATE public.class_boards
    SET is_active = FALSE
    WHERE class_id = p_class_id AND is_active IS TRUE AND archived_at IS NULL AND id <> v_board_id;

    IF p_board_id IS NULL THEN
        INSERT INTO public.class_boards (
            id, class_id, title, layout, widgets, is_active, revision, created_by
        ) VALUES (
            v_board_id, p_class_id, BTRIM(p_title), p_layout, p_widgets, TRUE, 1, auth.uid()
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
BEGIN
    SELECT board.* INTO v_source
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    WHERE board.id = p_board_id
      AND board.archived_at IS NULL
      AND class.deleted_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN');
    IF NOT FOUND OR auth.uid() IS NULL THEN
        RAISE EXCEPTION '복제할 수 있는 스크린이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.class_boards SET is_active = FALSE
    WHERE class_id = v_source.class_id AND is_active IS TRUE AND archived_at IS NULL;
    INSERT INTO public.class_boards (class_id, title, layout, widgets, is_active, created_by)
    VALUES (
        v_source.class_id,
        LEFT(v_source.title, 73) || ' 복사본',
        v_source.layout,
        v_source.widgets,
        TRUE,
        auth.uid()
    ) RETURNING * INTO v_copy;

    RETURN JSONB_BUILD_OBJECT(
        'id', v_copy.id, 'title', v_copy.title, 'layout', v_copy.layout,
        'widgets', v_copy.widgets, 'isActive', TRUE, 'revision', v_copy.revision,
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
    v_next_id UUID;
BEGIN
    SELECT board.class_id, board.is_active
    INTO v_class_id, v_was_active
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    WHERE board.id = p_board_id
      AND class.deleted_at IS NULL
      AND board.archived_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN');
    IF NOT FOUND OR auth.uid() IS NULL THEN
        RAISE EXCEPTION '보관할 수 있는 스크린이 아닙니다.' USING ERRCODE = '42501';
    END IF;

    UPDATE public.class_boards board
    SET archived_at = NOW(), is_active = FALSE, updated_at = NOW(), revision = board.revision + 1
    WHERE board.id = p_board_id
      AND board.class_id = v_class_id
      AND board.archived_at IS NULL;

    IF v_was_active THEN
        SELECT board.id INTO v_next_id
        FROM public.class_boards board
        WHERE board.class_id = v_class_id AND board.archived_at IS NULL
        ORDER BY board.updated_at DESC, board.id DESC
        LIMIT 1;
        IF v_next_id IS NOT NULL THEN
            UPDATE public.class_boards SET is_active = TRUE WHERE id = v_next_id;
        END IF;
    END IF;
    RETURN JSONB_BUILD_OBJECT('success', TRUE, 'activeBoardId', v_next_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_teacher_class_board_presentation_v1(p_board_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_result JSONB;
BEGIN
    SELECT JSONB_BUILD_OBJECT(
        'version', 1,
        'class', JSONB_BUILD_OBJECT('id', class.id, 'name', class.name),
        'board', JSONB_BUILD_OBJECT(
            'id', board.id, 'title', board.title, 'layout', board.layout,
            'widgets', board.widgets, 'revision', board.revision, 'updatedAt', board.updated_at
        )
    ) INTO v_result
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    WHERE board.id = p_board_id
      AND board.archived_at IS NULL
      AND class.deleted_at IS NULL
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN');
    IF v_result IS NULL OR auth.uid() IS NULL THEN
        RAISE EXCEPTION '이 스크린을 발표할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    RETURN v_result;
END;
$$;

-- 기존 제출 현황 스냅샷의 집계를 재사용하되 학생 이름·최근 제출·본문은 반환하지 않는다.
CREATE OR REPLACE FUNCTION public.get_teacher_class_board_status_v1(
    p_class_id UUID,
    p_mission_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_snapshot JSONB;
    v_summary JSONB;
BEGIN
    IF auth.uid() IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.classes class
        WHERE class.id = p_class_id
          AND class.deleted_at IS NULL
          AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
    ) THEN
        RAISE EXCEPTION '담당 학급의 글쓰기 현황만 확인할 수 있습니다.' USING ERRCODE = '42501';
    END IF;
    IF p_mission_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM (
            SELECT mission.id
            FROM public.writing_missions mission
            WHERE mission.class_id = p_class_id
              AND mission.is_archived IS FALSE
              AND mission.mission_type IS DISTINCT FROM 'meeting'
            ORDER BY mission.created_at DESC, mission.id DESC
            LIMIT 20
        ) available_mission WHERE available_mission.id = p_mission_id
    ) THEN
        RAISE EXCEPTION '선택한 활성 글 과제를 찾을 수 없습니다.' USING ERRCODE = '22023';
    END IF;

    v_snapshot := public.teacher_assignment_submission_board_snapshot_v2(p_class_id, p_mission_id, 20, 1);
    v_summary := COALESCE(v_snapshot -> 'scope_summary', '{}'::JSONB);
    RETURN JSONB_BUILD_OBJECT(
        'version', 1,
        'scope', v_snapshot ->> 'scope',
        'selectedMissionId', p_mission_id,
        'selectedMissionTitle', v_snapshot ->> 'selected_mission_title',
        'generatedAt', v_snapshot -> 'generated_at',
        'totalStudents', COALESCE((v_summary ->> 'total_students')::INTEGER, 0),
        'submittedCount', COALESCE((v_summary ->> 'confirmed_count')::INTEGER, 0)
            + COALESCE((v_summary ->> 'pending_count')::INTEGER, 0),
        'confirmedCount', COALESCE((v_summary ->> 'confirmed_count')::INTEGER, 0),
        'pendingCount', COALESCE((v_summary ->> 'pending_count')::INTEGER, 0),
        'rewritingCount', COALESCE((v_summary ->> 'rewriting_count')::INTEGER, 0),
        'notSubmittedCount', COALESCE((v_summary ->> 'not_submitted_count')::INTEGER, 0),
        'activeMissionCount', (
            SELECT COUNT(*)::INTEGER FROM (
                SELECT mission.id FROM public.writing_missions mission
                WHERE mission.class_id = p_class_id
                  AND mission.is_archived IS FALSE
                  AND mission.mission_type IS DISTINCT FROM 'meeting'
                ORDER BY mission.created_at DESC, mission.id DESC LIMIT 20
            ) active_mission
        ),
        'missionOptions', COALESCE((
            SELECT JSONB_AGG(JSONB_BUILD_OBJECT('id', mission.id, 'title', mission.title)
                ORDER BY mission.created_at DESC, mission.id DESC)
            FROM (
                SELECT item.id, item.title, item.created_at
                FROM public.writing_missions item
                WHERE item.class_id = p_class_id
                  AND item.is_archived IS FALSE
                  AND item.mission_type IS DISTINCT FROM 'meeting'
                ORDER BY item.created_at DESC, item.id DESC
                LIMIT 20
            ) mission
        ), '[]'::JSONB)
    );
END;
$$;

-- 사진은 공개 URL을 저장하지 않고 비공개 경로만 위젯 설정에 기록한다.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'class-board-assets', 'class-board-assets', FALSE, 1048576,
    ARRAY['image/webp', 'image/jpeg']::TEXT[]
)
ON CONFLICT (id) DO UPDATE SET
    public = EXCLUDED.public,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- storage.objects 정책에서 RLS 전용 class_boards를 직접 조회하면 브라우저 역할은 표 권한이 없어
-- 항상 막힌다. 경로의 학급·보드를 현재 교사가 관리하는지만 좁은 SECURITY DEFINER 함수로 확인한다.
CREATE OR REPLACE FUNCTION public.can_access_class_board_asset_v1(
    p_path TEXT,
    p_require_open_board BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT auth.uid() IS NOT NULL AND COALESCE(EXISTS (
    SELECT 1
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    WHERE class.id::TEXT = split_part(p_path, '/', 1)
      AND board.id::TEXT = split_part(p_path, '/', 2)
      AND class.deleted_at IS NULL
      AND (NOT p_require_open_board OR board.archived_at IS NULL)
      AND (class.teacher_id = auth.uid() OR public.auth_user_role() = 'ADMIN')
), FALSE);
$$;

REVOKE ALL ON FUNCTION public.can_access_class_board_asset_v1(TEXT, BOOLEAN)
FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_class_board_asset_v1(TEXT, BOOLEAN)
TO authenticated, service_role;

DROP POLICY IF EXISTS "Class_Board_Assets_Select_V1" ON storage.objects;
CREATE POLICY "Class_Board_Assets_Select_V1" ON storage.objects
FOR SELECT TO authenticated
USING (
    bucket_id = 'class-board-assets'
    AND public.can_access_class_board_asset_v1(storage.objects.name, FALSE)
);

DROP POLICY IF EXISTS "Class_Board_Assets_Insert_V1" ON storage.objects;
CREATE POLICY "Class_Board_Assets_Insert_V1" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'class-board-assets'
    AND storage.objects.name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9_-]{1,100}[.](webp|jpg)$'
    AND public.can_access_class_board_asset_v1(storage.objects.name, TRUE)
);

DROP POLICY IF EXISTS "Class_Board_Assets_Update_V1" ON storage.objects;
DROP POLICY IF EXISTS "Class_Board_Assets_Delete_V1" ON storage.objects;
CREATE POLICY "Class_Board_Assets_Delete_V1" ON storage.objects
FOR DELETE TO authenticated
USING (
    bucket_id = 'class-board-assets'
    AND public.can_access_class_board_asset_v1(storage.objects.name, FALSE)
);

REVOKE ALL ON FUNCTION public.get_teacher_class_board_workspace_v1(UUID, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_teacher_class_board_v1(UUID, UUID, TEXT, JSONB, JSONB, INTEGER) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.duplicate_teacher_class_board_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.archive_teacher_class_board_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teacher_class_board_presentation_v1(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_teacher_class_board_status_v1(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_workspace_v1(UUID, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.save_teacher_class_board_v1(UUID, UUID, TEXT, JSONB, JSONB, INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.duplicate_teacher_class_board_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.archive_teacher_class_board_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_presentation_v1(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_status_v1(UUID, UUID) TO authenticated, service_role;

COMMIT;

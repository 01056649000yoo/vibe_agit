-- 우리 반 스크린 발표 화면의 승인 검사를 서버로 옮긴다 (2026-09-10).
--
-- 지금까지 "승인된 교사인가"는 화면 쪽에서만 봤고, 그 값을 얻으려고 교사 전체 초기 데이터
-- RPC(get_teacher_app_bootstrap_v1)가 끝나기를 기다렸다. 스크린은 그 데이터를 하나도 쓰지 않는데
-- 로딩만 길어졌다. 화면에서 그 검사를 빼는 대신, 발표 RPC 가 직접 승인 여부를 판정한다.
--
-- auth_user_role() 은 profiles.is_approved 가 참이고 approval_revoked_at 이 비어 있을 때만
-- 'TEACHER' 를 돌려준다. 따라서 승인이 취소된 계정은 담당 학급이라도 스크린을 열 수 없다.
-- 승인된 교사·관리자의 동작은 이전과 같다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_teacher_class_board_presentation_v1(p_board_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_role TEXT := public.auth_user_role();
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR v_role NOT IN ('TEACHER', 'ADMIN') THEN
        RAISE EXCEPTION '이 스크린을 발표할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;

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
      AND (class.teacher_id = auth.uid() OR v_role = 'ADMIN');
    IF v_result IS NULL THEN
        RAISE EXCEPTION '이 스크린을 발표할 권한이 없습니다.' USING ERRCODE = '42501';
    END IF;
    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_teacher_class_board_presentation_v1(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_teacher_class_board_presentation_v1(UUID) TO authenticated, service_role;

COMMIT;

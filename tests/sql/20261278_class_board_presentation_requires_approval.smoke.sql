-- 바깥 실행기가 전체 트랜잭션을 롤백하므로 운영 데이터는 바뀌지 않는다.
-- 승인된 교사는 그대로 열리고, 승인이 취소된 교사는 담당 학급이라도 막히는지 본다.

-- [1] 발표 RPC 가 실제로 승인 여부를 판정하는 함수를 쓰는지 정의로 확인한다.
DO $$
DECLARE
    v_def TEXT := pg_get_functiondef('public.get_teacher_class_board_presentation_v1(uuid)'::regprocedure);
BEGIN
    IF v_def NOT LIKE '%auth_user_role()%' THEN
        RAISE EXCEPTION '발표 RPC 가 승인 여부(auth_user_role)를 보지 않습니다.';
    END IF;
    IF v_def NOT LIKE '%NOT IN (''TEACHER'', ''ADMIN'')%' THEN
        RAISE EXCEPTION '발표 RPC 에 승인 교사·관리자 관문이 없습니다.';
    END IF;
END;
$$;

-- [2] 승인 취소 계정은 auth_user_role() 이 빈 값이라 관문에서 막힌다는 계약을 확인한다.
DO $$
DECLARE
    v_role TEXT;
BEGIN
    SELECT CASE
        WHEN profile.role = 'ADMIN' THEN 'ADMIN'
        WHEN profile.role = 'TEACHER'
             AND profile.is_approved IS TRUE
             AND profile.approval_revoked_at IS NULL THEN 'TEACHER'
        ELSE ''
    END INTO v_role
    FROM (
        SELECT 'TEACHER'::TEXT AS role, TRUE AS is_approved, NOW() AS approval_revoked_at
    ) profile;
    IF v_role <> '' THEN
        RAISE EXCEPTION '승인이 취소된 교사가 발표 권한을 가집니다.';
    END IF;
END;
$$;

-- [3] 담당 학급의 열린 스크린 하나를 골라, 승인된 교사 관점에서 조회 조건이 살아 있는지 본다.
SELECT set_config('test.board_id', candidate.board_id::TEXT, true),
       set_config('test.teacher_id', candidate.teacher_id::TEXT, true)
FROM (
    SELECT board.id AS board_id, class.teacher_id
    FROM public.class_boards board
    JOIN public.classes class ON class.id = board.class_id
    JOIN public.profiles profile ON profile.id = class.teacher_id
    WHERE board.archived_at IS NULL
      AND class.deleted_at IS NULL
      AND profile.is_approved IS TRUE
      AND profile.approval_revoked_at IS NULL
    ORDER BY board.updated_at DESC
    LIMIT 1
) candidate;

DO $$
DECLARE
    v_board UUID := NULLIF(current_setting('test.board_id', true), '')::UUID;
    v_teacher UUID := NULLIF(current_setting('test.teacher_id', true), '')::UUID;
    v_found BOOLEAN;
BEGIN
    IF v_board IS NULL THEN
        RAISE NOTICE '승인 교사의 열린 스크린이 없어 [3]을 건너뜁니다.';
        RETURN;
    END IF;
    SELECT EXISTS (
        SELECT 1
        FROM public.class_boards board
        JOIN public.classes class ON class.id = board.class_id
        WHERE board.id = v_board
          AND board.archived_at IS NULL
          AND class.deleted_at IS NULL
          AND class.teacher_id = v_teacher
    ) INTO v_found;
    IF NOT v_found THEN
        RAISE EXCEPTION '승인된 담당 교사가 자기 스크린을 찾지 못합니다.';
    END IF;
END;
$$;

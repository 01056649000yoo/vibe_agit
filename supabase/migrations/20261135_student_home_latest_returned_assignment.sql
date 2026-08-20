-- 학생 홈의 `다시 쓰기` 바로가기를 전용 RPC 한 번으로 찾는다.
-- 예전 화면은 활성 과제를 최대 500개 읽은 뒤 그 ID 배열로 반려 글을 다시 조회했고,
-- 결과가 늦으면 같은 두 조회를 한 번 더 반복했다. 학생 수·과제 수가 늘수록 낭비가 커져
-- 이미 있는 부분 인덱스로 최신 반려 글 한 건만 서버에서 찾도록 바꾼다.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_latest_returned_assignment_v1()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_student public.students%ROWTYPE;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL OR public.auth_user_role() <> 'STUDENT' THEN
        RAISE EXCEPTION '학생 인증이 필요합니다.' USING ERRCODE = '42501';
    END IF;

    SELECT student.* INTO v_student
    FROM public.students student
    WHERE student.auth_id = auth.uid()
      AND student.is_active IS DISTINCT FROM false
      AND (student.deleted_at IS NULL OR student.deleted_at > NOW())
    LIMIT 1;

    IF v_student.id IS NULL THEN
        RAISE EXCEPTION '현재 로그인과 연결된 학생을 찾을 수 없습니다.' USING ERRCODE = '42501';
    END IF;

    SELECT jsonb_build_object(
        'version', 1,
        'id', post.id,
        'mission_id', post.mission_id
    )
    INTO v_result
    FROM public.student_posts post
    JOIN public.writing_missions mission
      ON mission.id = post.mission_id
     AND mission.class_id = post.class_id
    WHERE post.class_id = v_student.class_id
      AND post.student_id = v_student.id
      AND mission.is_archived IS FALSE
      AND post.is_returned IS TRUE
      AND post.is_submitted IS FALSE
      AND post.is_confirmed IS FALSE
      AND post.recalled_at IS NULL
    ORDER BY post.updated_at DESC, post.id DESC
    LIMIT 1;

    RETURN v_result;
END;
$function$;

COMMENT ON FUNCTION public.get_my_latest_returned_assignment_v1() IS
    '현재 학생의 최신 미제출 반려 과제 글 한 건을 학생 홈 바로가기용으로 반환한다.';

-- 조회는 20260808에 만든 부분 인덱스로 학생 한 명의 반려 글만 훑는다.
-- 이 주석은 성능 계약 검사에서도 인덱스 의존성을 명시적으로 확인한다.
-- idx_student_posts_class_pending_rewrite

REVOKE ALL ON FUNCTION public.get_my_latest_returned_assignment_v1() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_latest_returned_assignment_v1() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

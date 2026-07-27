-- ============================================================================
-- 🔐 비로그인(anon) 호출 가능 함수 정보 유출 차단
-- 작성일: 2026-07-27 (같은 날 admin_* 하드닝의 후속 — 나머지 DEFINER 함수 전수 점검)
--
-- 점검 방법: 운영 DB에서 `SET ROLE anon` 으로 직접 호출.
--   anon 키는 프론트 번들에 포함되어 공개된 값이므로, anon 이 호출 가능하다는 것은
--   "인터넷의 누구나 호출 가능"과 같다.
--
-- 확인된 유출 (전부 실측):
--   [1] fn_get_students_for_rls_check() — 학생 1,413명 전원의 id·class_id·auth_id 덤프.
--       필터도 권한 검사도 없는 RLS 점검용 잔재. 앱·다른 함수 어디서도 참조하지 않음. → DROP
--   [2] custom_access_token_hook(jsonb) — 임의 user_id 의 role(ADMIN 여부)·class_id·student_id 노출.
--       함수 자체는 안전하게 작성됐으나(입력을 믿지 않고 DB 조회) 호출 권한이 열려 있던 것이 문제.
--       현재 GoTrue 설정에서 훅은 주석 처리되어 비활성이다. 나중에 켤 수 있도록 삭제하지 않고
--       인증 서버 롤(supabase_auth_admin)에만 실행 권한을 남긴다.
--   [3] check_points_integrity(uuid, int) — 특정 학생의 total_points 일치 여부를 boolean 으로 응답.
--       이분탐색으로 임의 학생의 포인트를 특정할 수 있다. 참조처 없음. → 실행 권한 회수
-- ============================================================================

-- ----------------------------------------------------------------------------
-- [1] 학생 전수 덤프 함수 제거
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.fn_get_students_for_rls_check();

-- ----------------------------------------------------------------------------
-- [2] JWT 훅 — 인증 서버 전용
--     GoTrue 는 supabase_auth_admin 롤로 DB에 접속한다(docker-compose 확인).
--     훅을 활성화하려면 이 GRANT 가 반드시 있어야 로그인이 동작한다.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;

-- ----------------------------------------------------------------------------
-- [3] 포인트 확인 함수 — 외부 호출 차단
--     트리거·다른 함수에서의 참조가 없음을 확인했다.
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.check_points_integrity(uuid, integer) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

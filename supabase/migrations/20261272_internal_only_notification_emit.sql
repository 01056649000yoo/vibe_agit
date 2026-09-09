-- ============================================================================
-- 내부 전용 알림 함수의 클라이언트 실행 권한 회수 (2026-09-09 보안 점검 P1)
--
-- 무엇이 문제였나:
--   `notification_emit_v1` 은 `src/modules/notifications/README.md` 가 **내부 전용**이라고
--   적어 둔 함수다. 브라우저는 부르지 않고, 기능별 상태 변경 RPC 안에서만 호출한다.
--   그런데 실행 권한이 `=X/supabase_admin`, 즉 **PUBLIC 전체**에 열려 있었고
--   함수 본문에는 **호출자 권한 검사가 없다**(입력 형식만 본다).
--
-- 실증(2026-09-09, 운영에서 읽기 전용 확인):
--   공개 anon 키로 호출 → HTTP 500 (권한을 통과해 함수 본문까지 도달)
--   대조군 `bulk_approve_posts` → HTTP 401 permission denied (정상 차단)
--   즉 인터넷의 누구나 학생 UUID 만 알면 그 아이의 알림함에 임의의 알림을 넣을 수 있었다.
--   `p_actor_student_id` 로 보낸 사람도 사칭되고, `event_key` 를 바꾸면 ON CONFLICT 중복
--   제거도 우회되어 행이 무한히 쌓인다. 속도 제한은 없다.
--
-- 앱 영향 없음(확인함):
--   - `src/` 전체에 이 함수 호출이 없다(문서의 설명 한 줄 외 참조 0건).
--   - Edge 함수·스크립트에도 직접 호출이 없다.
--   - DB 안에서 부르는 함수 7개는 **모두 SECURITY DEFINER 이고 소유자가 이 함수와 같은
--     `supabase_admin`** 이다. 따라서 내부 호출은 소유자 권한으로 그대로 실행된다:
--     emit_assignment_status_notification_v1, emit_feedback_comment_notification_v1,
--     emit_feedback_reaction_notification_v1, emit_point_notification_v1,
--     refresh_reading_marathon_campaign_v1, save_teacher_self_writing_review_v2,
--     sync_student_activity_title_notification_v1
--
-- 학생도 `signInAnonymously()` 로 JWT 롤이 `authenticated` 이므로, 브라우저를 막으려면
-- anon 과 authenticated 를 함께 회수해야 한다. 서버 내부 호출용 service_role 은 남긴다.
-- ============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.notification_emit_v1(
    UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, SMALLINT, UUID
) FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
    IF has_function_privilege('anon', 'public.notification_emit_v1(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, SMALLINT, UUID)', 'EXECUTE')
       OR has_function_privilege('authenticated', 'public.notification_emit_v1(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, SMALLINT, UUID)', 'EXECUTE') THEN
        RAISE EXCEPTION '내부 전용 알림 함수가 아직 클라이언트에 열려 있습니다.';
    END IF;
    IF NOT has_function_privilege('service_role', 'public.notification_emit_v1(UUID, TEXT, TEXT, TEXT, UUID, JSONB, TEXT, SMALLINT, UUID)', 'EXECUTE') THEN
        RAISE EXCEPTION '서버 내부 호출용 service_role 권한까지 사라졌습니다.';
    END IF;
END;
$$;

COMMIT;

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [vibeAi, feedback, studentLogin, authStore, caddy, migration, reportMigration, reportStorageMigration, reportUpsertMigration, reportImageApi, writingPdfMigration, googleDocImageExport, notificationMigration, reactionMigration, friendFeedMigration] = await Promise.all([
    readFile('supabase/functions/vibe-ai/index.ts', 'utf8'),
    readFile('supabase/functions/send-feedback/index.ts', 'utf8'),
    readFile('src/components/student/StudentLogin.jsx', 'utf8'),
    readFile('src/store/useAuthStore.js', 'utf8'),
    readFile('Caddyfile.container', 'utf8'),
    readFile('supabase/migrations/20261014_security_boundary_hardening.sql', 'utf8'),
    readFile('supabase/migrations/20261018_report_writing_images.sql', 'utf8'),
    readFile('supabase/migrations/20261019_report_image_storage_optimization.sql', 'utf8'),
    readFile('supabase/migrations/20261021_report_image_upsert_validation.sql', 'utf8'),
    readFile('src/modules/writing/mission-types/report/reportImageApi.js', 'utf8'),
    readFile('supabase/migrations/20261020_writing_pdf_export.sql', 'utf8'),
    readFile('src/modules/writing/export/googleDocImageExport.js', 'utf8'),
    readFile('supabase/migrations/20261023_student_activity_notifications.sql', 'utf8'),
    readFile('supabase/migrations/20261024_writing_reaction_profiles.sql', 'utf8'),
    readFile('supabase/migrations/20261025_class_public_writing_feed.sql', 'utf8')
]);

test('AI는 승인 교사를 확인하고 학생에게 댓글 판정만 허용한다', () => {
    assert.match(vibeAi, /profile\.is_approved === true/);
    assert.match(vibeAi, /profile\.approval_revoked_at == null/);
    assert.match(vibeAi, /학생 계정은 댓글 안전 확인만 사용할 수 있습니다/);
    assert.match(vibeAi, /typeof commentId !== 'string'/);
    assert.doesNotMatch(vibeAi, /commentId != null/);
});

test('AI 비용 호출 전 DB 속도 제한과 원자적 댓글 선점을 거친다', () => {
    const fetchIndex = vibeAi.indexOf("fetch('https://api.openai.com");
    assert.ok(vibeAi.indexOf("rpc('claim_comment_ai_review_v1'") < fetchIndex);
    assert.ok(vibeAi.indexOf("rpc('consume_ai_request_v1'") < fetchIndex);
    assert.match(vibeAi, /\.eq\('ai_review_token', reviewToken\)/);
    assert.match(migration, /pg_advisory_xact_lock/);
});

test('피드백은 서버 소유권 확인과 HTML 이스케이프를 사용한다', () => {
    assert.match(feedback, /\.eq\('teacher_id', user\.id\)/);
    assert.match(feedback, /is_approved === true/);
    assert.match(feedback, /escapeHtml\(feedback\.content\)/);
    assert.doesNotMatch(feedback, /teacherId/);
});

test('학생 로그인 코드는 localStorage 세션에 보관하지 않는다', () => {
    assert.doesNotMatch(studentLogin, /code:\s*studentInfo\.code/);
    assert.doesNotMatch(authStore, /code:\s*student\.code/);
});

test('정적 앱 응답에 CSP와 Permissions-Policy가 있다', () => {
    assert.match(caddy, /Content-Security-Policy/);
    assert.match(caddy, /Permissions-Policy/);
    assert.match(caddy, /frame-ancestors 'none'/);
    assert.match(
        caddy,
        /img-src[^;]*https:\/\/api\.xn--vz0ba242ncqcba79xhwx\.site/,
        'private report image signed URLs must be allowed by img-src'
    );
    assert.match(caddy, /img-src[^;]*https:\/\/search1\.kakaocdn\.net/);
    assert.match(caddy, /connect-src[^;]*https:\/\/www\.googleapis\.com/);
});

test('Google Docs용 사진은 발견 불가 임시 공유 후 파일 또는 공개 권한을 제거한다', () => {
    assert.match(googleDocImageExport, /type: 'anyone', role: 'reader', allowFileDiscovery: false/);
    assert.match(googleDocImageExport, /GOOGLE_DOC_IMAGE_TYPES = new Set\(\['image\/jpeg', 'image\/png', 'image\/gif'\]\)/);
    assert.match(googleDocImageExport, /method: 'DELETE'[\s\S]*permissions/);
    assert.match(googleDocImageExport, /Promise\.allSettled/);
});

test('권한 판정은 JWT app_metadata를 신뢰하지 않는다', () => {
    const roleFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.auth_user_role\(\)[\s\S]*?\$\$;/)?.[0] || '';
    assert.doesNotMatch(roleFunction, /auth\.jwt|app_metadata/);
    assert.match(migration, /Profiles_Insert_Secure_V20/);
    assert.match(migration, /WITH CHECK \(false\)/);
});

test('PDF 내보내기는 교사 학급 범위 안에서 보고서 구조만 추가로 읽는다', () => {
    assert.match(writingPdfMigration, /p\.class_id = p_class_id/);
    assert.match(writingPdfMigration, /c\.teacher_id = auth\.uid\(\)/);
    assert.match(writingPdfMigration, /p\.structured_content/);
    assert.match(writingPdfMigration, /m\.input_template/);
    assert.match(writingPdfMigration, /LIMIT 5000/);
    assert.doesNotMatch(writingPdfMigration, /auth\.jwt|app_metadata/);
});

test('보고서 사진은 비공개 저장소와 실제 글 공개 상태로 보호한다', () => {
    assert.match(reportMigration, /'report-images',[\s\S]*?false,[\s\S]*?1572864/);
    assert.match(reportStorageMigration, /'report-images',[\s\S]*?false,[\s\S]*?262144/);
    assert.match(reportImageApi, /REPORT_IMAGE_MAX_STORED_BYTES = 256 \* 1024/);
    assert.match(reportImageApi, /REPORT_IMAGE_MAX_EDGE = 720/);
    assert.match(reportMigration, /post\.student_id = public\.auth_student_id\(\)/);
    assert.match(reportMigration, /post\.is_submitted IS TRUE[\s\S]*?post\.visibility = 'class'/);
    assert.match(reportMigration, /class\.teacher_id = auth\.uid\(\)/);
    assert.match(reportMigration, /mission\.input_template = 'report'/);
    assert.match(reportMigration, /validate_report_post_structure/);
    assert.match(reportUpsertMigration, /TG_OP = 'INSERT'/);
    assert.match(reportUpsertMigration, /post\.student_id = NEW\.student_id/);
    assert.match(reportUpsertMigration, /post\.mission_id = NEW\.mission_id/);
    assert.match(reportUpsertMigration, /v_expected_post_id := COALESCE\(v_existing_post_id, NEW\.id\)/);
    assert.match(reportUpsertMigration, /v_path !~ \('\^' \|\| v_expected_post_id::TEXT/);
    assert.doesNotMatch(reportMigration, /app_metadata|auth\.jwt/);
    assert.doesNotMatch(reportUpsertMigration, /app_metadata|auth\.jwt/);
});

test('학생 활동 알림 원장은 직접 공개하지 않고 본인 학급·학생 RPC로만 읽는다', () => {
    assert.match(notificationMigration, /ALTER TABLE public\.student_notification_events ENABLE ROW LEVEL SECURITY/);
    assert.match(notificationMigration, /REVOKE ALL ON TABLE public\.student_notification_events FROM PUBLIC, anon, authenticated/);
    assert.match(notificationMigration, /REVOKE ALL ON FUNCTION public\.notification_emit_v1[\s\S]*PUBLIC, anon, authenticated, service_role/);
    assert.match(notificationMigration, /auth\.uid\(\) IS NULL OR public\.auth_user_role\(\) <> 'STUDENT'/);
    assert.match(notificationMigration, /event\.class_id = v_student\.class_id[\s\S]*event\.student_id = v_student\.id/);
    assert.match(notificationMigration, /cardinality\(p_ids\), 0\) NOT BETWEEN 1 AND 50/);
    assert.doesNotMatch(notificationMigration, /auth\.jwt|app_metadata/);
});

test('학생 반응은 장르별 허용값을 검사하는 RPC로만 쓴다', () => {
    assert.match(reactionMigration, /writing_reaction_profile_types/);
    assert.match(reactionMigration, /mission\.input_template/);
    assert.match(reactionMigration, /profile\.profile_id = v_profile_id[\s\S]*profile\.reaction_type = p_reaction_type/);
    assert.match(reactionMigration, /REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public\.post_reactions/);
    assert.match(reactionMigration, /REVOKE ALL ON TABLE public\.writing_reaction_profile_types FROM PUBLIC, anon, authenticated/);
    assert.match(reactionMigration, /REVOKE ALL ON FUNCTION public\.toggle_my_post_reaction_v1\(UUID, TEXT\) FROM PUBLIC, anon/);
    assert.doesNotMatch(reactionMigration, /auth\.jwt|app_metadata/);
});

test('친구 공개 글 피드는 실제 학생 학급과 공개 상태를 서버에서 고정한다', () => {
    assert.match(friendFeedMigration, /public\.auth_user_role\(\) <> 'STUDENT'/);
    assert.match(friendFeedMigration, /post\.class_id = v_class_id/);
    assert.match(friendFeedMigration, /post\.is_submitted IS TRUE[\s\S]*post\.visibility = 'class'/);
    assert.match(friendFeedMigration, /CASE WHEN post\.show_original IS TRUE THEN post\.original_title ELSE NULL END/);
    assert.match(friendFeedMigration, /REVOKE ALL ON FUNCTION public\.get_class_public_writing_feed_v1[\s\S]*PUBLIC, anon/);
    assert.doesNotMatch(friendFeedMigration, /auth\.jwt|app_metadata/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [vibeAi, feedback, studentLogin, authStore, caddy, migration, reportMigration, reportStorageMigration, reportUpsertMigration, reportImageApi, writingPdfMigration, googleDocImageExport, notificationMigration, reactionMigration, friendFeedMigration, pointHistoryMigration, labBridgeMigration, adminLabMigration, vocabReviewMigration, vocabPilotMigration, vocabPracticeMigration, vocabPerfectRewardMigration, vocabItemLearningMigration, postColumnGuardMigration, spellCheckMigration, findingsMigration, promotionMigration, spellingSearchHardeningMigration, draftBulkCleanupMigration, priorityNotificationMigration] = await Promise.all([
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
    readFile('supabase/migrations/20261025_class_public_writing_feed.sql', 'utf8'),
    readFile('supabase/migrations/20261026_student_point_history.sql', 'utf8'),
    readFile('supabase/migrations/20261027_lab_ai_bridge.sql', 'utf8'),
    readFile('supabase/migrations/20261028_admin_lab_management.sql', 'utf8'),
    readFile('supabase/migrations/20261105_vocab_tower_v2_review_workspace.sql', 'utf8'),
    readFile('supabase/migrations/20261106_vocab_tower_v2_pilot.sql', 'utf8'),
    readFile('supabase/migrations/20261107_vocab_tower_v2_deck_practice.sql', 'utf8'),
    readFile('supabase/migrations/20261108_vocab_tower_v2_perfect_practice_reward.sql', 'utf8'),
    readFile('supabase/migrations/20261109_vocab_tower_v2_item_learning.sql', 'utf8'),
    readFile('supabase/migrations/20261117_guard_student_post_server_columns.sql', 'utf8'),
    readFile('supabase/migrations/20261129_ai_spell_check_once_per_post.sql', 'utf8'),
    readFile('supabase/migrations/20261131_spelling_ai_findings.sql', 'utf8'),
    readFile('supabase/migrations/20261132_spelling_promotion_review.sql', 'utf8'),
    readFile('supabase/migrations/20261145_spelling_search_legacy_hardening.sql', 'utf8'),
    readFile('supabase/migrations/20261146_self_writing_draft_bulk_cleanup.sql', 'utf8'),
    readFile('supabase/migrations/20261166_priority_writing_notification_poll.sql', 'utf8')
]);

test('AI는 승인 교사를 확인하고 학생에게는 댓글 판정·내 글 맞춤법만 허용한다', () => {
    assert.match(vibeAi, /profile\.is_approved === true/);
    assert.match(vibeAi, /profile\.approval_revoked_at == null/);
    // 학생이 쓸 수 있는 AI 는 이 둘뿐이다(2026-08-19에 맞춤법 검사를 더했다).
    assert.match(vibeAi, /type !== 'SAFETY_CHECK' && type !== 'SPELL_CHECK'/);
    assert.match(vibeAi, /학생 계정은 댓글 안전 확인과 맞춤법 검사만 사용할 수 있습니다/);
    assert.match(vibeAi, /typeof commentId !== 'string'/);
    assert.doesNotMatch(vibeAi, /commentId != null/);
});

test('학생 맞춤법 검사는 본문을 서버가 읽고 한 번만 쓰도록 선점한다', () => {
    const fetchIndex = vibeAi.indexOf("fetch('https://api.openai.com");
    // 본문은 클라이언트가 보내지 않는다 — 내 글인지 확인한 뒤 DB 에서 읽는다.
    assert.match(vibeAi, /\.from\('student_posts'\)[\s\S]{0,200}\.eq\('student_id', studentId\)/);
    // 사용 표시 선점과 분당 상한이 모두 AI 호출보다 먼저다.
    assert.ok(vibeAi.indexOf(".is('spell_check_used_at', null)") < fetchIndex);
    assert.ok(vibeAi.indexOf("p_scope: 'student_spell_check'") < fetchIndex);
    // 쓰는 도중에는 못 쓴다 — 제출한 글, 아직 승인 전인 글만 검사한다.
    // 반려하면 is_submitted 가 false 로 돌아가므로 is_returned 하나로 판정한다.
    assert.match(vibeAi, /if \(!post\.is_returned\) \{/);
    // 아무 글자나 적은 글에 "잘 썼어요"가 뜨지 않게 먼저 거르고, 그때는 기회를 쓰지 않는다.
    assert.match(vibeAi, /function looksLikeGibberish/);
    assert.ok(vibeAi.indexOf('looksLikeGibberish(body)') < vibeAi.indexOf("fetch('https://api.openai.com"));
    assert.match(vibeAi, /notWriting: true/);
    // 도중에 실패하면 한 번뿐인 기회를 돌려준다(AI 오류로 기회를 잃지 않게).
    assert.match(vibeAi, /if \(spellCheckPostId\) \{[\s\S]{0,200}spell_check_used_at: null/);
    // 찾아낸 표현은 학급·학생 이름 없이 누적한다(나중에 기본 자료를 늘리는 근거).
    assert.match(vibeAi, /record_spelling_ai_findings_v1/);
    assert.match(findingsMigration, /auth\.role\(\) <> 'service_role'/);
    assert.match(findingsMigration, /char_length\(v_expression\) > 40/);
    assert.doesNotMatch(findingsMigration, /student_id/);
    // 승격 검토는 관리자만 본다(학생·교사 토큰으로는 후보도 결정도 못 한다).
    assert.match(promotionMigration, /auth_user_role\(\) <> 'ADMIN'/);
    assert.equal((promotionMigration.match(/auth_user_role\(\) <> 'ADMIN'/g) ?? []).length, 2);
    assert.match(promotionMigration, /p_decision NOT IN \('accepted', 'rejected'\)/);
    assert.match(vibeAi, /if \(post\.is_confirmed\) throw new HttpError/);
    // 서버 소유 열이라 학생이 직접 지울 수 없어야 한다.
    assert.match(spellCheckMigration, /NEW\.spell_check_used_at := OLD\.spell_check_used_at/);
    assert.match(spellCheckMigration, /NEW\.spell_check_result := OLD\.spell_check_result/);
});

test('맞춤법 구버전 기록과 일기 임시본 정리는 학생 권한 경계를 지킨다', () => {
    assert.match(spellingSearchHardeningMigration, /REVOKE EXECUTE ON FUNCTION public\.record_spelling_search_batch_v1\(JSONB\) FROM authenticated/);
    assert.match(spellingSearchHardeningMigration, /char_length\(corpus\.expression\) BETWEEN 2 AND 15/);
    assert.match(draftBulkCleanupMigration, /public\.auth_user_role\(\) <> 'STUDENT'/);
    assert.match(draftBulkCleanupMigration, /draft\.student_id = v_student_id/);
    assert.match(draftBulkCleanupMigration, /array_length\(p_source_keys, 1\).*BETWEEN 1 AND 50/);
    assert.match(draftBulkCleanupMigration, /REVOKE ALL ON FUNCTION public\.delete_my_self_writing_drafts\(TEXT, TEXT\[\]\) FROM PUBLIC, anon/);
});

test('AI 비용 호출 전 DB 속도 제한과 원자적 댓글 선점을 거친다', () => {
    const fetchIndex = vibeAi.indexOf("fetch('https://api.openai.com");
    assert.ok(vibeAi.indexOf("rpc('claim_comment_ai_review_v1'") < fetchIndex);
    assert.ok(vibeAi.indexOf("rpc('consume_ai_request_v1'") < fetchIndex);
    assert.match(vibeAi, /\.eq\('ai_review_token', reviewToken\)/);
    assert.match(migration, /pg_advisory_xact_lock/);
});

test('연구소 AI 브리지는 연구소 세션·서버 전용 매핑·실제 승인 상태를 확인한다', () => {
    const resolveIndex = vibeAi.indexOf("rpc('resolve_lab_ai_teacher_v1'");
    const rateIndex = vibeAi.indexOf("rpc('consume_ai_request_v1'");
    const fetchIndex = vibeAi.indexOf("fetch('https://api.openai.com");
    assert.ok(resolveIndex > -1 && resolveIndex < rateIndex && rateIndex < fetchIndex);
    assert.match(vibeAi, /X-Lab-Auth/);
    assert.match(vibeAi, /\/auth\/v1\/user/);
    assert.match(vibeAi, /if \(!labUserResponse\.ok\) continue/);
    assert.match(labBridgeMigration, /auth\.role\(\) <> 'service_role'/);
    assert.match(labBridgeMigration, /v_profile\.role = 'ADMIN'/);
    assert.match(labBridgeMigration, /v_profile\.role = 'TEACHER'/);
    assert.match(labBridgeMigration, /REVOKE ALL ON FUNCTION public\.resolve_lab_ai_teacher_v1\(UUID\)/);
    assert.doesNotMatch(labBridgeMigration, /auth\.jwt|app_metadata/);
});

test('연구소 관리는 아지트 ADMIN 전용 RPC로 통합하고 내부 매핑 ID를 숨긴다', () => {
    assert.match(adminLabMigration, /public\.auth_user_role\(\) <> 'ADMIN'/);
    assert.match(adminLabMigration, /auth\.uid\(\) IS NULL/);
    assert.match(adminLabMigration, /admin_get_lab_service_summary_v1/);
    assert.match(adminLabMigration, /admin_set_lab_teacher_access_v1/);
    assert.match(adminLabMigration, /UPDATE public\.lab_ai_teacher_links/);
    assert.match(adminLabMigration, /lab_profile\.user_id = link\.agit_user_id/);
    assert.match(adminLabMigration, /class\.teacher_id = link\.agit_user_id/);
    assert.match(adminLabMigration, /room\.teacher_id = link\.agit_user_id/);
    assert.match(adminLabMigration, /REVOKE ALL ON FUNCTION public\.admin_get_lab_service_summary_v1\(\)[\s\S]*FROM PUBLIC, anon/);
    assert.match(adminLabMigration, /REVOKE ALL ON FUNCTION public\.admin_set_lab_teacher_access_v1\(UUID, BOOLEAN\)[\s\S]*FROM PUBLIC, anon/);
    assert.doesNotMatch(adminLabMigration, /jsonb_build_object\([\s\S]{0,100}'lab_user_id'/);
    assert.doesNotMatch(adminLabMigration, /auth\.jwt|app_metadata/);
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
    const frameSources = caddy.match(/frame-src ([^;"]+)/)?.[1];
    assert.equal(
        frameSources,
        'https://accounts.google.com https://xn--9y2br3k43n.kr',
        'frame-src must allow only Google sign-in and the Samlink embed origin'
    );
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

test('반려·승인 폴링은 실제 학생 연결과 현재 글 상태를 확인하고 최소 신호만 반환한다', () => {
    assert.match(priorityNotificationMigration, /public\.auth_user_role\(\) <> 'STUDENT'/);
    assert.match(priorityNotificationMigration, /student\.auth_id = auth\.uid\(\)/);
    assert.match(priorityNotificationMigration, /event\.class_id = v_student\.class_id[\s\S]*?event\.student_id = v_student\.id/);
    assert.match(priorityNotificationMigration, /post\.class_id = v_student\.class_id[\s\S]*?post\.student_id = v_student\.id/);
    assert.match(priorityNotificationMigration, /post\.is_returned IS TRUE[\s\S]*?post\.is_confirmed IS TRUE/);
    assert.match(priorityNotificationMigration, /LIMIT 10/);
    assert.doesNotMatch(priorityNotificationMigration, /auth\.jwt|app_metadata/);
    assert.doesNotMatch(priorityNotificationMigration, /jsonb_build_object\([\s\S]{0,300}'payload'/);
    assert.match(priorityNotificationMigration, /REVOKE ALL ON FUNCTION public\.poll_my_priority_writing_notifications_v1[\s\S]*?PUBLIC, anon/);
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

test('학생 포인트 내역은 실제 학생 연결로 본인 원장만 제한 조회한다', () => {
    assert.match(pointHistoryMigration, /public\.auth_user_role\(\) <> 'STUDENT'/);
    assert.match(pointHistoryMigration, /student\.auth_id = auth\.uid\(\)/);
    assert.match(pointHistoryMigration, /point_log\.class_id = v_class_id[\s\S]*point_log\.student_id = v_student_id/);
    assert.match(pointHistoryMigration, /LEAST\(GREATEST\(COALESCE\(p_limit, 20\), 1\), 50\)/);
    assert.match(pointHistoryMigration, /REVOKE ALL ON FUNCTION public\.get_my_point_history_v1\(INTEGER\) FROM PUBLIC, anon/);
    assert.doesNotMatch(pointHistoryMigration, /auth\.jwt|app_metadata/);
});

test('어휘 V2 검수 자료는 ADMIN 전용 RPC와 잠금 경계 안에 둔다', () => {
    assert.match(vocabReviewMigration, /ALTER TABLE public\.vocab_tower_v2_review_decks ENABLE ROW LEVEL SECURITY/);
    assert.match(vocabReviewMigration, /ALTER TABLE public\.vocab_tower_v2_review_items ENABLE ROW LEVEL SECURITY/);
    assert.match(vocabReviewMigration, /REVOKE ALL ON TABLE public\.vocab_tower_v2_review_decks FROM PUBLIC, anon, authenticated/);
    assert.match(vocabReviewMigration, /profile\.id = v_user_id[\s\S]*profile\.role = 'ADMIN'/);
    assert.match(vocabReviewMigration, /v_item_count NOT BETWEEN 1 AND 50/);
    assert.match(vocabReviewMigration, /char_length\(p_questions::TEXT\) > 20000/);
    assert.match(vocabReviewMigration, /pg_advisory_xact_lock/);
    assert.match(vocabReviewMigration, /item\.version = p_expected_version/);
    assert.match(vocabReviewMigration, /locked vocabulary deck cannot be edited/);
    assert.match(vocabReviewMigration, /validate_vocab_tower_v2_review_questions_v1/);
    assert.match(vocabReviewMigration, /REVOKE ALL ON FUNCTION public\.validate_vocab_tower_v2_review_questions_v1\(JSONB, TEXT\)[\s\S]*authenticated, service_role/);
    assert.match(vocabReviewMigration, /REVOKE ALL ON FUNCTION public\.admin_get_vocab_tower_v2_review_deck_v1[\s\S]*FROM PUBLIC, anon/);
    assert.match(vocabReviewMigration, /REVOKE ALL ON FUNCTION public\.admin_seed_vocab_tower_v2_review_deck_v1[\s\S]*FROM PUBLIC, anon/);
    assert.match(vocabReviewMigration, /REVOKE ALL ON FUNCTION public\.admin_save_vocab_tower_v2_review_item_v1[\s\S]*FROM PUBLIC, anon/);
    assert.match(vocabReviewMigration, /REVOKE ALL ON FUNCTION public\.admin_set_vocab_tower_v2_review_status_v1[\s\S]*FROM PUBLIC, anon/);
    assert.doesNotMatch(vocabReviewMigration, /auth\.jwt|app_metadata/);
});

test('어휘 V2 시험 출제는 잠긴 덱과 서버 정답 스냅샷으로 채점한다', () => {
    assert.match(vocabPilotMigration, /REVOKE ALL ON TABLE public\.vocab_tower_v2_run_questions FROM PUBLIC, anon, authenticated/);
    assert.match(vocabPilotMigration, /public\.auth_user_role\(\) <> 'STUDENT'/);
    assert.match(vocabPilotMigration, /run\.student_id = v_student_id[\s\S]*run\.class_id = v_class_id/);
    assert.match(vocabPilotMigration, /deck\.review_status = 'locked'/);
    assert.match(vocabPilotMigration, /question\.correct_answer/);
    assert.match(vocabPilotMigration, /p_selected_answer = v_question\.correct_answer/);
    assert.match(vocabPilotMigration, /class\.teacher_id = v_user_id OR public\.auth_user_role\(\) = 'ADMIN'/);
    assert.match(vocabPilotMigration, /BEFORE UPDATE OF vocab_tower_content_version ON public\.classes/);
    assert.match(vocabPilotMigration, /OLD\.teacher_id <> v_user_id AND public\.auth_user_role\(\) <> 'ADMIN'/);
    const issueFunction = vocabPilotMigration.match(/CREATE OR REPLACE FUNCTION public\.get_next_my_vocab_tower_question_v2[\s\S]*?\n\$\$;/)?.[0] || '';
    assert.doesNotMatch(issueFunction, /'correct_answer'/);
    assert.doesNotMatch(vocabPilotMigration, /auth\.jwt|app_metadata/);
});

test('어휘 V2 덱별 개인 연습은 본인 학급 범위 RPC로만 기록한다', () => {
    assert.match(vocabPracticeMigration, /ALTER TABLE public\.vocab_tower_v2_deck_progress ENABLE ROW LEVEL SECURITY/);
    assert.match(vocabPracticeMigration, /REVOKE ALL ON TABLE public\.vocab_tower_v2_deck_progress FROM PUBLIC, anon, authenticated/);
    assert.match(vocabPracticeMigration, /public\.auth_user_role\(\) <> 'STUDENT'/);
    assert.match(vocabPracticeMigration, /run\.student_id = v_student_id[\s\S]*run\.class_id = v_class_id/);
    assert.match(vocabPracticeMigration, /deck\.review_status = 'locked'/);
    assert.match(vocabPracticeMigration, /question\.correct_answer/);
    const issueFunction = vocabPracticeMigration.match(/CREATE OR REPLACE FUNCTION public\.get_next_my_vocab_tower_v2_practice_question_v1[\s\S]*?\n\$\$;/)?.[0] || '';
    assert.doesNotMatch(issueFunction, /'correct_answer'/);
    assert.doesNotMatch(vocabPracticeMigration, /auth\.jwt|app_metadata/);
});

test('어휘 V2 완벽 연습 보상은 서버 설정과 학생별 고정 이벤트 키로 한 번만 지급한다', () => {
    assert.match(vocabPerfectRewardMigration, /public\.auth_student_id\(\)/);
    assert.match(vocabPerfectRewardMigration, /run\.student_id = v_student_id[\s\S]*run\.class_id = v_class_id/);
    assert.match(vocabPerfectRewardMigration, /class\.vocab_tower_v2_perfect_reward_points/);
    assert.match(vocabPerfectRewardMigration, /v_run\.correct_count = v_run\.target_question_count/);
    assert.match(vocabPerfectRewardMigration, /public\.point_engine_apply\(/);
    assert.match(vocabPerfectRewardMigration, /'vocab-v2-perfect:%s:%s:%s'/);
    assert.doesNotMatch(vocabPerfectRewardMigration, /p_reward|p_amount/);
    assert.doesNotMatch(vocabPerfectRewardMigration, /auth\.jwt|app_metadata/);
});

test('어휘 V2 낱말 상태는 직접 접근을 막고 답안 트랜잭션에서 본인 범위로만 갱신한다', () => {
    assert.match(vocabItemLearningMigration, /ALTER TABLE public\.vocab_tower_v2_item_progress ENABLE ROW LEVEL SECURITY/);
    assert.match(vocabItemLearningMigration, /REVOKE ALL ON TABLE public\.vocab_tower_v2_item_progress FROM PUBLIC, anon, authenticated/);
    assert.match(vocabItemLearningMigration, /AFTER INSERT ON public\.vocab_tower_answers/);
    assert.match(vocabItemLearningMigration, /question\.student_id = NEW\.student_id[\s\S]*question\.class_id = NEW\.class_id/);
    assert.match(vocabItemLearningMigration, /run\.student_id = NEW\.student_id[\s\S]*run\.class_id = NEW\.class_id/);
    assert.match(vocabItemLearningMigration, /progress\.student_id = v_student_id[\s\S]*progress\.class_id = v_class_id/);
    const issueFunction = vocabItemLearningMigration.match(/CREATE OR REPLACE FUNCTION public\.get_next_my_vocab_tower_v2_practice_question_v1[\s\S]*?\n\$\$;/)?.[0] || '';
    assert.doesNotMatch(issueFunction, /'correct_answer'/);
    assert.doesNotMatch(vocabItemLearningMigration, /auth\.jwt|app_metadata/);
});

test('학생은 자기 글의 보상·승인 상태를 직접 고칠 수 없다', () => {
    // 2026-08-17 실제 재현: 학생이 PostgREST 로 awarded_base_reward 를 50000 으로 바꾼 뒤
    // 교사가 평소대로 승인하니 50,020점이 지급됐다(총점 600 → 50,620).
    // 원인은 Post_Update_V19 가 본인 글의 모든 컬럼을 열어 준 것이고,
    // approve_assignment_post 가 글 행의 awarded_* 를 먼저 신뢰하는 것이다.
    assert.match(postColumnGuardMigration, /BEFORE INSERT OR UPDATE ON public\.student_posts/);
    assert.match(postColumnGuardMigration, /trg_guard_student_post_server_columns/);

    // 신뢰 경로(SECURITY DEFINER RPC)와 직접 테이블 쓰기는 current_user 로 가른다.
    assert.match(postColumnGuardMigration, /current_user <> 'authenticated'/);
    assert.match(postColumnGuardMigration, /auth_user_role\(\) IS DISTINCT FROM 'STUDENT'/);

    const guardFunction = postColumnGuardMigration.match(
        /CREATE OR REPLACE FUNCTION public\.guard_student_post_server_columns[\s\S]*?\n\$\$;/)?.[0] || '';
    assert.ok(guardFunction, '가드 함수 정의를 찾지 못했습니다.');

    // ⚠️ SECURITY DEFINER 로 만들면 함수 안의 current_user 가 항상 정의자(supabase_admin)가 되어
    // 직접 쓰기와 신뢰 RPC 를 구분하지 못하고 가드가 통째로 무력화된다. 선언부만 검사한다
    // (본문 주석에는 신뢰 경로를 설명하느라 같은 낱말이 나온다).
    const guardHeader = guardFunction.slice(0, guardFunction.indexOf('AS $$'));
    assert.doesNotMatch(guardHeader, /SECURITY DEFINER/);

    // 서버가 정하는 값은 학생 쓰기에서 이전 값으로 되돌린다.
    for (const [column, initial] of [
        ['awarded_base_reward', 'NULL'],
        ['awarded_bonus_reward', 'NULL'],
        ['awarded_bonus_threshold', 'NULL'],
        ['is_submitted', 'false'],
        ['is_returned', 'false'],
        ['is_confirmed', 'false']
    ]) {
        assert.ok(guardFunction.includes(`NEW.${column} := OLD.${column};`),
            `${column} 이 학생 쓰기에서 이전 값으로 보호되지 않습니다.`);
        assert.ok(guardFunction.includes(`NEW.${column} := ${initial};`),
            `${column} 이 새 초안에서 ${initial} 로 초기화되지 않습니다.`);
    }

    // 보너스 조건이 글자 수를 보므로 클라이언트 값을 믿지 않고 제출 RPC 와 같은 함수로 다시 센다.
    assert.match(guardFunction, /NEW\.char_count := public\.writing_content_char_count\(/);
});

test('과제 임시저장은 전용 RPC로만 하고 서버 값을 실어 보내지 않는다', async () => {
    const [hook, draftMigration] = await Promise.all([
        readFile('src/hooks/useMissionSubmit.js', 'utf8'),
        readFile('supabase/migrations/20261118_assignment_draft_save_rpc.sql', 'utf8')
    ]);

    // 예전에는 student_posts 에 직접 upsert 하면서 보상 금액·글자 수·제출 상태를 클라이언트가
    // 실어 보냈고, 그게 2026-08-17 포인트 조작 취약점의 뿌리였다.
    assert.match(hook, /supabase\.rpc\('save_my_assignment_draft_v1'/);
    assert.doesNotMatch(hook, /\.from\('student_posts'\)[\s\S]{0,200}\.upsert\(/);
    for (const field of [
        'awarded_base_reward', 'awarded_bonus_reward', 'awarded_bonus_threshold', 'char_count'
    ]) {
        assert.ok(!hook.includes(`${field}:`), `임시저장이 ${field} 를 서버로 보내면 안 됩니다.`);
    }

    // 서버는 학생 값만 받고 상태·보상은 손대지 않는다.
    assert.match(draftMigration, /auth_user_role\(\) <> 'STUDENT'/);
    assert.match(draftMigration, /mission\.class_id = v_student\.class_id/);
    assert.match(draftMigration, /is_archived IS TRUE/);
    assert.match(draftMigration, /is_confirmed IS TRUE[\s\S]{0,120}이미 제출된 글은 수정할 수 없습니다/);
    assert.match(draftMigration, /v_char_count := public\.writing_content_char_count\(/);
    const updateBlock = draftMigration.match(/UPDATE public\.student_posts SET[\s\S]*?WHERE id = v_existing\.id/)?.[0] || '';
    assert.ok(updateBlock, '기존 초안 갱신 블록을 찾지 못했습니다.');
    for (const column of [
        'awarded_base_reward', 'awarded_bonus_reward', 'awarded_bonus_threshold',
        'is_submitted', 'is_returned', 'is_confirmed'
    ]) {
        assert.ok(!updateBlock.includes(column),
            `임시저장이 ${column} 을 건드립니다. 상태·보상은 제출·승인 RPC 만 씁니다.`);
    }
    assert.match(draftMigration, /REVOKE ALL ON FUNCTION public\.save_my_assignment_draft_v1[\s\S]*?FROM PUBLIC, anon/);
});

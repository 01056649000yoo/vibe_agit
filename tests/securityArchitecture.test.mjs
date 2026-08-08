import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [vibeAi, feedback, studentLogin, authStore, caddy, migration] = await Promise.all([
    readFile('supabase/functions/vibe-ai/index.ts', 'utf8'),
    readFile('supabase/functions/send-feedback/index.ts', 'utf8'),
    readFile('src/components/student/StudentLogin.jsx', 'utf8'),
    readFile('src/store/useAuthStore.js', 'utf8'),
    readFile('Caddyfile.container', 'utf8'),
    readFile('supabase/migrations/20261014_security_boundary_hardening.sql', 'utf8')
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
});

test('권한 판정은 JWT app_metadata를 신뢰하지 않는다', () => {
    const roleFunction = migration.match(/CREATE OR REPLACE FUNCTION public\.auth_user_role\(\)[\s\S]*?\$\$;/)?.[0] || '';
    assert.doesNotMatch(roleFunction, /auth\.jwt|app_metadata/);
    assert.match(migration, /Profiles_Insert_Secure_V20/);
    assert.match(migration, /WITH CHECK \(false\)/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { generateUnambiguousCode } from '../src/lib/codeGenerator.js';

// 2026-09-24 보안 점검(docs/security-audits/2026-09-24.md)에서 고친 것이 되돌아가지 않게 지킨다.

test('학생 로그인·초대 코드는 암호학적 난수로, 헷갈리는 글자 없이 만든다', async () => {
    const source = await readFile('src/lib/codeGenerator.js', 'utf8');
    assert.match(source, /crypto\.getRandomValues/);
    assert.doesNotMatch(source, /Math\.random\(/);
    const codes = new Set();
    for (let i = 0; i < 2000; i += 1) {
        const code = generateUnambiguousCode(8);
        assert.match(code, /^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);
        codes.add(code);
    }
    assert.equal(codes.size, 2000);
});

test('학생 코드 반복 대입은 익명 세션마다 10분 10번에서 막고, 기록 표는 브라우저 역할이 못 읽는다', async () => {
    const sql = await readFile('supabase/migrations/20261341_security_student_login_attempts.sql', 'utf8');
    assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.student_login_failures/);
    assert.match(sql, /REVOKE ALL ON TABLE public\.student_login_failures FROM PUBLIC, anon, authenticated/);
    assert.match(sql, /INTERVAL '10 minutes';\s*IF v_recent_failures >= 10 THEN/);
    assert.match(sql, /INSERT INTO public\.student_login_failures \(auth_id\) VALUES \(v_auth_id\)/);
    // 아이 화면에 영어 오류가 나가지 않는다.
    assert.doesNotMatch(sql, /Student code not found/);
    assert.match(sql, /ALTER FUNCTION public\.protect_sensitive_data\(\) SET search_path = public;/);
    assert.match(sql, /ALTER FUNCTION public\.sync_student_class_id\(\) SET search_path = public;/);
    assert.match(sql, /ALTER FUNCTION public\.sync_teacher_class_id\(\) SET search_path = public;/);
});

test('엣지 함수는 내부 오류 문구를 사용자에게 보내지 않는다', async () => {
    const [vibeAi, adminMode] = await Promise.all([
        readFile('supabase/functions/vibe-ai/index.ts', 'utf8'),
        readFile('supabase/functions/verify-admin-mode/index.ts', 'utf8')
    ]);
    assert.match(vibeAi, /const clientMessage = error instanceof HttpError \|\| CLIENT_SAFE_DB_CODES\.has\(raisedCode\)/);
    assert.match(vibeAi, /jsonResponse\(\{ error: clientMessage \}, status, headers\)/);
    assert.doesNotMatch(adminMode, /message: error\.message/);
});

test('관리자 모드 비밀번호는 일정 시간 비교, CORS 는 요청마다 허용 출처로 만든다', async () => {
    const adminMode = await readFile('supabase/functions/verify-admin-mode/index.ts', 'utf8');
    assert.match(adminMode, /constantTimeEqual\(password, ADMIN_MODE_PASSWORD\)/);
    assert.doesNotMatch(adminMode, /password !== ADMIN_MODE_PASSWORD/);
    assert.match(adminMode, /Deno\.env\.get\('ALLOWED_ORIGIN'\)/);
    assert.match(adminMode, /Deno\.serve\(async \(req\) => \{[\s\S]{0,200}const corsHeaders = \{ \.\.\.baseCorsHeaders/);
    assert.doesNotMatch(adminMode, /let corsHeaders/);
});

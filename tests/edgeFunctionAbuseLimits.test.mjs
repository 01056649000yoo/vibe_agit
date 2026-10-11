import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// 2026-10-11 보안 점검: 회색 점선 본문 크기 상한, 피드백 이메일 재전송 제한.
test('회색 점선 함수는 JSON 을 읽기 전에 요청 크기를 본다', async () => {
    const source = await readFile('supabase/functions/spelling-look-closer/index.ts', 'utf8');
    assert.match(source, /MAX_BODY_BYTES/);
    assert.ok(source.indexOf("get('content-length')") < source.indexOf('JSON.parse(raw)'));
    assert.doesNotMatch(source, /await req\.json\(\)/);
});

test('피드백 메일은 피드백마다 한 번, 교사별 시간당 상한이 있다', async () => {
    const source = await readFile('supabase/functions/send-feedback/index.ts', 'utf8');
    assert.match(source, /sentFeedbackIds/);
    assert.match(source, /MAX_PER_HOUR/);
    assert.ok(source.indexOf('allowSend(user.id, feedback.id)') < source.indexOf("fetch('https://api.resend.com/emails'"));
});

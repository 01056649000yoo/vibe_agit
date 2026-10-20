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

test('인형뽑기는 코인을 넣자마자 보낸 결과를 잡은 것으로 치지 않고, 같은 인형 중복을 센다', async () => {
    const source = await readFile('supabase/functions/spelling-claw/index.ts', 'utf8');
    assert.match(source, /MIN_PLAY_MS/);
    assert.match(source, /tooFast \? \[\]/);
    assert.match(source, /all\.indexOf\(id\) === position/);
});

test('보고서 사진 복사 함수는 경로를 받지 않고, 학급 담당자 확인을 DB 에 맡기며, 요청 크기를 먼저 본다', async () => {
    const source = await readFile('supabase/functions/class-agit-photo-copy/index.ts', 'utf8');
    assert.match(source, /MAX_BODY_BYTES/);
    assert.ok(source.indexOf("get('content-length')") < source.indexOf('JSON.parse(raw)'));
    assert.doesNotMatch(source, /await req\.json\(\)/);
    // 무엇을 옮길지는 DB(담당 교사 토큰으로 부른 claim RPC)가 정한다. 본문의 경로는 쓰지 않는다.
    assert.match(source, /userClient\.rpc\('claim_class_agit_photo_copy_v1'/);
    assert.doesNotMatch(source, /body\??\.(source_path|copy_path|path)/);
    assert.match(source, /finish_class_agit_photo_copy_v1/);
    assert.match(source, /MAX_PHOTOS_PER_REQUEST/);
});

test('보고서 사진 복사 함수는 확인한 뒤 원본 크기가 바뀌었으면 복사하지 않는다', async () => {
    const source = await readFile('supabase/functions/class-agit-photo-copy/index.ts', 'utf8');
    assert.match(source, /\.info\(photo\.source_path\)/);
    assert.match(source, /size !== photo\.bytes/);
    assert.ok(source.indexOf('.info(photo.source_path)') < source.indexOf('.copy(photo.source_path'));
});

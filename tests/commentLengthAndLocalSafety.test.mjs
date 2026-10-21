import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
    composerSource,
    interactionSource,
    migrationSource,
    edgeSource
] = await Promise.all([
    readFile('src/components/student/CommentComposer.jsx', 'utf8'),
    readFile('src/hooks/usePostInteractions.js', 'utf8'),
    readFile('supabase/migrations/20261351_comment_max_chars_200.sql', 'utf8'),
    readFile('supabase/functions/vibe-ai/index.ts', 'utf8')
]);

test('댓글 입력창(CommentComposer)은 최대 200자(maxLength={200})로 제한된다', () => {
    assert.match(composerSource, /maxLength=\{200\}/);
    assert.doesNotMatch(composerSource, /maxLength=\{1000\}/);
});

test('usePostInteractions의 validateCommentQuality는 200자 초과를 차단한다', () => {
    assert.match(interactionSource, /commentTextIssue/);
    assert.match(readFileSync('supabase/functions/_shared/commentQuality.js', 'utf8'), /trimmed\.length > 200/);
    assert.match(interactionSource, /댓글은 200자 이내로 적어 주세요\./);
});

test('DB RPC(create/update_my_post_comment_v1)는 8~200자 범위를 엄격히 검증한다', () => {
    assert.match(migrationSource, /char_length\(v_content\) > 200/);
    assert.match(migrationSource, /댓글은 8~200자로 작성해주세요\./);
    assert.doesNotMatch(migrationSource, /char_length\(v_content\) > 1000/);
});

test('vibe-ai Edge 함수는 200자 초과 및 비속어를 로컬에서 선제 차단하여 AI 호출 비용을 절감한다', () => {
    assert.match(edgeSource, /claim\.content \?\? ''\)\.trim\(\)\.slice\(0, 200\)/);
    assert.match(edgeSource, /commentTextIssue/);
    assert.match(readFileSync('supabase/functions/_shared/commentQuality.js', 'utf8'), /trimmed\.length > 200/);
    assert.match(edgeSource, /댓글은 200자 이내로 간결하고 다정하게 적어 주세요\./);
    assert.match(edgeSource, /INAPPROPRIATE_WORDS/);
    assert.match(edgeSource, /containsInappropriateWords/);
    assert.match(edgeSource, /친구에게 상처를 주는 말 대신 따뜻하고 고운 말을 써 주세요\./);
});

test('내 댓글이 확인 중이면 짧게 두 번만 다시 불러온다(상시 폴링 아님)', async () => {
  const source = await readFile('src/hooks/usePostInteractions.js', 'utf8');
  // 작성·수정 직후에만 시작하고, 4초 뒤 한 번 · 6초 뒤 한 번이 전부다.
  assert.match(source, /startFollowUp\(2\)/);
  assert.match(source, /armFollowUp\(4000\)/);
  assert.match(source, /armFollowUp\(6000\)/);
  assert.match(source, /followUpRef\.current\.left > 0/);
  // 탭이 가려져 있으면 부르지 않고, 화면을 떠나면 타이머를 지운다.
  assert.match(source, /if \(!document\.hidden\) void fetchRef\.current\?\.\(\)/);
  assert.match(source, /window\.clearTimeout\(followUpRef\.current\.timer\)/);
  // 주기적으로 도는 setInterval 은 없다.
  assert.doesNotMatch(source, /setInterval\(/);
});

import assert from 'node:assert/strict';
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
    assert.match(interactionSource, /trimmed\.length > 200/);
    assert.match(interactionSource, /댓글은 200자 이내로 적어 주세요\./);
});

test('DB RPC(create/update_my_post_comment_v1)는 8~200자 범위를 엄격히 검증한다', () => {
    assert.match(migrationSource, /char_length\(v_content\) > 200/);
    assert.match(migrationSource, /댓글은 8~200자로 작성해주세요\./);
    assert.doesNotMatch(migrationSource, /char_length\(v_content\) > 1000/);
});

test('vibe-ai Edge 함수는 200자 초과 및 비속어를 로컬에서 선제 차단하여 AI 호출 비용을 절감한다', () => {
    assert.match(edgeSource, /claim\.content \?\? ''\)\.trim\(\)\.slice\(0, 200\)/);
    assert.match(edgeSource, /trimmed\.length > 200/);
    assert.match(edgeSource, /댓글은 200자 이내로 간결하고 다정하게 적어 주세요\./);
    assert.match(edgeSource, /INAPPROPRIATE_WORDS/);
    assert.match(edgeSource, /containsInappropriateWords/);
    assert.match(edgeSource, /친구에게 상처를 주는 말 대신 따뜻하고 고운 말을 써 주세요\./);
});

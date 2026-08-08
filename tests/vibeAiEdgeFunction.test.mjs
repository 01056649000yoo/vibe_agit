import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const edgeSource = await readFile('supabase/functions/vibe-ai/index.ts', 'utf8');
const interactionSource = await readFile('src/hooks/usePostInteractions.js', 'utf8');
const safetySource = await readFile('src/utils/aiSafety.js', 'utf8');
const openaiClientSource = await readFile('src/lib/openai.js', 'utf8');
const interactionMigration = await readFile('supabase/migrations/20261010_friend_interaction_writes.sql', 'utf8');

test('vibe-ai는 클라이언트 API 키·모드·모델 오버라이드를 받지 않는다', () => {
    assert.doesNotMatch(edgeSource, /overrideApiKey|overrideApiMode/);
    assert.doesNotMatch(edgeSource, /const\s*\{[^}]*\bmodel\b[^}]*\}\s*=\s*await req\.json\(\)/s);
    assert.doesNotMatch(openaiClientSource, /body:\s*\{\s*model:/);
});

test('vibe-ai는 검증되지 않은 JWT 수동 디코딩과 키 일부 로그를 두지 않는다', () => {
    assert.doesNotMatch(edgeSource, /atob\(|jwtUserId|isTrustedClientRequest/);
    assert.doesNotMatch(edgeSource, /cleanApiKey\.slice|Key:\s*\$\{/);
    assert.match(edgeSource, /\['authorization', 'x-customer-auth', 'apikey'\]/);
});

test('댓글 판정은 서버가 본인 pending 댓글을 읽어 상태까지 기록한다', () => {
    assert.match(edgeSource, /\.eq\('id', commentId\)/);
    assert.match(edgeSource, /\.eq\('student_id', studentId\)/);
    assert.match(edgeSource, /pendingComment\.content/);
    assert.match(edgeSource, /moderated_by:\s*'ai'/);
    assert.match(edgeSource, /\.eq\('status', 'pending'\)/);
    assert.match(safetySource, /callAI\(\{ content, commentId, type: 'SAFETY_CHECK' \}\)/);
    assert.doesNotMatch(interactionSource, /record_comment_ai_review/);
});

test('캐시된 구버전 화면의 commentId 없는 호출도 인증 학생에게만 과도기 허용한다', () => {
    assert.match(edgeSource, /if \(!isStudentRequest \|\| !studentId\)/);
    assert.match(edgeSource, /if \(commentId != null\)/);
    assert.match(edgeSource, /const MAX_PROMPT_LENGTH = isStudentRequest \? 300 : 10000/);
});

test('댓글 수정은 먼저 pending으로 되돌리고 같은 댓글 ID로 다시 판정한다', () => {
    assert.match(interactionSource, /update_my_post_comment_v1/);
    assert.match(interactionMigration, /SET content=v_content,status='pending'/);
    assert.match(interactionSource, /checkContentSafety\(newContent, \{ commentId \}\)/);
});

test('댓글 판정만 100토큰·온도 0이며 일반 AI는 1000토큰을 유지한다', () => {
    assert.match(edgeSource, /max_tokens:\s*type === 'SAFETY_CHECK' \? 100 : 1000/);
    assert.match(edgeSource, /type === 'SAFETY_CHECK' \? \{ temperature: 0 \}/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const edgeSource = await readFile('supabase/functions/vibe-ai/index.ts', 'utf8');
const interactionSource = await readFile('src/hooks/usePostInteractions.js', 'utf8');
const safetySource = await readFile('src/utils/aiSafety.js', 'utf8');
const openaiClientSource = await readFile('src/lib/openai.js', 'utf8');
const interactionMigration = await readFile('supabase/migrations/20261010_friend_interaction_writes.sql', 'utf8');
const labBridgeMigration = await readFile('supabase/migrations/20261027_lab_ai_bridge.sql', 'utf8');

test('vibe-ai는 클라이언트 API 키·모드·모델 오버라이드를 받지 않는다', () => {
    assert.doesNotMatch(edgeSource, /overrideApiKey|overrideApiMode/);
    assert.doesNotMatch(edgeSource, /const\s*\{[^}]*\bmodel\b[^}]*\}\s*=\s*await req\.json\(\)/s);
    assert.doesNotMatch(openaiClientSource, /body:\s*\{\s*model:/);
});

test('vibe-ai는 검증되지 않은 JWT 수동 디코딩과 키 일부 로그를 두지 않는다', () => {
    assert.doesNotMatch(edgeSource, /atob\(|jwtUserId|isTrustedClientRequest/);
    assert.doesNotMatch(edgeSource, /cleanApiKey\.slice|Key:\s*\$\{/);
    assert.doesNotMatch(edgeSource, /req\.headers\.forEach|수신 헤더/);
});

test('댓글 판정은 서버가 본인 pending 댓글을 읽어 상태까지 기록한다', () => {
    assert.match(edgeSource, /claim_comment_ai_review_v1/);
    assert.match(edgeSource, /p_comment_id: commentId/);
    assert.match(edgeSource, /p_student_id: studentId/);
    assert.match(edgeSource, /finalPrompt = claim\.content/);
    assert.match(edgeSource, /moderated_by:\s*'ai'/);
    assert.match(edgeSource, /\.eq\('status', 'pending'\)/);
    assert.match(edgeSource, /\.eq\('ai_review_token', reviewToken\)/);
    assert.match(safetySource, /callAI\(\{ content, commentId, type: 'SAFETY_CHECK' \}\)/);
    assert.doesNotMatch(interactionSource, /record_comment_ai_review/);
});

test('commentId 없는 구버전 댓글 판정 경로는 더 이상 허용하지 않는다', () => {
    assert.match(edgeSource, /typeof commentId !== 'string' \|\| !commentId/);
    assert.doesNotMatch(edgeSource, /commentId != null/);
    assert.match(edgeSource, /const maxPromptLength = isStudentRequest \? 300 : \(type === 'SPELLING_DRAFT' \? 80 : 10000\)/);
});

test('맞춤법 초안은 승인 교사 전용 속도 제한과 짧은 입력 상한을 사용한다', () => {
    assert.match(edgeSource, /'SPELLING_DRAFT'/);
    assert.match(edgeSource, /type === 'SPELLING_DRAFT' \? 80 : 10000/);
    assert.match(edgeSource, /consume_ai_request_v1/);
    assert.match(edgeSource, /반드시 마크다운 없이 다음 JSON 객체 하나만 답해줘/);
});

test('댓글 수정은 먼저 pending으로 되돌리고 같은 댓글 ID로 다시 판정한다', () => {
    assert.match(interactionSource, /update_my_post_comment_v1/);
    assert.match(interactionMigration, /SET content=v_content,status='pending'/);
    assert.match(interactionSource, /checkContentSafety\(newContent, \{ commentId \}\)/);
});

test('댓글 판정만 100토큰·온도 0이며 일반 AI는 1000토큰을 유지한다', () => {
    assert.match(edgeSource, /max_tokens:\s*isStudentRequest \? 100 : 1000/);
    assert.match(edgeSource, /isStudentRequest \? \{ temperature: 0 \}/);
});

test('연구소 AI는 실제 연구소 로그인과 승인 교사 매핑을 모두 확인한다', () => {
    assert.match(edgeSource, /type === 'LAB_GENERAL'/);
    assert.match(edgeSource, /X-Lab-Auth/);
    assert.match(edgeSource, /X-Lab-Anon-Key/);
    assert.match(edgeSource, /\/auth\/v1\/user/);
    assert.match(edgeSource, /if \(!labUserResponse\.ok\) continue/);
    assert.match(edgeSource, /supabaseUrl\.replace/);
    assert.match(edgeSource, /legacyLabSupabaseUrl/);
    assert.match(edgeSource, /resolve_lab_ai_teacher_v1/);
    assert.match(edgeSource, /p_actor_id: targetTeacherId/);
    assert.match(labBridgeMigration, /ALTER TABLE public\.lab_ai_teacher_links ENABLE ROW LEVEL SECURITY/);
    assert.match(labBridgeMigration, /REVOKE ALL ON TABLE public\.lab_ai_teacher_links FROM PUBLIC, anon, authenticated/);
    assert.match(labBridgeMigration, /v_profile\.is_approved IS TRUE/);
    assert.match(labBridgeMigration, /v_profile\.approval_revoked_at IS NULL/);
    assert.doesNotMatch(edgeSource, /Access-Control-Allow-Headers[^\n]*x-lab-auth/i);
});

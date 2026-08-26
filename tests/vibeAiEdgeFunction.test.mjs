import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const edgeSource = await readFile('supabase/functions/vibe-ai/index.ts', 'utf8');
const interactionSource = await readFile('src/hooks/usePostInteractions.js', 'utf8');
const safetySource = await readFile('src/utils/aiSafety.js', 'utf8');
const openaiClientSource = await readFile('src/lib/openai.js', 'utf8');
const interactionMigration = await readFile('supabase/migrations/20261010_friend_interaction_writes.sql', 'utf8');
const queueMigration = await readFile('supabase/migrations/20261180_comment_ai_review_queue.sql', 'utf8');
const labBridgeMigration = await readFile('supabase/migrations/20261027_lab_ai_bridge.sql', 'utf8');
const bypassMigration = await readFile('supabase/migrations/20261183_close_legacy_comment_review_bypass.sql', 'utf8');

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
    assert.match(edgeSource, /\.from\('post_comments'\)[\s\S]{0,180}\.eq\('student_id', studentId\)/);
    assert.match(edgeSource, /EdgeRuntime\.waitUntil\(drainCommentSafetyQueue\(supabaseAdmin\)\)/);
    assert.match(edgeSource, /claim_next_comment_ai_review_v2/);
    assert.match(edgeSource, /complete_comment_ai_review_v2/);
    assert.match(edgeSource, /fail_comment_ai_review_v2/);
    assert.match(queueMigration, /WHERE id = p_comment_id[\s\S]{0,180}ai_review_token = p_review_token/);
    assert.match(safetySource, /callAI\(\{ commentId, type: 'SAFETY_CHECK' \}\)/);
    assert.doesNotMatch(safetySource, /callAI\(\{ content,/);
    assert.doesNotMatch(interactionSource, /record_comment_ai_review/);
});

test('학생이 스스로 댓글을 승인하던 구형 판정 함수는 DB에서 지워 둔다', () => {
    // 앱이 부르지 않는 것만으로는 부족하다 — 이 함수는 SECURITY DEFINER 인데 `authenticated` 에게
    // 열려 있어서, 브라우저에서 한 번 부르면 자기 pending 댓글이 곧바로 approved 가 됐다.
    // 대기열이 유일한 판정 경로가 되도록 함수 자체를 지운 상태를 못 박는다.
    assert.match(bypassMigration, /DROP FUNCTION IF EXISTS public\.record_comment_ai_review\(UUID, BOOLEAN, TEXT\)/);
    assert.match(bypassMigration, /DROP FUNCTION IF EXISTS public\.claim_comment_ai_review_v1\(UUID, UUID\)/);
    assert.match(bypassMigration, /RAISE EXCEPTION '구형 댓글 판정 함수가 남아 있습니다\.'/);
});

test('commentId 없는 구버전 댓글 판정 경로는 더 이상 허용하지 않는다', () => {
    assert.match(edgeSource, /typeof commentId !== 'string' \|\| !commentId/);
    assert.doesNotMatch(edgeSource, /commentId != null/);
    // 학생 입력 상한은 그대로 300자, 맞춤법 검사만 서버가 읽은 본문을 담아 6000자까지 쓴다.
    assert.match(edgeSource, /type === 'SPELL_CHECK' \? 6000 : 300/);
    assert.match(edgeSource, /type === 'SPELLING_DRAFT' \? 80 : 10000/);
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
    assert.match(queueMigration, /status = 'pending'[\s\S]{0,300}ai_review_attempts = 0/);
    assert.match(interactionSource, /checkContentSafety\('', \{ commentId \}\)/);
});

test('댓글 판정은 100토큰·온도 0, 맞춤법 검사는 900토큰, 일반 AI는 1000토큰이다', () => {
    assert.match(edgeSource, /max_tokens: 100,[\s\S]{0,40}temperature: 0/);
    assert.match(edgeSource, /max_tokens: type === 'SPELL_CHECK' \? 900 : \(isStudentRequest \? 100 : 1000\)/);
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

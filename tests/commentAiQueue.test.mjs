import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [composer, postDetail, studentWriting, interactions, edge, migration, admin, pointTypes, guides] = await Promise.all([
    readFile('src/components/student/CommentComposer.jsx', 'utf8'),
    readFile('src/components/student/PostDetailModal.jsx', 'utf8'),
    readFile('src/components/student/StudentWriting.jsx', 'utf8'),
    readFile('src/hooks/usePostInteractions.js', 'utf8'),
    readFile('supabase/functions/vibe-ai/index.ts', 'utf8'),
    readFile('supabase/migrations/20261180_comment_ai_review_queue.sql', 'utf8'),
    readFile('src/components/admin/AdminServicePanel.jsx', 'utf8'),
    readFile('src/modules/points/pointTypes.js', 'utf8'),
    readFile('src/constants/teacherGuides.js', 'utf8')
]);

const extractLowEffortComments = (source) => {
    const block = source.match(/LOW_EFFORT_COMMENTS\s*=\s*new Set\(\[([\s\S]*?)\]\)/)?.[1] ?? '';
    return [...block.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
};

test('학생 댓글은 저장 전에 공통 확인 화면을 반드시 거친다', () => {
    assert.match(composer, /내가 쓴 댓글을 한 번 읽어 보세요/);
    assert.match(composer, /고쳐 쓰기/);
    assert.match(composer, /확인하고 등록/);
    assert.match(composer, /onSubmit=\{confirm\}/);
    assert.match(composer, /autoFocus/);
    assert.ok(composer.indexOf('setReviewing(true)') < composer.indexOf('await onConfirm(trimmed)'));
    assert.match(postDetail, /<CommentComposer/);
    assert.match(studentWriting, /<CommentComposer/);
    assert.doesNotMatch(postDetail, /<form onSubmit=\{handleCommentSubmit\}/);
    assert.doesNotMatch(studentWriting, /<form onSubmit=\{handleCommentSubmit\}/);
});

test('브라우저는 pending 저장 뒤 대기열만 깨우고 포인트·AI 결과를 직접 처리하지 않는다', () => {
    assert.match(interactions, /status: 'pending'/);
    assert.match(interactions, /checkContentSafety\('', \{ commentId: newCommentId \}\)/);
    assert.match(interactions, /checkContentSafety\('', \{ commentId \}\)/);
    assert.doesNotMatch(interactions, /reward_for_comment/);
    assert.doesNotMatch(interactions, /safety\.is_appropriate/);
});

test('브라우저 안내와 서버 차단은 같은 짧은 댓글 기준을 쓴다', () => {
    assert.deepEqual(extractLowEffortComments(interactions), extractLowEffortComments(edge));
    assert.match(interactions, /compact\.length < 8/);
    assert.match(edge, /compact\.length < 8/);
    assert.match(edge, /slice\(0, 1000\)/);
});

test('댓글 AI 대기열은 전역 3칸·2회 시도·만료 회수를 DB에서 보장한다', () => {
    assert.match(migration, /VALUES \(1\), \(2\), \(3\)/);
    assert.match(migration, /slot_no BETWEEN 1 AND 3/);
    assert.match(migration, /FOR UPDATE SKIP LOCKED/);
    assert.match(migration, /ai_review_attempts BETWEEN 0 AND 2/);
    assert.match(migration, /ai_review_attempts < 2/);
    assert.match(migration, /lease_until <= v_now/);
    assert.match(migration, /legacy_pending/);
    assert.match(migration, /SET ai_review_attempts = 2[\s\S]{0,260}WHERE status = 'pending'/);
    assert.match(migration, /update_my_post_comment_v1[\s\S]*AND ai_review_token IS NULL/);
});

test('Edge 작업기는 즉시 응답 뒤 최대 세 슬롯을 사용하고 중첩 클라이언트 재시도를 만들지 않는다', () => {
    assert.match(edge, /EdgeRuntime\.waitUntil\(drainCommentSafetyQueue\(supabaseAdmin\)\)/);
    assert.match(edge, /processed < 60/);
    assert.match(edge, /Date\.now\(\) - startedAt < 90_000/);
    assert.match(edge, /claim_next_comment_ai_review_v2/);
    assert.match(edge, /complete_comment_ai_review_v2/);
    assert.match(edge, /fail_comment_ai_review_v2/);
    assert.match(edge, /commentLocalRejectionReason/);
    assert.match(edge, /AbortSignal\.timeout\(20_000\)/);
});

test('승인과 댓글 5P는 같은 서버 트랜잭션에서 안정 키로 한 번만 기록한다', () => {
    assert.match(migration, /public\.point_engine_apply\(/);
    assert.match(migration, /'comment_reward'/);
    assert.match(migration, /format\('comment-post:%s', v_comment\.post_id\)/);
    assert.match(migration, /'comment_id', v_comment\.id/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.reward_for_comment\(UUID\) FROM PUBLIC, anon, authenticated/);
    assert.match(pointTypes, /COMMENT_REWARD: 'comment_reward'/);
});

test('관리자 서비스 현황 한 번의 응답에 댓글 대기열 상태를 포함한다', () => {
    assert.match(migration, /'comment_ai_queue', v_comment_queue/);
    assert.match(migration, /'queued'/);
    assert.match(migration, /'processing'/);
    assert.match(migration, /'needs_teacher'/);
    assert.match(migration, /'oldest_wait_seconds'/);
    assert.match(admin, /댓글 AI 검사 대기열/);
    assert.match(admin, /comment_ai_queue/);
    assert.equal((admin.match(/admin_get_service_overview_v1/g) ?? []).length, 1);
});

test('교사 도움말은 학생 확인·3건 대기열·실패 댓글 처리 흐름을 함께 안내한다', () => {
    const commentsGuide = guides.slice(guides.indexOf('comments: {'), guides.indexOf("'student-agits':"));
    assert.match(commentsGuide, /내가 쓴 댓글을 한 번 읽어 보세요/);
    assert.match(commentsGuide, /최대 3건씩/);
    assert.match(commentsGuide, /두 번 실패/);
    assert.match(commentsGuide, /포인트.*한 번만 지급/);
});

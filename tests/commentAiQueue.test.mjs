import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
    composer,
    postDetail,
    studentWriting,
    interactions,
    edge,
    queueMigration,
    retirementMigration,
    readerMigration,
    admin,
    pointTypes,
    guides,
    playground,
    footprint,
    writerLevels
] = await Promise.all([
    readFile('src/components/student/CommentComposer.jsx', 'utf8'),
    readFile('src/components/student/PostDetailModal.jsx', 'utf8'),
    readFile('src/components/student/StudentWriting.jsx', 'utf8'),
    readFile('src/hooks/usePostInteractions.js', 'utf8'),
    readFile('supabase/functions/vibe-ai/index.ts', 'utf8'),
    readFile('supabase/migrations/20261180_comment_ai_review_queue.sql', 'utf8'),
    readFile('supabase/migrations/20261181_retire_comment_point_reward.sql', 'utf8'),
    readFile('supabase/migrations/20260809_reader_title_indexes.sql', 'utf8'),
    readFile('src/components/admin/AdminServicePanel.jsx', 'utf8'),
    readFile('src/modules/points/pointTypes.js', 'utf8'),
    readFile('src/constants/teacherGuides.js', 'utf8'),
    readFile('src/components/student/AgitPlayground.jsx', 'utf8'),
    readFile('src/modules/writing/writing-footprint/FootprintVisuals.jsx', 'utf8'),
    readFile('src/constants/writerLevels.js', 'utf8')
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
    assert.match(queueMigration, /VALUES \(1\), \(2\), \(3\)/);
    assert.match(queueMigration, /slot_no BETWEEN 1 AND 3/);
    assert.match(queueMigration, /FOR UPDATE SKIP LOCKED/);
    assert.match(queueMigration, /ai_review_attempts BETWEEN 0 AND 2/);
    assert.match(queueMigration, /ai_review_attempts < 2/);
    assert.match(queueMigration, /lease_until <= v_now/);
    assert.match(queueMigration, /legacy_pending/);
    assert.match(queueMigration, /SET ai_review_attempts = 2[\s\S]{0,260}WHERE status = 'pending'/);
    assert.match(queueMigration, /update_my_post_comment_v1[\s\S]*AND ai_review_token IS NULL/);
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

test('댓글 승인 경로와 활성 포인트 계약에서 신규 댓글 보상을 완전히 제거한다', () => {
    const completion = retirementMigration.slice(
        retirementMigration.indexOf('CREATE OR REPLACE FUNCTION public.complete_comment_ai_review_v2'),
        retirementMigration.indexOf('REVOKE ALL ON FUNCTION public.complete_comment_ai_review_v2')
    );
    assert.match(completion, /status = CASE WHEN p_is_appropriate THEN 'approved' ELSE 'blocked' END/);
    assert.doesNotMatch(completion, /point_engine_apply|comment_reward|points_awarded/);
    assert.match(retirementMigration, /DROP FUNCTION IF EXISTS public\.reward_for_comment\(UUID\)/);
    assert.doesNotMatch(pointTypes, /COMMENT_REWARD|comment_reward/);
    assert.doesNotMatch(postDetail, /댓글 쓰면 5P|댓글.*5P/);
});

test('과거 댓글 포인트는 이전 기록으로 남고 원장 삭제 SQL은 만들지 않는다', () => {
    assert.match(playground, /comment_reward: '친구 댓글 보상 · 이전 기록'/);
    assert.match(footprint, /comment_reward: '친구 댓글\(이전 기록\)'/);
    assert.doesNotMatch(retirementMigration, /DELETE\s+FROM\s+public\.point_logs/i);
    assert.doesNotMatch(retirementMigration, /DROP\s+(?:TABLE|COLUMN)[\s\S]*comment_reward/i);
});

test('승인된 친구 댓글은 포인트와 독립된 소통 칭호 성장으로 계속 인정한다', () => {
    assert.match(readerMigration, /c\.status = 'approved'/);
    assert.match(readerMigration, /p\.student_id <> v_student_id/);
    assert.match(readerMigration, /SUM\(1 \+ LEAST\(comment_chars \/ 20, 3\)\)/);
    assert.match(writerLevels, /등수·포인트 보상과는 연결하지 않고 자기 성장 표시로만 사용한다/);
});

test('관리자 서비스 현황 한 번의 응답에 댓글 대기열 상태를 포함한다', () => {
    assert.match(queueMigration, /'comment_ai_queue', v_comment_queue/);
    assert.match(queueMigration, /'queued'/);
    assert.match(queueMigration, /'processing'/);
    assert.match(queueMigration, /'needs_teacher'/);
    assert.match(queueMigration, /'oldest_wait_seconds'/);
    assert.match(admin, /댓글 AI 검사 대기열/);
    assert.match(admin, /comment_ai_queue/);
    assert.equal((admin.match(/admin_get_service_overview_v1/g) ?? []).length, 1);
});

test('교사 도움말은 학생 확인·3건 대기열·실패 댓글 처리 흐름을 함께 안내한다', () => {
    const commentsGuide = guides.slice(guides.indexOf('comments: {'), guides.indexOf("'student-agits':"));
    assert.match(commentsGuide, /내가 쓴 댓글을 한 번 읽어 보세요/);
    assert.match(commentsGuide, /최대 3건씩/);
    assert.match(commentsGuide, /두 번 실패/);
    assert.match(commentsGuide, /포인트 대신 \*\*소통 칭호 성장\*\*/);
    assert.match(commentsGuide, /과거에 받은 댓글 포인트와 내역은 그대로 유지/);
});

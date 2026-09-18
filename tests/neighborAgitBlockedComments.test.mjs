import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * AI가 막은 우리 반 댓글을 교사가 검토함에서 되살리거나 지우는 길(2026-09-17 `20261308`).
 * 들어올 때 검사가 하나도 없었다 — 되살리면 상대 학급에 보이고 지우면 안 보인다는 계약이
 * 조용히 깨져도 아무도 못 잡는 상태였다(2026-09-18 점검).
 */
const [review, badge, order, readSide, teacherApi, entry] = await Promise.all([
    readFile('supabase/migrations/20261308_neighbor_blocked_comment_review.sql', 'utf8'),
    readFile('supabase/migrations/20261309_neighbor_badge_includes_blocked.sql', 'utf8'),
    readFile('supabase/migrations/20261310_neighbor_blocked_count_and_order.sql', 'utf8'),
    readFile('supabase/migrations/20261240_neighbor_publication_matching_hardening.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/teacherApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8')
]);

const functionSource = (source, name) => {
    const start = source.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const next = source.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
    return source.slice(start, next < 0 ? source.length : next);
};

test('막힌 댓글은 그 학생의 담임만 처리한다', () => {
    const fn = functionSource(review, 'review_neighbor_blocked_comment_v1');
    // 공간 참여 교사인지 + 그 학급이 내 학급인지, 둘 다 본다.
    assert.match(fn, /assert_neighbor_participating_teacher_v1\(p_space_id, p_actor_class_id\)/);
    assert.match(fn, /v_comment\.class_id <> p_actor_class_id/);
    // 막힌 댓글이 아닌 것을 건드리지 못한다.
    assert.match(fn, /v_comment\.status <> 'blocked'/);
    assert.match(fn, /p_action NOT IN \('restore', 'delete'\)/);
    // 남이 부를 수 없다.
    assert.match(review, /REVOKE ALL ON FUNCTION public\.review_neighbor_blocked_comment_v1[\s\S]*?FROM PUBLIC, anon/);
    assert.match(review, /GRANT EXECUTE ON FUNCTION public\.review_neighbor_blocked_comment_v1[\s\S]*?TO authenticated/);
});

test('되살리면 상대 학급에 보이고, 지우면 본문까지 비운다', () => {
    const fn = functionSource(review, 'review_neighbor_blocked_comment_v1');
    assert.match(fn, /CASE WHEN p_action = 'restore' THEN 'visible' ELSE 'deleted' END/);
    assert.match(fn, /content = CASE WHEN p_action = 'delete' THEN '' ELSE content END/);
    // 글을 읽는 쪽은 'visible' 만 보므로 되살린 댓글이 곧바로 보인다.
    assert.match(readSide, /comment\.status = 'visible'/);
});

test('배지 수는 자르기 전 전체를 센다 — 메뉴와 검토함이 같은 수를 말해야 한다', () => {
    const workspace = functionSource(order, 'get_neighbor_teacher_workspace_v1');
    const menu = functionSource(badge, 'get_neighbor_teacher_badge_v1');

    // 메뉴 배지: 막힌 댓글 전체를 세어 처리할 일 수에 더한다.
    assert.match(menu, /INTO v_blocked[\s\S]*?comment\.status = 'blocked'/);
    assert.match(menu, /v_reviews \+ v_approvals \+ v_joins \+ v_blocked/);

    // 검토함 배지: 세는 문장이 LIMIT 100 **앞**에 있어야 한다.
    const countAt = workspace.indexOf('INTO v_blocked_count');
    const limitAt = workspace.lastIndexOf('LIMIT 100');
    assert.ok(countAt >= 0 && limitAt >= 0, '세는 문장과 LIMIT 을 찾지 못했습니다.');
    assert.ok(countAt < limitAt, '막힌 댓글 수를 LIMIT 100 안에서 세면 메뉴 배지와 어긋납니다.');
    // 세는 문장 자체에 LIMIT 이 붙어 있으면 안 된다.
    const countStatement = workspace.slice(countAt, workspace.indexOf(';', countAt));
    assert.doesNotMatch(countStatement, /LIMIT/);
});

test('목록은 자르기 전에 최신순으로 정렬한다', () => {
    const workspace = functionSource(order, 'get_neighbor_teacher_workspace_v1');
    const limitAt = workspace.lastIndexOf('LIMIT 100');
    const whereAt = workspace.lastIndexOf("comment.status = 'blocked'", limitAt);
    assert.ok(whereAt >= 0 && limitAt > whereAt, '막힌 댓글 목록 질의를 찾지 못했습니다.');
    // 자르기 직전에 순서를 정해야 아무 100건이 아니라 최신 100건이 나온다.
    const beforeLimit = workspace.slice(whereAt, limitAt);
    assert.ok(
        beforeLimit.includes('ORDER BY comment.created_at DESC'),
        'LIMIT 100 앞에 ORDER BY 가 없으면 어떤 100건이 보일지 정해지지 않습니다.'
    );
});

test('화면은 처리 뒤 작업 공간을 다시 읽고, 100건이 넘으면 남은 수를 알린다', () => {
    assert.match(teacherApi, /review_neighbor_blocked_comment_v1/);
    assert.match(teacherApi, /blocked_comments: Array\.isArray\(data\.blocked_comments\)/);
    // 처리한 뒤 다시 읽지 않으면 배지와 목록이 옛것으로 남는다.
    assert.match(entry, /reviewBlockedComment\([\s\S]{0,200}?setWorkspace\(await api\.getWorkspace\(classId\)\)/);
    assert.match(entry, /막힌 댓글 \{notif\.blocked_comments\}건 중 최신/);
});

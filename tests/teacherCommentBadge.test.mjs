import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 학급 운영 메뉴의 "처리할 학생 댓글" 배지(2026-09-18 요청).
 * 독서록·일기는 미확인 글이 있으면 메뉴에 표시가 뜨는데 학생 댓글만 아무 표시가 없어,
 * 아이가 남긴 댓글이 막힌 채 방치되는 일이 있었다.
 *
 * 여기서 지키는 것은 하나다 — **배지 숫자와 화면 숫자가 같아야 한다.**
 * 갈리면 배지를 보고 들어갔는데 처리할 것이 없는 일이 생긴다.
 */
const [badge, listRpc, dashboard, hub, manager] = await Promise.all([
    readFile('supabase/migrations/20261312_teacher_comment_todo_badge.sql', 'utf8'),
    readFile('supabase/migrations/20260918_comment_counts_match_list.sql', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherOperationsHub.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherCommentManager.jsx', 'utf8')
]);

test('배지와 목록은 같은 기준으로 센다 — 막힘 + 확인 대기', () => {
    // 화면의 `처리할 것` 정의.
    assert.ok(listRpc.includes("status IN ('blocked', 'pending')"), '목록 쪽 기준이 바뀌었습니다.');
    // 배지도 같은 상태를 센다.
    assert.ok(badge.includes("c.status IN ('blocked', 'pending')"), '배지가 다른 상태를 셉니다.');

    // 조인도 같아야 한다 — 학생이나 원글이 없어진 댓글은 양쪽 모두에서 빠진다.
    for (const fragment of [
        'JOIN public.students writer',
        'writer.id = c.student_id AND writer.class_id = c.class_id',
        'JOIN public.student_posts p',
        'p.id = c.post_id AND p.class_id = c.class_id'
    ]) {
        assert.ok(listRpc.includes(fragment), `목록 쪽에 없는 조인: ${fragment}`);
        assert.ok(badge.includes(fragment), `배지 쪽에 없는 조인: ${fragment}`);
    }
});

test('배지는 남의 학급을 세지 않고, 권한이 없으면 0 을 준다', () => {
    // 메뉴를 그릴 때마다 불리므로 오류 대신 0 이어야 메뉴가 깨지지 않는다.
    assert.ok(badge.includes("RETURN jsonb_build_object('count', 0);"), '권한 없을 때 0 을 주지 않습니다.');
    assert.ok(badge.includes('c.teacher_id = auth.uid()'), '담임 확인이 없습니다.');
    assert.ok(badge.includes('c.class_id = p_class_id'), '학급 범위가 없습니다.');
    assert.match(badge, /REVOKE ALL ON FUNCTION public\.get_teacher_comment_todo_badge_v1[\s\S]*?FROM PUBLIC, anon/);
    assert.match(badge, /GRANT EXECUTE ON FUNCTION public\.get_teacher_comment_todo_badge_v1[\s\S]*?TO authenticated/);
});

test('처리하면 배지가 줄어든다 — 화면이 센 수를 그대로 올려 준다', () => {
    /*
     * 처음 한 번만 세고 끝내면, 교사가 댓글을 다 처리해도 숫자가 남아 지울 수 없는 배지가 된다.
     * 그래서 목록 화면이 다시 셀 때마다 그 수를 위로 올린다.
     */
    assert.ok(manager.includes('onTodoCountChange'), '댓글 화면이 수를 위로 올리지 않습니다.');
    assert.ok(manager.includes('onTodoCountChange?.(Number(data?.counts?.todo ?? 0))'),
        '화면이 센 수가 아니라 다른 값을 올립니다.');
    assert.ok(hub.includes('onTodoCountChange={onCommentTodoChange}'), '허브가 연결을 끊었습니다.');
    assert.ok(dashboard.includes('onCommentTodoChange={setCommentTodoBadge}'), '대시보드가 받지 않습니다.');
});

test('배지는 학급 운영 메뉴와 학생 댓글 탭 두 곳에 뜬다', () => {
    // 2026-09-26: 배지는 teacherNavBadges.js 한 규칙으로 센다 — 학생 댓글 수가 학급 운영 상단 숫자에 더해진다.
    assert.ok(dashboard.includes('comments: commentTodoBadge'), '학생 댓글 수가 배지 계산에 들어가지 않습니다.');
    assert.ok(dashboard.includes('${tab.label} 처리할 일'), '세부 메뉴 배지 설명(aria-label)이 없습니다.');
    assert.ok(dashboard.includes('${group.label} 처리할 일'), '상단 메뉴 배지 설명(aria-label)이 없습니다.');
});

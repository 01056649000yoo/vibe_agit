import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 모두의 아지트 — 같이 쓰기 광장 기한 + 검토함·메뉴 배지 한 기준 (2026-09-23 `20261333`).
 *
 *  1. 주제를 만들 때 글쓰기 마감·댓글·반응 마감을 정한다. 글쓰기 마감이 지나면 cron 이 활동을 닫는다.
 *  2. 활동 종료는 "글쓰기만" / "댓글·반응까지" 를 고른다.
 *  3. 메뉴 배지와 검토함 배지는 같은 셋(주제 승인·막힌 댓글·호스트의 참여 신청)을 센다.
 *     처리하면 메뉴 숫자도 바로 줄어든다(예전에는 학급을 바꿀 때만 셌다).
 */
const [sql, teacherApi, entry, student, dashboard, guides] = await Promise.all([
    readFile('supabase/migrations/20261333_neighbor_topic_schedule_and_badge.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/teacherApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/constants/teacherGuides.js', 'utf8')
]);

const functionSource = (source, name) => {
    const start = source.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const end = source.indexOf('$$;', start);
    return source.slice(start, end < 0 ? source.length : end);
};

test('기한 설정은 한 함수로 합치고 옛 판은 같은 마이그레이션에서 지운다', () => {
    assert.match(sql, /ADD COLUMN IF NOT EXISTS writing_close_at TIMESTAMPTZ/);
    assert.match(sql, /DROP FUNCTION IF EXISTS public\.set_neighbor_activity_deadline_v1\(UUID, UUID, UUID, TIMESTAMPTZ\)/);
    assert.doesNotMatch(teacherApi, /set_neighbor_activity_deadline_v1/);
    assert.match(teacherApi, /rpc\('set_neighbor_activity_schedule_v1'/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.set_neighbor_activity_schedule_v1\(UUID, UUID, UUID, JSONB\) TO authenticated/);
});

test('기한 함수: 들어온 키만 바꾸고, 글쓰기 마감은 호스트·제안 학급만, 앞으로의 시각만', () => {
    const fn = functionSource(sql, 'set_neighbor_activity_schedule_v1');
    assert.match(fn, /assert_neighbor_participating_teacher_v1\(p_space_id, p_actor_class_id\)/);
    // 키가 없으면 지금 값을 그대로 둔다 — 한쪽만 고쳐도 다른 쪽이 지워지지 않는다.
    assert.match(fn, /v_writing := v_activity\.writing_close_at/);
    assert.match(fn, /v_comments := v_activity\.comments_close_at/);
    assert.match(fn, /p_changes \? 'writing_close_at'/);
    assert.match(fn, /p_changes \? 'comments_close_at'/);
    // 글쓰기 마감 = 활동 종료와 같은 힘이므로 호스트나 제안 학급만.
    assert.match(fn, /space\.host_class_id = p_actor_class_id/);
    assert.match(fn, /approval\.is_proposer/);
    assert.match(fn, /v_writing IS NOT NULL AND v_writing <= NOW\(\)/);
    // 댓글 마감은 지난 시각을 "지금 마감" 으로 받는다(활동 종료와 함께 닫기).
    assert.match(fn, /v_comments < NOW\(\) THEN\s+v_comments := NOW\(\)/);
});

test('글쓰기 마감이 지나면 cron 이 활동 종료와 같은 일을 한다', () => {
    const fn = functionSource(sql, 'close_due_neighbor_activities_v1');
    assert.match(fn, /status IN \('pending_approval', 'open'\)/);
    assert.match(fn, /writing_close_at <= NOW\(\)/);
    assert.match(fn, /SET status = 'closed', closed_at = NOW\(\)/);
    assert.match(fn, /SET is_archived = TRUE/);
    // 승인 전에 닫힌 제안의 승인 대기는 취소한다 — 남으면 배지가 지워지지 않는다.
    assert.match(fn, /SET status = 'cancelled'[\s\S]*?status = 'pending'/);
    // 브라우저에서는 부를 수 없다(cron 전용).
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.close_due_neighbor_activities_v1\(\)\s+FROM PUBLIC, anon, authenticated, service_role/);
    assert.doesNotMatch(sql, /GRANT EXECUTE ON FUNCTION public\.close_due_neighbor_activities_v1/);
    assert.match(sql, /cron\.schedule\(\s+'neighbor-close-due-activities', '\*\/5 \* \* \* \*'/);
});

test('교사·학생 활동 목록이 두 기한을 싣는다', () => {
    assert.match(functionSource(sql, 'get_neighbor_teacher_activities_v1'), /'writing_close_at', activity\.writing_close_at/);
    const studentList = functionSource(sql, 'get_neighbor_student_activities_v1');
    assert.match(studentList, /'writing_close_at', activity\.writing_close_at/);
    assert.match(studentList, /'comments_close_at', activity\.comments_close_at/);
});

test('메뉴 배지와 검토함은 같은 셋을 센다 — 옛 학생 공개 요청 수는 빠진다', () => {
    const badge = functionSource(sql, 'get_neighbor_teacher_badge_v1');
    assert.doesNotMatch(badge, /v_reviews/);
    assert.match(badge, /'count', v_approvals \+ v_joins \+ v_blocked/);
    assert.match(entry, /reviewInboxCount = \(notif\.pending_approvals \|\| 0\) \+ \(notif\.blocked_comments \|\| 0\) \+ \(notif\.pending_joins \|\| 0\)/);
    // 검토함 창에 참여 신청 칸이 있어야 숫자에 든 것을 거기서 처리할 수 있다.
    assert.match(entry, /🚪 참여 신청/);
});

test('처리하면 메뉴 숫자가 바로 줄어든다', () => {
    // 2026-09-25: 메뉴 숫자 = 검토함(처리할 일) + 새 소식(새 이웃 글·댓글·문집). 처리하면 검토함 몫이 바로 준다.
    assert.match(entry, /const menuCount = reviewInboxCount \+ \(notif\.new_posts \|\| 0\) \+ \(notif\.new_comments \|\| 0\) \+ \(notif\.new_books \|\| 0\);/);
    assert.match(entry, /onTodoCountChange\?\.\(menuCount\)/);
    assert.match(dashboard, /<TeacherNeighborAgit [^>]*onTodoCountChange=\{setNeighborBadge\}/);
});

test('활동 종료는 글쓰기만/댓글·반응까지를 고르고, 뒤쪽은 댓글 마감을 지금으로 둔다', () => {
    // 2026-09-25: 자세히 보기 모달 안에서 누르면 모달을 먼저 닫고 종료 방법 창을 연다.
    assert.match(entry, /onClick=\{\(\) => \{ setTopicDetailId\(null\); setCloseActivityFor\(activity\); \}\}>활동 종료/);
    assert.match(entry, /글쓰기만 마치기/);
    assert.match(entry, /댓글·반응까지 함께 마치기/);
    const closeAt = entry.indexOf('const closeActivity = async');
    assert.ok(closeAt >= 0, 'closeActivity 가 없습니다.');
    const closeFn = entry.slice(closeAt, entry.indexOf('\n    };\n', closeAt));
    assert.match(closeFn, /runAction\('close_activity'/);
    assert.match(closeFn, /changes: \{ comments_close_at: new Date\(\)\.toISOString\(\) \}/);
});

test('주제 만들기에 기한 단계가 있고, 제안 직후 같은 활동에 기한을 붙인다', () => {
    assert.match(entry, /<h3>기한 <small>\(선택\)<\/small><\/h3>/);
    const create = entry.slice(entry.indexOf('const createActivity = async'), entry.indexOf('const selectActivityTab'));
    assert.match(create, /activityId: result\.activity_id/);
    assert.match(create, /기한은 지금 이후로 정해 주세요/);
});

test('작은 정리: 상한은 정본 상수, 브라우저 기본 확인 창과 없앤 요청 문구가 없다', () => {
    assert.match(entry, /참여 학급 \{activeMemberships\.length\}\/\{NEIGHBOR_AGIT_LIMITS\.maxClassesPerSpace\}/);
    assert.doesNotMatch(entry, /\/4<\/h3>/);
    assert.doesNotMatch(entry, /window\.confirm\(/);
    assert.doesNotMatch(entry, /요청 대기/);
    assert.doesNotMatch(entry, /검토 \{item\.review_count\}/);
    assert.doesNotMatch(entry, /선택 학급 제한 공개/);
    assert.doesNotMatch(entry, /학생 공개 (ON|OFF|켜기|끄기)/);
});

test('학생: 마감이 지나면 글쓰기 단추가 없고, 틀린 안내 문구가 없다', () => {
    assert.match(student, /const isWritingClosed = \(activity\) => activity\.status === 'closed'/);
    assert.match(student, /\{!isWritingClosed\(activity\) && !activity\.is_submitted && <Button/);
    assert.doesNotMatch(student, /호스트 선생님이 활동을 열면/);
    assert.doesNotMatch(student, /소개해 주세요/);
});

test('도움말이 새 흐름을 말한다', () => {
    const guide = guides.slice(guides.indexOf("'neighbor-agit': {"), guides.indexOf('dashboard: {'));
    assert.match(guide, /글쓰기 마감/);
    assert.match(guide, /댓글·반응까지 함께 마치기/);
    assert.match(guide, /학생 입장/);
    assert.doesNotMatch(guide, /공개 요청을 승인/);
});

test('틀린·쓴·만료된 초대키는 성공으로 알리지 않는다(2026-09-23 시뮬레이션에서 발견)', () => {
    const join = entry.slice(entry.indexOf('const joinSpace = async'), entry.indexOf('const createInvite = async'));
    assert.match(join, /result\.success === false/);
    assert.match(join, /rate_limited/);
    // 성공 문구는 실패를 거른 뒤에만 띄운다.
    assert.ok(join.indexOf('result.success === false') < join.indexOf("setMessage('참여를 신청했습니다"),
        '실패를 거르기 전에 성공 문구를 띄우면 안 됩니다.');
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { buildTeacherNavBadges, formatBadgeCount } from '../src/components/teacher/teacherNavBadges.js';

/*
 * 교사 메뉴 배지 규칙(2026-09-26 UI 점검): 배지 = 처리할 일 수, 상단 메뉴 = 세부 메뉴 합.
 * 전에는 `NEW` 글자와 숫자가 섞였고, 쪽수 확인 책은 세부 메뉴에만 떠서 다른 메뉴에서 몰랐다.
 */
test('상단 메뉴 숫자는 그 안 세부 메뉴 숫자의 합이다', () => {
    const badges = buildTeacherNavBadges({ dashboard: 2, 'reading-logs': 3, diaries: 0, comments: 4, 'neighbor-agit': 1 });
    assert.deepEqual(badges.tabs, { dashboard: 2, 'reading-logs': 3, comments: 4, 'neighbor-agit': 1 });
    assert.equal(badges.groups.writing, 5);
    assert.equal(badges.groups.operations, 4);
    assert.equal(badges.groups['neighbor-agit'], 1);
    assert.equal(badges.groups.students, undefined, '처리할 일이 없는 메뉴에는 배지를 달지 않습니다.');
});

test('이상한 값은 0 으로 보고 세 자리부터는 99+ 로 줄인다', () => {
    const badges = buildTeacherNavBadges({ dashboard: -3, diaries: Number.NaN, comments: '2' });
    assert.deepEqual(badges.tabs, { comments: 2 });
    assert.equal(formatBadgeCount(7), '7');
    assert.equal(formatBadgeCount(99), '99');
    assert.equal(formatBadgeCount(100), '99+');
});

test('대시보드는 배지를 한 부품으로만 그린다', async () => {
    const dashboard = await readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8');
    assert.match(dashboard, /buildTeacherNavBadges\(/);
    assert.doesNotMatch(dashboard, /teacher-subtab__|nav-new|>NEW</);
});

test('모두의 아지트 검토 단추도 같은 숫자 배지 하나를 쓴다', async () => {
    const entry = await readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    // 전에는 `NEW` 글자와 숫자가 함께 붙었다(2026-09-26 정리). 글 카드 한 장의 `NEW` 는 "어느 글이 새 글인지" 표시라 그대로 둔다.
    assert.match(entry, /🗂️ 검토<TeacherCountBadge count=\{reviewInboxCount\} label="검토할 일" \/>/);
    assert.doesNotMatch(entry, /🗂️ 검토\{reviewInboxCount > 0 && <><span className="neighbor-teacher__new-flag">NEW/);
});

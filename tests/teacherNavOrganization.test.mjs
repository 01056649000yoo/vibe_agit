import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TEACHER_NAV_GROUPS } from '../src/constants/teacherNav.js';

const [dashboard, dashboardCss, uiPreview] = await Promise.all([
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.css', 'utf8'),
    readFile('src/dev/UiPreview.jsx', 'utf8')
]);

test('교사 상단 메뉴는 글쓰기 → 학급 관리 → 확장 기능 → 설정 흐름으로 정렬한다', () => {
    assert.deepEqual(
        TEACHER_NAV_GROUPS.map((group) => group.id),
        [
            'writing',
            'writing-lab',
            'class-agit',
            'operations',
            'students',
            'footprints',
            'records',
            'playground',
            'tools',
            'neighbor-agit',
            'settings'
        ]
    );
    assert.deepEqual(
        TEACHER_NAV_GROUPS.map((group) => group.navSection),
        [
            'writing', 'writing', 'writing',
            'class', 'class', 'class', 'class',
            'extensions', 'extensions', 'extensions',
            'settings'
        ]
    );
});

test('BETA는 준비 중인 우리반·이웃 아지트에만 작은 배지로 표시한다', () => {
    const badges = TEACHER_NAV_GROUPS
        .filter((group) => group.badge)
        .map((group) => [group.id, group.badge]);

    assert.deepEqual(badges, [
        ['class-agit', 'BETA'],
        ['neighbor-agit', 'BETA']
    ]);
    assert.equal(TEACHER_NAV_GROUPS.find((group) => group.id === 'writing-lab')?.badge, undefined);
    assert.doesNotMatch(TEACHER_NAV_GROUPS.map((group) => group.label).join(' '), /\(beta\)/i);
    assert.match(dashboard, /group\.badge && <span className="teacher-dashboard__nav-badge">/);
    assert.match(uiPreview, /group\.badge && <span className="ui-preview__nav-badge">/);
});

test('메뉴 구역 경계와 좁은 화면의 선택 메뉴 자동 노출을 유지한다', () => {
    assert.match(dashboard, /TEACHER_NAV_GROUPS\[groupIndex - 1\]\.navSection !== group\.navSection/);
    assert.match(dashboard, /teacher-dashboard__nav-item[\s\S]*is-section-start/);
    assert.match(dashboard, /teacherNavRef\.current\?\.querySelector\('\.teacher-dashboard__nav-item\.is-active'\)/);
    assert.match(dashboard, /scrollIntoView\(\{ block: 'nearest', inline: 'center' \}\)/);
    assert.match(dashboardCss, /\.teacher-dashboard__nav-item\.is-section-start::before/);
    assert.match(dashboardCss, /\.teacher-dashboard__nav-badge/);
    assert.match(dashboardCss, /scroll-padding-inline/);
});

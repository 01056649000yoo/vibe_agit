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

test('메뉴에는 배지를 달지 않고 상태는 이름에 적는다', () => {
    /*
     * 2026-09-14 요청: 우리반 아지트의 `BETA` 를 뗀다.
     *
     * 모두의 아지트는 2026-08 에 "별도 경고문 없이 **메뉴명**으로 알린다" 고 정했다(`모두의 아지트(제작 중)`).
     * 그래서 배지를 쓰는 메뉴가 하나도 남지 않는다 — 그리는 자리도 함께 걷어낸다. 두 방식이
     * 같이 있으면 다음 사람이 어느 쪽으로 적을지 헷갈린다.
     * 2026-09-25: 모두의 아지트를 전체 교사에게 공개하며 이름을 `모두의 아지트(Beta)` 로(선생님 요청). 여전히 배지가 아니라 이름이다.
     */
    assert.deepEqual(TEACHER_NAV_GROUPS.filter((group) => group.badge).map((group) => group.id), []);
    assert.equal(TEACHER_NAV_GROUPS.find((group) => group.id === 'neighbor-agit')?.label, '모두의 아지트(Beta)');
    assert.doesNotMatch(TEACHER_NAV_GROUPS.filter((group) => group.id !== 'neighbor-agit').map((group) => group.label).join(' '), /\(beta\)|beta/i);
    assert.ok(!dashboard.includes('nav-badge'), '대시보드에 배지를 그리는 자리가 남아 있습니다.');
    assert.ok(!uiPreview.includes('nav-badge'), 'UI 작업실에 배지를 그리는 자리가 남아 있습니다.');
});

test('메뉴 구역 경계와 좁은 화면의 선택 메뉴 자동 노출을 유지한다', () => {
    assert.match(dashboard, /TEACHER_NAV_GROUPS\[groupIndex - 1\]\.navSection !== group\.navSection/);
    assert.match(dashboard, /teacher-dashboard__nav-item[\s\S]*is-section-start/);
    assert.match(dashboard, /teacherNavRef\.current\?\.querySelector\('\.teacher-dashboard__nav-item\.is-active'\)/);
    assert.match(dashboard, /scrollIntoView\(\{ block: 'nearest', inline: 'center' \}\)/);
    assert.match(dashboardCss, /\.teacher-dashboard__nav-item\.is-section-start::before/);
    // 배지를 쓰는 메뉴가 없어져 스타일도 걷어냈다 — 남겨 두면 다음 사람이 살아 있는 장치로 읽는다.
    assert.doesNotMatch(dashboardCss, /nav-badge/);
    assert.match(dashboardCss, /scroll-padding-inline/);
});

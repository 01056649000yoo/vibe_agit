import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 교사 화면 왼쪽 메뉴는 한 부품이다(2026-09-26 UI 점검).
 * 전에는 세부 메뉴(180–240px·회색), 학급운영도구(220px·연파랑), 설정(300px·연파랑)이 따로 그려
 * 메뉴를 옮길 때마다 본문이 시작하는 자리가 움직였다.
 */
const HOSTS = [
    'src/components/teacher/TeacherDashboard.jsx',
    'src/components/teacher/TeachingToolsHub.jsx',
    'src/components/teacher/TeacherSettingsHub.jsx'
];

test('세부 메뉴·학급운영도구·설정은 같은 왼쪽 메뉴와 배치를 쓴다', async () => {
    for (const file of HOSTS) {
        const source = await readFile(file, 'utf8');
        assert.match(source, /<TeacherSideMenu/, `${file} 이 공통 왼쪽 메뉴를 쓰지 않습니다.`);
        assert.match(source, /teacher-side-layout/, `${file} 이 공통 배치를 쓰지 않습니다.`);
        assert.doesNotMatch(source, /gridTemplateColumns: isMobile \? 'minmax\(0, 1fr\)' : `?\$?\{?[A-Z_]*|'220px minmax|clamp\(180px, 10vw, 240px\)/,
            `${file} 에 메뉴 폭이 따로 적혀 있습니다.`);
    }
});

test('왼쪽 메뉴 폭은 한 곳에서 정하고 색은 토큰만 쓴다', async () => {
    const css = await readFile('src/components/teacher/TeacherSideMenu.css', 'utf8');
    assert.equal((css.match(/--teacher-side-menu-width:/g) || []).length, 1);
    assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, '왼쪽 메뉴에 색을 직접 적지 않습니다.');
});

test('자리마다 원래 뜻을 지킨다 — 세부 메뉴는 탭, 도구·설정은 쪽 이동', async () => {
    const [menu, dashboard, tools, settings] = await Promise.all([
        readFile('src/components/teacher/TeacherSideMenu.jsx', 'utf8'),
        ...HOSTS.map((file) => readFile(file, 'utf8'))
    ]);
    // 동행 모드는 aria-selected·aria-current 둘 다 "열렸다"로 읽는다.
    assert.match(menu, /role: 'tab', 'aria-selected': active/);
    assert.match(menu, /'aria-current': active \? 'page' : undefined/);
    assert.match(dashboard, /<TeacherSideMenu\s+semantics="tabs"/);
    assert.doesNotMatch(tools, /semantics="tabs"/);
    assert.doesNotMatch(settings, /semantics="tabs"/);
    // 새로고침해도 고른 항목이 남는다.
    assert.match(tools, /useRememberedChoice\(/);
    assert.match(settings, /useRememberedChoice\('teacher-settings-section-v1', SETTINGS_IDS\)/);
});

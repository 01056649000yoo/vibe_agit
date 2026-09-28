import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
    HEADER_TOOL_SHORTCUT_DEFAULT, HEADER_TOOL_SHORTCUT_STORAGE_KEY, resolveHeaderToolShortcut
} from '../src/components/teacher/headerToolShortcut.js';

/*
 * 머리말 단축 단추에 학급운영도구 하나를 고정한다(2026-09-28 선생님 요청).
 * 단추 옆 ▾ → 학급운영도구 목록 → 하나를 누르면 고정. 처음 값은 우리 반 스크린.
 */

const dashboard = readFileSync('src/components/teacher/TeacherDashboard.jsx', 'utf8');
const pinMenu = readFileSync('src/components/teacher/TeacherToolPinMenu.jsx', 'utf8');
const hub = readFileSync('src/components/teacher/TeachingToolsHub.jsx', 'utf8');
const css = readFileSync('src/components/teacher/TeacherDashboard.css', 'utf8');
const header = dashboard.slice(dashboard.indexOf('teacher-dashboard__tools'), dashboard.indexOf('</header>'));

test('고정한 도구를 고르는 규칙: 기억한 것이 목록에 있으면 그것, 아니면 우리 반 스크린, 그것도 없으면 첫 도구', () => {
    const ids = ['class-board', 'meal-board', 'samlink'];
    assert.equal(HEADER_TOOL_SHORTCUT_DEFAULT, 'class-board');
    assert.equal(resolveHeaderToolShortcut('meal-board', ids), 'meal-board');
    assert.equal(resolveHeaderToolShortcut(null, ids), 'class-board', '처음에는 이전과 같은 우리 반 스크린');
    assert.equal(resolveHeaderToolShortcut('없어진-도구', ids), 'class-board', '빠진 도구를 기억하고 있으면 처음 값으로');
    assert.equal(resolveHeaderToolShortcut(null, ['meal-board', 'samlink']), 'meal-board');
    assert.equal(resolveHeaderToolShortcut(null, []), null);
});

test('단축 단추와 ▾ 가 머리말에 붙어 있고, 동행 모드 자리는 단축 단추 그대로다', () => {
    assert.match(header, /className="teacher-tool-shortcut"[\s\S]{0,900}tourAnchor\(TEACHER_TOUR_ANCHORS\.CLASS_BOARD_OPEN\)[\s\S]{0,900}<TeacherToolPinMenu/);
    assert.match(header, /onClick=\{handleOpenPinnedTool\}/);
    assert.ok(!pinMenu.includes('tourAnchor'), '▾ 메뉴 안에 동행 모드 자리를 두면 숨은 단추가 된다');
});

test('우리 반 스크린은 새 창으로 바로 열고, 다른 도구는 학급운영도구에서 그 도구를 연다', () => {
    const handler = dashboard.slice(dashboard.indexOf('const handleOpenPinnedTool'), dashboard.indexOf('const handleConfirmAdminPassword'));
    assert.match(handler, /pinnedTool\.id === 'class-board'[\s\S]*handleOpenDefaultClassBoard\(\)/);
    assert.match(handler, /handleWorkspaceNavigate\(\{ tab: 'tools', tool: pinnedTool\.id \}\)/);
    // 학급운영도구 화면이 navigationTarget.tool 로 그 도구를 고른다.
    assert.match(hub, /navigationTarget\.tool/);
});

test('급식판처럼 매니페스트에 shortcutLaunch 를 적은 도구는 단축 단추로 열 때 그 동작을 한 번 받는다', async () => {
    const { mealBoardManifest } = await import('../src/modules/tool/meal-board/manifest.js');
    assert.equal(mealBoardManifest.tool.shortcutLaunch, 'fullscreen');
    const handler = dashboard.slice(dashboard.indexOf('const handleOpenPinnedTool'), dashboard.indexOf('const handleConfirmAdminPassword'));
    assert.match(handler, /pinnedTool\.tool\?\.shortcutLaunch/);
    assert.match(handler, /setToolLaunchRequest\(/);
    assert.match(dashboard, /launchRequest=\{toolLaunchRequest\}/);
    // 허브는 고른 도구에게만 넘긴다 — 다른 도구로 바꾸면 받지 않는다.
    assert.match(hub, /launchRequest=\{launchRequest\?\.toolId === selected\.module\.id \? launchRequest : null\}/);
    const entry = readFileSync('src/modules/tool/meal-board/TeacherEntry.jsx', 'utf8');
    const effect = entry.slice(entry.indexOf('머리말 단축 단추로 열면'), entry.indexOf('onLaunchHandled]);'));
    assert.match(effect, /launchRequest\?\.action !== 'fullscreen' \|\| loading \|\| mealLoading/, '급식을 다 읽기 전에 열면 빈 급식판이 뜬다');
    assert.match(effect, /setFullscreenOpen\(true\)/);
    assert.match(effect, /onLaunchHandled\?\.\(launchRequest\.requestId\)/, '처리했다고 알려야 닫은 뒤 다시 저절로 열리지 않는다');
});

test('고른 도구는 이 기기에 기억하고, 목록은 학급운영도구 화면과 같은 원본에서 읽는다', () => {
    assert.equal(HEADER_TOOL_SHORTCUT_STORAGE_KEY, 'teacher-header-tool-shortcut-v1');
    assert.match(dashboard, /window\.localStorage\.getItem\(HEADER_TOOL_SHORTCUT_STORAGE_KEY\)/);
    assert.match(dashboard, /window\.localStorage\.setItem\(HEADER_TOOL_SHORTCUT_STORAGE_KEY, toolId\)/);
    assert.match(dashboard, /tools=\{TEACHER_TOOL_MODULES\}/);
    assert.match(hub, /TEACHER_TOOL_MODULES/);
});

test('▾ 메뉴는 고르기만 한다 — 키보드로 닫히고, 지금 고정된 것을 알려 준다', () => {
    assert.match(pinMenu, /aria-haspopup="menu"/);
    assert.match(pinMenu, /aria-expanded=\{open\}/);
    assert.match(pinMenu, /role="menuitemradio"/);
    assert.match(pinMenu, /aria-checked=\{pinned\}/);
    assert.match(pinMenu, /event\.key !== 'Escape'/);
    assert.match(pinMenu, /onPin\(toolId\)/);
    assert.ok(!/onOpen|navigate/i.test(pinMenu), '고르는 순간 도구가 열리면 안 된다(여는 것은 단축 단추)');
    assert.match(css, /\.teacher-tool-pin__menu \{[\s\S]*?position: absolute/);
});

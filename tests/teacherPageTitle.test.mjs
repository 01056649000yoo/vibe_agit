import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TEACHER_NAV_GROUPS, getTeacherTabLabel } from '../src/constants/teacherNav.js';

/*
 * 교사 화면 제목은 공통 부품 하나로 그린다(2026-09-26 UI 점검).
 *
 * 전에는 화면마다 제목을 따로 적어 단계(h1·h2·h3)·크기·색이 달랐고, `학생 평가` 를 누르면
 * `학생 평가 관리` 가 뜨는 식으로 메뉴 이름과 제목도 어긋났다. 제목 글은 메뉴 이름에서 꺼낸다.
 * 새 메뉴를 더하면 아래 표에 그 화면 파일을 한 줄 더한다 — 빠지면 첫 검사가 알려 준다.
 */
const TITLE_SCREENS = {
    dashboard: 'src/components/teacher/MissionManager.jsx',
    'reading-logs': 'src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx',
    diaries: 'src/modules/writing/diary/teacher/TeacherDiaryManager.jsx',
    archive: 'src/components/teacher/ArchiveManager.jsx',
    'class-agit': 'src/modules/class-agit/teacher/TeacherEntry.jsx',
    'class-agit-books': 'src/modules/class-agit/anthology/AnthologyManager.jsx',
    'neighbor-agit': 'src/modules/community/neighbor-agit/TeacherEntry.jsx',
    operations: 'src/components/teacher/ClassAnalysis.jsx',
    'student-dashboard-preview': 'src/components/teacher/StudentDashboardPreview.jsx',
    'student-agits': 'src/components/teacher/TeacherStudentAgitViewer.jsx',
    'recent-activity': 'src/components/teacher/RecentActivity.jsx',
    comments: 'src/components/teacher/TeacherCommentManager.jsx',
    students: 'src/components/teacher/StudentManagerHeader.jsx',
    evaluation: 'src/components/teacher/TeacherEvaluationTab.jsx',
    activity: 'src/components/teacher/ActivityReport.jsx',
    playground: 'src/components/teacher/GameManager.jsx'
};

/*
 * 제목을 공통 부품으로 그리지 않는 메뉴와 그 까닭.
 * - footprints: 교실 화면에 크게 띄우는 파란 띠라 어두운 제목을 얹을 수 없다. 글만 메뉴 이름을 쓴다.
 * - tools·settings: 메뉴 안에서 다시 고르는 화면이라 고른 항목 이름이 제목이다(아래 따로 검사).
 */
const OWN_TITLE_TABS = ['footprints', 'tools', 'settings'];

const TOOL_SCREENS = {
    'class-board': ['src/modules/tool/class-board/TeacherEntry.jsx', 'classBoardManifest'],
    'class-notice': ['src/modules/tool/class-notice/TeacherEntry.jsx', 'classNoticeManifest'],
    'meal-board': ['src/modules/tool/meal-board/TeacherEntry.jsx', 'mealBoardManifest'],
    'classroom-arrangement': ['src/modules/tool/classroom-arrangement/TeacherEntry.jsx', 'classroomArrangementManifest']
};

test('모든 교사 메뉴 화면이 공통 제목 표에 있거나 까닭이 적혀 있다', () => {
    const tabIds = TEACHER_NAV_GROUPS.flatMap((group) => group.tabs.map((tab) => tab.id));
    const missing = tabIds.filter((id) => !(id in TITLE_SCREENS) && !OWN_TITLE_TABS.includes(id));
    assert.deepEqual(missing, [], `공통 제목 표에 없는 메뉴: ${missing.join(', ')}`);
});

test('메뉴 화면은 자기 메뉴 이름을 공통 제목으로 쓴다', async () => {
    for (const [tabId, file] of Object.entries(TITLE_SCREENS)) {
        const source = await readFile(file, 'utf8');
        assert.ok(getTeacherTabLabel(tabId), `${tabId} 메뉴 이름이 없습니다.`);
        assert.match(source, new RegExp(`<TeacherPageTitle tabId="${tabId}"`), `${file} 이 공통 제목을 쓰지 않습니다.`);
        // 도움말 단추는 공통 제목이 그린다. 같은 도움말을 한 번 더 달면 단추가 둘이 된다.
        // (책방에서 책 하나를 열면 제목이 책 이름이라 `book && <TeacherGuideButton …>` 으로 따로 단다.)
        assert.doesNotMatch(source, new RegExp(`(?<!&& )<TeacherGuideButton tabId="${tabId}" variant="help" />`),
            `${file} 에 ${tabId} 도움말 단추가 따로 남아 있습니다.`);
    }
});

test('학급운영도구와 설정은 고른 항목 이름을 공통 제목으로 쓴다', async () => {
    for (const [guideId, [file, manifestName]] of Object.entries(TOOL_SCREENS)) {
        const source = await readFile(file, 'utf8');
        assert.match(source, new RegExp(`<TeacherPageTitle title=\\{${manifestName}\\.name\\} guideTabId="${guideId}"`));
    }
    const settings = await readFile('src/components/teacher/TeacherSettingsHub.jsx', 'utf8');
    assert.match(settings, /<TeacherPageTitle title=\{selected\.label\} guideTabId=\{`settings:\$\{selected\.id\}`\} \/>/);
});

test('학급 발자국 띠는 메뉴 이름을 원본에서 꺼낸다', async () => {
    const source = await readFile('src/modules/writing/writing-footprint/TeacherWritingFootprintDashboard.jsx', 'utf8');
    assert.match(source, /getTeacherTabLabel\('footprints'\)/);
    assert.doesNotMatch(source, /글쓰기 발자국<\/h2>/);
});

test('공통 제목은 토큰만 쓰고 도움말 단추를 함께 그린다', async () => {
    const [component, css] = await Promise.all([
        readFile('src/components/teacher/TeacherPageTitle.jsx', 'utf8'),
        readFile('src/components/teacher/TeacherPageTitle.css', 'utf8')
    ]);
    assert.match(component, /getTeacherTabLabel\(tabId\)/);
    assert.match(component, /<TeacherGuideButton tabId=\{guideTabId \|\| tabId\} variant="help" \/>/);
    assert.match(css, /font-size: var\(--ui-text-2xl\)/);
    assert.doesNotMatch(css, /#[0-9a-f]{3,6}\b/i, '공통 제목에 색을 직접 적지 않습니다.');
});

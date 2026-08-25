import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    STUDENT_BOTTOM_NAV_TABS,
    createStudentHistoryState,
    getStudentActiveBottomTab,
    getStudentBackDestination,
    getStudentBottomNavDestination,
    getStudentRouteKey,
    readStudentHistoryParent,
    readStudentHistoryState
} from '../src/components/student/studentNavigation.js';

const [app, bottomNav, dashboard, navigationGuide, agents] = await Promise.all([
    readFile('src/App.jsx', 'utf8'),
    readFile('src/components/student/StudentBottomNav.jsx', 'utf8'),
    readFile('src/components/student/StudentDashboard.jsx', 'utf8'),
    readFile('src/components/student/README.md', 'utf8'),
    readFile('AGENTS.md', 'utf8')
]);

test('새 학생 메뉴의 내비게이션·뒤로가기 계약은 코드 가까이와 작업 지침에 연결된다', () => {
    const compactGuide = navigationGuide.replace(/\s/g, '');
    for (const { label } of STUDENT_BOTTOM_NAV_TABS) {
        assert.ok(compactGuide.includes(label.replace(/\s/g, '')), `${label} 메뉴가 내비게이션 계약에 없습니다.`);
    }
    assert.match(navigationGuide, /최상위 메뉴[\s\S]*항상 메인 대시보드/);
    assert.match(navigationGuide, /하위 화면[\s\S]*부모 목록/);
    assert.match(navigationGuide, /studentPage[\s\S]*studentParams[\s\S]*studentParent/);
    assert.match(navigationGuide, /열기 신호[\s\S]*사용 직후[\s\S]*초기화/);
    assert.match(navigationGuide, /StudentBackButton/);
    assert.match(navigationGuide, /tests\/studentNavigation\.test\.mjs/);
    assert.match(agents, /src\/components\/student\/README\.md/);
    assert.match(agents, /STUDENT_BOTTOM_NAV_TABS/);
});

test('모바일 하단 메뉴 여섯 개는 목적지를 한 목록에서 정한다', () => {
    assert.deepEqual(
        STUDENT_BOTTOM_NAV_TABS.map(({ id }) => id),
        ['main', 'mission_list', 'reading_logs', 'my_agit', 'playground', 'friends_hideout']
    );
    assert.deepEqual(getStudentBottomNavDestination('my_agit'), {
        pageName: 'main', params: {}, overlay: 'my_agit'
    });
    assert.deepEqual(getStudentBottomNavDestination('playground'), {
        pageName: 'main', params: {}, overlay: 'playground'
    });
    assert.deepEqual(getStudentBottomNavDestination('friends_hideout'), {
        pageName: 'friends_hideout', params: {}, overlay: null
    });
    assert.match(bottomNav, /STUDENT_BOTTOM_NAV_TABS\.map/);
    assert.match(bottomNav, /onNavigate\(tab\.id\)/);
    assert.doesNotMatch(bottomNav, /onOpenMyAgit|onOpenPlayground/);
});

test('현재 화면과 하단 메뉴 강조가 과제 편집기·두 오버레이까지 일치한다', () => {
    assert.equal(getStudentActiveBottomTab('main'), 'main');
    assert.equal(getStudentActiveBottomTab('writing'), 'mission_list');
    assert.equal(getStudentActiveBottomTab('reading_logs'), 'reading_logs');
    assert.equal(getStudentActiveBottomTab('main', 'my_agit'), 'my_agit');
    assert.equal(getStudentActiveBottomTab('main', 'playground'), 'playground');
    assert.equal(getStudentActiveBottomTab('diaries'), null);
    assert.match(app, /activeTab=\{studentBottomActiveTab\}/);
    assert.match(dashboard, /onActiveNavChangeRef\.current\?\.\(activeDashboardNav\)/);
});

test('메뉴 화면 뒤로가기는 홈이고 글쓰기·과제에서 연 친구 글만 과제 목록으로 간다', () => {
    for (const name of ['mission_list', 'reading_logs', 'diaries', 'lab_activities']) {
        assert.deepEqual(getStudentBackDestination({ name }), { name: 'main', params: {} });
    }
    assert.deepEqual(
        getStudentBackDestination({ name: 'friends_hideout', params: {} }),
        { name: 'main', params: {} }
    );
    assert.deepEqual(
        getStudentBackDestination({ name: 'writing', params: { missionId: 'm1' } }),
        { name: 'mission_list', params: {} }
    );
    assert.deepEqual(
        getStudentBackDestination({ name: 'friends_hideout', params: { returnTo: 'mission_list' } }),
        { name: 'mission_list', params: {} }
    );
    assert.equal((app.match(/onBack=\{handleCurrentStudentBack\}/g) || []).length, 6);
});

test('메뉴 간 이동은 현재 기록을 홈으로 교체해 기기 뒤로가기가 이전 메뉴를 재방문하지 않는다', () => {
    assert.match(
        app,
        /handleStudentBottomNavigation[\s\S]*?replaceState\([\s\S]*?STUDENT_HOME_ROUTE\.name[\s\S]*?setInternalPage\(destination\.pageName, destination\.params\)/
    );
    assert.match(app, /onNavigate=\{handleStudentBottomNavigation\}/);

    const editorState = createStudentHistoryState(
        'reading_logs',
        { mode: 'editor', postId: 'p1' },
        { name: 'reading_logs', params: {} }
    );
    assert.deepEqual(readStudentHistoryState(editorState), {
        name: 'reading_logs', params: { mode: 'editor', postId: 'p1' }
    });
    assert.deepEqual(readStudentHistoryParent(editorState), {
        name: 'reading_logs', params: {}
    });
    assert.notEqual(
        getStudentRouteKey({ name: 'reading_logs', params: {} }),
        getStudentRouteKey({ name: 'reading_logs', params: { mode: 'editor' } })
    );
    assert.match(app, /readStudentHistoryParent\(window\.history\.state\)[\s\S]*?window\.history\.back\(\)/);
});

test('나의 아지트·놀이터 열기 신호는 사용 즉시 초기화되어 홈 재진입 때 다시 열리지 않는다', () => {
    assert.match(dashboard, /setIsMyAgitOpen\(true\);[\s\S]*?onMyAgitSignalHandled\?\.\(\)/);
    assert.match(dashboard, /setIsPlaygroundOpen\(true\);[\s\S]*?onPlaygroundSignalHandled\?\.\(\)/);
    assert.match(app, /handleMyAgitSignalHandled[\s\S]*?setMyAgitSignal\(0\)/);
    assert.match(app, /handlePlaygroundSignalHandled[\s\S]*?setPlaygroundSignal\(0\)/);
    assert.match(dashboard, /dashboardResetSignal[\s\S]*?setIsMyAgitOpen\(false\)[\s\S]*?setIsPlaygroundOpen\(false\)/);
});

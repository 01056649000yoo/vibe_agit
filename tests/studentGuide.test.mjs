import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STUDENT_GUIDE_ITEMS, STUDENT_GUIDE_SECTIONS } from '../src/components/student/studentGuide.js';
import { STUDENT_BOTTOM_NAV_TABS } from '../src/components/student/studentNavigation.js';

const [modal, dashboard, header] = await Promise.all([
    readFile('src/components/student/StudentGuideModal.jsx', 'utf8'),
    readFile('src/components/student/StudentDashboard.jsx', 'utf8'),
    readFile('src/components/student/StudentHeader.jsx', 'utf8')
]);

test('학생 사용법은 글쓰기·아지트·소식 흐름을 짧은 문장으로 안내한다', () => {
    assert.deepEqual(STUDENT_GUIDE_SECTIONS.map((section) => section.id), ['writing', 'agit', 'news']);
    assert.deepEqual(STUDENT_GUIDE_ITEMS.map((item) => item.id), [
        'missions', 'reading-logs', 'diaries', 'my-agit',
        'friends-hideout', 'playground', 'feedback', 'activity', 'footprint'
    ]);
    for (const item of STUDENT_GUIDE_ITEMS) {
        assert.ok(item.description.length <= 44, `${item.title} 설명이 초등학생용으로 너무 깁니다.`);
        assert.ok(item.ctaLabel.length <= 9, `${item.title} 버튼 문구가 너무 깁니다.`);
    }
});

test('학생 사용법의 바로 가기는 실제 하단 메뉴·학생 페이지·대시보드 동작만 사용한다', () => {
    const tabIds = new Set(STUDENT_BOTTOM_NAV_TABS.map((tab) => tab.id));
    for (const item of STUDENT_GUIDE_ITEMS) {
        const destination = item.destination;
        if (destination.type === 'tab') assert.ok(tabIds.has(destination.tabId), `${item.title}의 하단 메뉴가 없습니다.`);
        if (destination.type === 'route') assert.equal(destination.pageName, 'diaries');
        if (destination.type === 'dashboard-action') assert.ok(['feedback', 'activity', 'footprint'].includes(destination.action));
    }
    assert.match(dashboard, /getStudentBottomNavDestination\(destination\.tabId\)/);
    assert.match(dashboard, /onSelectDestination=\{openStudentGuideDestination\}/);
    assert.match(dashboard, /destination\.action === 'feedback'/);
    assert.match(dashboard, /destination\.action === 'activity'/);
    assert.match(dashboard, /destination\.action === 'footprint'/);
    assert.match(dashboard, /requestedOpen=\{isGuideActivityOpen\}/);
});

test('학생 사용법은 공용 모달과 공용 도움말 버튼을 사용한다', () => {
    assert.match(modal, /<Modal[\s\S]*title="끄적끄적 아지트 사용법"/);
    assert.match(modal, /STUDENT_GUIDE_SECTIONS\.map/);
    assert.match(modal, /onSelectDestination\(item\.destination\)/);
    assert.match(header, /<GuideInfoButton/);
    assert.match(header, /label="학생 대시보드 사용법 보기"/);
    assert.doesNotMatch(header, /icon="\?"/);
});

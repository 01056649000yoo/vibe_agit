import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [teacherNav, dashboard, manifest, entry, guideRegistry] = await Promise.all([
    readFile('src/constants/teacherNav.js', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/manifest.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/guides/teacherGuideRegistry.js', 'utf8')
]);

test('이웃 아지트 beta는 학급운영도구 오른쪽과 설정 왼쪽의 독립 교사 메뉴다', () => {
    const toolsIndex = teacherNav.indexOf("id: 'tools'");
    const neighborIndex = teacherNav.indexOf("id: 'neighbor-agit'");
    const settingsIndex = teacherNav.indexOf("id: 'settings'");

    assert.ok(toolsIndex > -1 && toolsIndex < neighborIndex && neighborIndex < settingsIndex);
    assert.match(teacherNav, /id: 'neighbor-agit'[\s\S]*label: '이웃 아지트'[\s\S]*badge: 'BETA'[\s\S]*defaultTab: 'neighbor-agit'/);
    assert.match(dashboard, /const TeacherNeighborAgit = lazy\(getModule\('neighbor-agit'\)\.teacherEntry\)/);
    assert.match(dashboard, /visibleTab === 'neighbor-agit'[\s\S]*<TeacherNeighborAgit activeClass=\{activeClass\} isMobile=\{isMobile\}/);
});

test('이웃 아지트는 설정 진입점을 남기지 않고 메인 메뉴에서만 지연 로딩한다', () => {
    assert.match(manifest, /teacherEntry: \(\) => import\('\.\/TeacherEntry'\)/);
    assert.doesNotMatch(manifest, /settingsEntry|settings:\s*\{/);
    assert.match(guideRegistry, /'neighbor-agit': \{ tab: 'neighbor-agit' \}/);
    assert.doesNotMatch(guideRegistry, /settings:module:neighbor-agit|section: 'module:neighbor-agit'/);
});

test('이웃 아지트 beta 준비 화면은 데이터 요청 없이 도움말과 현재 학급만 표시한다', () => {
    assert.match(entry, /Beta · 운영 기능 준비 중/);
    assert.match(entry, /TeacherGuideButton tabId="neighbor-agit"/);
    assert.match(entry, /activeClass\?\.name/);
    assert.doesNotMatch(entry, /supabase|\.rpc\(|\.from\(|fetch\(|setInterval|postgres_changes/);
});

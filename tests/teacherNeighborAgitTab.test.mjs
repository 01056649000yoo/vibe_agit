import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [teacherNav, dashboard, manifest, entry, teacherApi, guideRegistry] = await Promise.all([
    readFile('src/constants/teacherNav.js', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/manifest.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/teacherApi.js', 'utf8'),
    readFile('src/guides/teacherGuideRegistry.js', 'utf8')
]);

test('이웃 아지트 제작 중 메뉴는 학급운영도구 오른쪽과 설정 왼쪽의 독립 메뉴다', () => {
    const toolsIndex = teacherNav.indexOf("id: 'tools'");
    const neighborIndex = teacherNav.indexOf("id: 'neighbor-agit'");
    const settingsIndex = teacherNav.indexOf("id: 'settings'");

    assert.ok(toolsIndex > -1 && toolsIndex < neighborIndex && neighborIndex < settingsIndex);
    assert.match(teacherNav, /id: 'neighbor-agit'[\s\S]*label: '이웃 아지트\(제작 중\)'[\s\S]*defaultTab: 'neighbor-agit'/);
    assert.doesNotMatch(teacherNav.slice(neighborIndex, settingsIndex), /badge: 'BETA'/);
    assert.match(dashboard, /const TeacherNeighborAgit = lazy\(getModule\('neighbor-agit'\)\.teacherEntry\)/);
    assert.match(dashboard, /visibleTab === 'neighbor-agit'[\s\S]*<TeacherNeighborAgit key=\{activeClass.id\} activeClass=\{activeClass\} isMobile=\{isMobile\}/);
});

test('이웃 아지트는 설정 진입점을 남기지 않고 메인 메뉴에서만 지연 로딩한다', () => {
    assert.match(manifest, /teacherEntry: \(\) => import\('\.\/TeacherEntry'\)/);
    assert.doesNotMatch(manifest, /settingsEntry|settings:\s*\{/);
    assert.match(guideRegistry, /'neighbor-agit': \{ tab: 'neighbor-agit' \}/);
    assert.doesNotMatch(guideRegistry, /settings:module:neighbor-agit|section: 'module:neighbor-agit'/);
});

test('제한 공개 교사 화면은 공간·초대·승인·학생 공개·글 검토를 전용 RPC로 운영한다', () => {
    assert.match(entry, /TeacherGuideButton tabId="neighbor-agit"/);
    assert.match(entry, /새 공간 만들기/);
    assert.match(entry, /초대키로 참여하기/);
    assert.match(entry, /review_join/);
    assert.match(entry, /set_access/);
    assert.match(entry, /review_post/);
    assert.match(entry, /hide_comment/);
    assert.match(teacherApi, /get_neighbor_teacher_workspace_v1/);
    assert.match(teacherApi, /run_neighbor_teacher_action_v1/);
    assert.match(teacherApi, /get_neighbor_teacher_post_detail_v1/);
    assert.doesNotMatch(`${entry}\n${teacherApi}`, /setInterval|postgres_changes|supabase\.from\(/);
});

test('허용되지 않은 학급은 같은 메뉴에서 기능 대신 닫힌 상태를 본다', () => {
    assert.match(entry, /현재 선택한 학급에서는 이웃 아지트를 아직 사용할 수 없습니다/);
    assert.match(manifest, /defaultEnabled: false/);
    assert.match(manifest, /visibilityKey: 'neighbor_agit_available'/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NEIGHBOR_AGIT_PREPARATION_ROADMAP } from '../src/constants/preparationRoadmaps.js';

const [teacherNav, dashboard, manifest, entry, guideRegistry, preparationRoadmap] = await Promise.all([
    readFile('src/constants/teacherNav.js', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/manifest.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/guides/teacherGuideRegistry.js', 'utf8'),
    readFile('src/components/common/PreparationRoadmap.jsx', 'utf8')
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

test('이웃 아지트 beta 준비 화면은 연결·글 교류 업데이트 개요를 데이터 요청 없이 보여 준다', () => {
    assert.match(entry, /Beta · 운영 기능 준비 중/);
    assert.match(entry, /TeacherGuideButton tabId="neighbor-agit"/);
    assert.match(entry, /activeClass\?\.name/);
    assert.match(entry, /NEIGHBOR_AGIT_PREPARATION_ROADMAP/);
    assert.match(entry, /<PreparationRoadmap/);
    assert.deepEqual(
        NEIGHBOR_AGIT_PREPARATION_ROADMAP.items.map((item) => item.title),
        ['초대로 학급 참여', '나눌 글 확인하기', '하나의 이웃 글 피드', '학급별 사용 관리']
    );
    assert.match(NEIGHBOR_AGIT_PREPARATION_ROADMAP.title, /여러 학급.*서로의 독자/);
    assert.match(NEIGHBOR_AGIT_PREPARATION_ROADMAP.items[0].description, /최대 네 학급/);
    assert.match(NEIGHBOR_AGIT_PREPARATION_ROADMAP.note, /관리자 내부 확인.*사용자 승인.*교사가 확인한 글/);
    assert.doesNotMatch(`${entry}\n${preparationRoadmap}`, /supabase|\.rpc\(|\.from\(|fetch\(|setInterval|postgres_changes/);
});

test('내부 공개 중에는 학생 진입점이 서버 bootstrap 신호 없이는 보이지 않는다', () => {
    assert.match(manifest, /defaultMode: NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE/);
    assert.match(manifest, /studentEntry: \(\) => import\('\.\/StudentEntry'\)/);
    assert.match(manifest, /visibilityKey: 'neighbor_agit_available'/);
    assert.match(manifest, /defaultEnabled: false/);
    assert.doesNotMatch(entry, /Workspace|Operational|supabase|\.rpc\(|\.from\(|fetch\(/);
});

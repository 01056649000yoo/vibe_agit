import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [teacherNav, dashboard, hub, uiPreview] = await Promise.all([
    readFile('src/constants/teacherNav.js', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherClassAgitHub.jsx', 'utf8'),
    readFile('src/dev/UiPreview.jsx', 'utf8')
]);

test('우리반 아지트 beta는 글쓰기 연구소 바로 옆의 내부 교사 탭이다', () => {
    const labIndex = teacherNav.indexOf("id: 'writing-lab'");
    const classAgitIndex = teacherNav.indexOf("id: 'class-agit'");
    const operationsIndex = teacherNav.indexOf("id: 'operations'");

    assert.ok(labIndex > -1 && labIndex < classAgitIndex && classAgitIndex < operationsIndex);
    assert.match(teacherNav, /id: 'class-agit'[\s\S]*label: '우리반 아지트 \(beta\)'[\s\S]*defaultTab: 'class-agit'/);
    const classAgitGroup = teacherNav.slice(classAgitIndex, operationsIndex);
    assert.doesNotMatch(classAgitGroup, /launchHref/);
    assert.match(dashboard, /lazy\(\(\) => import\('\.\/TeacherClassAgitHub'\)\)/);
    assert.match(dashboard, /visibleTab === 'class-agit'[\s\S]*<TeacherClassAgitHub activeClass=\{activeClass\}/);
    assert.match(uiPreview, /group\.id === 'class-agit'[\s\S]*<TeacherClassAgitHub activeClass=/);
});

test('준비 화면은 정해지지 않은 활동 예시 없이 상단 배너만 보여 준다', () => {
    assert.match(hub, /Beta · 준비 중/);
    assert.match(hub, /을 위한 공간을 준비하고 있습니다/);
    assert.doesNotMatch(hub, /아이들 의견 모으기|글쓰기 전 생각 열기|우리 반 활동 돕기/);
    assert.doesNotMatch(hub, /선택 → 활성화 → 마무리|PREVIEW_AREAS|teacher-class-agit__areas|teacher-class-agit__plan/);
    assert.doesNotMatch(hub, /supabase|\.rpc\(|\.from\(|fetch\(|setInterval|postgres_changes/);
});

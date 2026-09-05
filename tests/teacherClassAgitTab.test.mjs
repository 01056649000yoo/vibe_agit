import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CLASS_AGIT_PREPARATION_ROADMAP } from '../src/constants/preparationRoadmaps.js';

const [teacherNav, dashboard, hub, uiPreview, preparationRoadmap, preparationRoadmapCss] = await Promise.all([
    readFile('src/constants/teacherNav.js', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherClassAgitHub.jsx', 'utf8'),
    readFile('src/dev/UiPreview.jsx', 'utf8'),
    readFile('src/components/common/PreparationRoadmap.jsx', 'utf8'),
    readFile('src/components/common/PreparationRoadmap.css', 'utf8')
]);

test('우리반 아지트 beta는 글쓰기 연구소 바로 옆의 내부 교사 탭이다', () => {
    const labIndex = teacherNav.indexOf("id: 'writing-lab'");
    const classAgitIndex = teacherNav.indexOf("id: 'class-agit'", labIndex);
    const operationsIndex = teacherNav.indexOf("id: 'operations'");

    assert.ok(labIndex > -1 && labIndex < classAgitIndex && classAgitIndex < operationsIndex);
    const labGroup = teacherNav.slice(labIndex, classAgitIndex);
    assert.match(labGroup, /label: '글쓰기 연구소'/);
    assert.doesNotMatch(labGroup, /beta/i);
    assert.match(teacherNav, /id: 'class-agit'[\s\S]*label: '우리반 아지트'[\s\S]*badge: 'BETA'[\s\S]*defaultTab: 'class-agit'/);
    const classAgitGroup = teacherNav.slice(classAgitIndex, operationsIndex);
    assert.doesNotMatch(classAgitGroup, /launchHref/);
    assert.match(dashboard, /lazy\(\(\) => import\('\.\/TeacherClassAgitHub'\)\)/);
    assert.match(dashboard, /\['class-agit', 'class-agit-books'\]\.includes\(visibleTab\)[\s\S]*<TeacherClassAgitHub activeClass=\{activeClass\}/);
    assert.match(uiPreview, /group\.id === 'class-agit'[\s\S]*<TeacherClassAgitHub activeClass=/);
});

test('우리반 아지트 준비 화면은 확정된 전시·문집 업데이트 개요를 보여 준다', () => {
    assert.match(hub, /Beta · 준비 중/);
    assert.match(hub, /전시하고 문집으로 남길 공간을 준비하고 있습니다/);
    assert.match(hub, /CLASS_AGIT_PREPARATION_ROADMAP/);
    assert.match(hub, /<PreparationRoadmap/);
    assert.deepEqual(
        CLASS_AGIT_PREPARATION_ROADMAP.items.map((item) => item.title),
        ['여러 전시 만들기', '2.5D 글꽃 전시관', '글꽃 책방 만들기', '읽기 전용으로 나누기']
    );
    assert.match(CLASS_AGIT_PREPARATION_ROADMAP.note, /관리자 내부 확인.*시범 학급.*기능이 꺼진 상태/);
    assert.match(preparationRoadmap, /<ol className="preparation-roadmap__items">/);
    assert.match(preparationRoadmapCss, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(preparationRoadmapCss, /@media \(max-width: 700px\)[\s\S]*grid-template-columns: 1fr/);
    assert.doesNotMatch(`${hub}\n${preparationRoadmap}`, /supabase|\.rpc\(|\.from\(|fetch\(|setInterval|postgres_changes/);
});

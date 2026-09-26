import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TEACHER_NAV_GROUPS, TEACHER_TOOL_SECTION_LABEL } from '../src/constants/teacherNav.js';
import { classroomArrangementManifest } from '../src/modules/tool/classroom-arrangement/manifest.js';
import { mealBoardManifest } from '../src/modules/tool/meal-board/manifest.js';
import { samlinkManifest } from '../src/modules/tool/samlink/manifest.js';
import { classBoardManifest } from '../src/modules/tool/class-board/manifest.js';

const [guides, hub, mealBoard, arrangement] = await Promise.all([
  readFile('src/constants/teacherGuides.js', 'utf8'),
  readFile('src/components/teacher/TeachingToolsHub.jsx', 'utf8'),
  readFile('src/modules/tool/meal-board/TeacherEntry.jsx', 'utf8'),
  readFile('src/modules/tool/classroom-arrangement/TeacherEntry.jsx', 'utf8')
]);

test('교사 도구 영역은 학급운영도구 이름을 한 원본에서 사용한다', () => {
  const toolsGroup = TEACHER_NAV_GROUPS.find((group) => group.id === 'tools');

  assert.equal(TEACHER_TOOL_SECTION_LABEL, '학급운영도구');
  assert.equal(toolsGroup?.label, TEACHER_TOOL_SECTION_LABEL);
  assert.equal(toolsGroup?.tabs[0]?.label, TEACHER_TOOL_SECTION_LABEL);

  for (const source of [guides, hub]) {
    assert.match(source, /TEACHER_TOOL_SECTION_LABEL/);
  }
  // 도구 화면의 `학급운영도구 · …` 머리글은 공통 제목(TeacherPageTitle)으로 바뀌며 빠졌다(2026-09-26).
  // 다시 넣더라도 이름을 손으로 적지 말고 원본을 쓴다.
  for (const source of [guides, hub, mealBoard, arrangement]) {
    assert.doesNotMatch(source, /수업 도구/);
  }
  for (const source of [mealBoard, arrangement]) {
    assert.doesNotMatch(source, /학급운영도구/);
  }
});

test('학급운영도구는 우리 반 스크린 → 급식판 → 자리·역할 → URL 단축 순서이며 첫 도구만 지연 로드한다', () => {
  const orderedTools = [samlinkManifest, classroomArrangementManifest, mealBoardManifest, classBoardManifest]
    .sort((left, right) => left.tool.order - right.tool.order);

  assert.deepEqual(
    orderedTools.map((module) => [module.id, module.name, module.tool.order]),
    [
      ['class-board', '우리 반 스크린', 5],
      ['meal-board', '얘들아, 밥 먹자!', 10],
      ['classroom-arrangement', '자리·역할 배치', 20],
      ['samlink', 'URL 단축하기', 30]
    ]
  );
  assert.match(hub, /\.sort\(\(a, b\) => \(a\.tool\?\.order \?\? 100\) - \(b\.tool\?\.order \?\? 100\)\)/);
  // 고른 도구는 새로고침해도 남는다. 처음에는 순서의 첫 도구(useRememberedChoice 의 validIds[0])로 연다.
  assert.match(hub, /useRememberedChoice\(\s*'teacher-tools-selected-v1',\s*TOOL_IDS,/);
  assert.match(hub, /<selected\.Entry /);
  assert.doesNotMatch(hub, /TOOL_MODULES\.map\([\s\S]*<Entry /);
  assert.equal(classBoardManifest.tool.beta, true);
  assert.match(hub, /tag: module\.tool\?\.beta \? 'Beta' : null/);
});

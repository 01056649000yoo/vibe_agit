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

  for (const source of [guides, hub, mealBoard, arrangement]) {
    assert.match(source, /TEACHER_TOOL_SECTION_LABEL/);
    assert.doesNotMatch(source, /수업 도구/);
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
  assert.match(hub, /: TOOL_MODULES\[0\]\?\.module\.id \?\? null/);
  assert.match(hub, /<selected\.Entry /);
  assert.doesNotMatch(hub, /TOOL_MODULES\.map\([\s\S]*<Entry /);
  assert.equal(classBoardManifest.tool.beta, true);
  assert.match(hub, /module\.tool\?\.beta[\s\S]*>Beta</);
});

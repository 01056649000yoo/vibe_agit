import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { TEACHER_NAV_GROUPS, TEACHER_TOOL_SECTION_LABEL } from '../src/constants/teacherNav.js';

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

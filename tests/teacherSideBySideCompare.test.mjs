import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 교사 글 자세히 보기(2026-10-20): ① `처음 글과 나란히` 를 누르면 승인 전에도 처음 글과 현재(교정 포함) 글이
 * 좌우로 나온다 — 전에는 고친 곳 수가 0이라 최종 글로 되돌아가 눌러도 아무 일이 없었다.
 * ② 선생님이 글을 고치는 칸은 학생 입력창과 같은 줄바꿈 규칙이라야 오른쪽 끝이 가지런하다.
 */

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('나란히 화면은 승인 전에도 고른 칸을 최종 글로 되돌리지 않는다', async () => {
    const hook = await read('src/modules/writing/review/WritingVersionSwitch.jsx');
    assert.match(hook, /view === WRITING_VIEW\.CHANGES && !info\.canShowChanges && !sideBySide/);
    const viewer = await read('src/components/teacher/PostDetailViewer.jsx');
    assert.match(viewer, /sideBySide: true/);
});

test('선생님이 고치는 칸은 학생 입력창과 같은 줄바꿈 규칙을 쓴다', async () => {
    const css = await read('src/components/teacher/teacherPostEdit.css');
    const rule = css.match(/\.teacher-edit-field\s*\{[^}]*\}/)?.[0] ?? '';
    assert.match(rule, /word-break:\s*normal/);
    assert.match(rule, /overflow-wrap:\s*break-word/);
    const student = await read('src/modules/writing/student-input/StudentTextInput.css');
    assert.match(student, /word-break:\s*normal/);
});

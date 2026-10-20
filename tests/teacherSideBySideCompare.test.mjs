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

test('교사 글 자세히 보기는 ① 처음 글 → ② 선생님 교정 → ③ 최종 글 순서이고, 한 번에 글 두 개만 놓는다', async () => {
    const hook = await read('src/modules/writing/review/WritingVersionSwitch.jsx');
    assert.match(hook, /\['①', '②', '③'\]/);
    assert.match(hook, /sideBySide \? WRITING_VIEW\.CHANGES : WRITING_VIEW\.FINAL/);
    const viewer = await read('src/components/teacher/PostDetailViewer.jsx');
    // ①은 처음 글 한 칸, ③은 처음·최종 두 칸 — 세 글을 한꺼번에 펼치는 칸은 없다.
    assert.match(viewer, /showOriginalOnly = version\.view === WRITING_VIEW\.ORIGINAL/);
    assert.match(viewer, /showOriginal = version\.view === WRITING_VIEW\.CHANGES/);
});

test('학생 내 글 보기의 바뀐 곳도 내가 고친 곳·선생님이 고친 곳을 가른다', async () => {
    const shelf = await read('src/components/student/MyShelfPostDetail.jsx');
    assert.match(shelf, /useAttributedChanges\(/);
    assert.match(shelf, /variant="merged"/);
    assert.match(shelf, /studentLabel="내가 고친 곳"/);
    // 계산할 수 없을 때(긴 글·불러오는 중)는 옛 비교로 물러선다.
    assert.match(shelf, /<WritingChangeHighlight before=\{post\.original_content\}/);
});

test('크게 보기 창에는 고친 곳 보기/숨기기 단추가 있고, 끄면 칠하지 않은 글만 보여 준다', async () => {
    const modal = await read('src/modules/writing/presentation/WritingPresentationModal.jsx');
    assert.match(modal, /marks \? \(/);
    assert.match(modal, /aria-pressed=\{marks\.shown\}/);
    const viewer = await read('src/components/teacher/PostDetailViewer.jsx');
    assert.match(viewer, /showPresentationMarks/);
    assert.match(viewer, /marks=\{hasAttributedMarks/);
    // 끄면 처음 글·지금 글 원문 그대로(칠도 안내 띠도 없음)
    assert.match(viewer, /\(presentationVersion === 'original' \? selectedPost\.original_content : selectedPost\.content\)/);
});

test('선생님 교정 탭은 최종 글 칸과 같은 폭·두 칸 비율·글 모양을 쓴다', async () => {
    const viewer = await read('src/components/teacher/PostDetailViewer.jsx');
    assert.match(viewer, /showOriginal \|\| showTeacherEdits \|\| !isFeedbackVisible\) \? '1600px'/);
    const css = await read('src/modules/writing/review/teacherEditRounds.css');
    assert.match(css, /\.teacher-edits__pair\s*\{[^}]*repeat\(2, minmax\(0, 1fr\)\)[^}]*gap:\s*30px/);
    const body = css.match(/\.teacher-edits__body\s*\{[^}]*\}/)?.[0] ?? '';
    assert.match(body, /font-size:\s*1\.15rem/);
    assert.match(body, /line-height:\s*1\.8/);
    assert.match(body, /word-break:\s*break-word/);
    const rounds = await read('src/modules/writing/review/TeacherEditRounds.jsx');
    assert.equal((rounds.match(/writing-body" data-format=\{format\}/g) ?? []).length, 2, '두 글 칸 모두 산문 정렬 규칙(.writing-body)을 받아야 합니다.');
});

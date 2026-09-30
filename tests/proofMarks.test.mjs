import assert from 'node:assert/strict';
import test from 'node:test';
import { buildProofMarks, PROOF_CHAR_MAX_CELLS, PROOF_MARK_LEGEND } from '../src/modules/writing/review/proofMarks.js';

/*
 * 선생님 교정지(2026-09-30). 고치기 전 학생 글 → 선생님 수정본을 빨간 펜 교정 부호로 옮긴다.
 * 부호가 한 글자라도 어긋나면 학생이 틀린 곳을 잘못 배우므로 조각을 이어 두 원문이 되살아나는지까지 본다.
 */

const rebuildBefore = (segments) => segments.map((s) => {
    if (s.kind === 'replace') return s.from;
    return ['same', 'delete', 'join'].includes(s.kind) ? s.text : '';
}).join('');
const rebuildAfter = (segments) => segments.map((s) => {
    if (s.kind === 'replace') return s.to;
    return ['same', 'insert', 'split'].includes(s.kind) ? s.text : '';
}).join('');
const kinds = (result) => result.segments.filter((s) => s.kind !== 'same');

const check = (before, after) => {
    const result = buildProofMarks(before, after);
    assert.equal(rebuildBefore(result.segments), before, '고치기 전 글이 되살아나지 않습니다.');
    assert.equal(rebuildAfter(result.segments), after, '선생님 수정본이 되살아나지 않습니다.');
    return result;
};

test('맞춤법 고치기는 틀린 글자만, 지운 말은 따로 표시한다', () => {
    const result = check('학교에 갓다. 그래서 좋았다.', '학교에 갔다. 좋았다.');
    assert.deepEqual(kinds(result), [
        { kind: 'replace', from: '갓', to: '갔' },
        { kind: 'delete', text: ' 그래서' }
    ]);
    assert.equal(result.changeCount, 2);
});

test('띄어 쓰기 ∨ · 붙여 쓰기 ⌒ · 넣기 ∧', () => {
    assert.deepEqual(kinds(check('할수 있다', '할 수 있다')), [{ kind: 'split', text: ' ' }]);
    assert.deepEqual(kinds(check('우리가 이겼 다', '우리가 이겼다')), [{ kind: 'join', text: ' ' }]);
    assert.deepEqual(kinds(check('나는 밥을 먹었다', '나는 맛있는 저녁밥을 먹었다')), [{ kind: 'insert', text: '맛있는 저녁' }]);
});

test('같은 글·빈 글은 부호가 없다', () => {
    assert.equal(buildProofMarks('같은 글', '같은 글').changeCount, 0);
    assert.equal(buildProofMarks('', '').changeCount, 0);
});

test('여러 줄 글도 줄바꿈이 그대로 남는다', () => {
    const result = check('첫 줄이다.\n둘째 줄이 있다', '첫 줄이다.\n둘째 줄도 있다');
    assert.deepEqual(kinds(result), [{ kind: 'replace', from: '이', to: '도' }]);
});

test('덩어리가 너무 크면 글자 비교를 건너뛰고 통째로 고치기로 보인다', () => {
    const side = Math.ceil(Math.sqrt(PROOF_CHAR_MAX_CELLS)) + 5;
    const before = '가'.repeat(side);
    const after = '나'.repeat(side);
    const result = check(before, after);
    assert.deepEqual(kinds(result), [{ kind: 'replace', from: before, to: after }]);
});

test('안내 부호는 조각 종류마다 하나씩 있다', () => {
    const legendKinds = PROOF_MARK_LEGEND.map((item) => item.kind).sort();
    assert.deepEqual(legendKinds, ['delete', 'insert', 'join', 'replace', 'split']);
    for (const item of PROOF_MARK_LEGEND) assert.ok(item.mark && item.label);
});

test('교정지는 글쓴 학생·담임 화면 네 곳에만, 친구 글 창에는 없다', async () => {
    const { readFile } = await import('node:fs/promises');
    const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
    for (const path of [
        'src/components/student/StudentWriting.jsx',
        'src/components/student/MyShelfPostDetail.jsx',
        'src/components/teacher/PostDetailViewer.jsx',
        'src/components/teacher/TeacherStudentAgitPostDetail.jsx'
    ]) {
        const source = await read(path);
        assert.match(source, /<TeacherEditRounds postId=/, `${path} 에 교정지가 없습니다.`);
        assert.match(source, /teacherEditRounds/, `${path} 가 회차 수를 보기 선택에 넘기지 않습니다.`);
    }
    assert.doesNotMatch(await read('src/components/student/PostDetailModal.jsx'), /TeacherEditRounds|teacher_edit_rounds/, '친구 글 창에 교정지가 새었습니다.');
    // 회차 수는 글과 함께 실려 와야 칸이 뜬다.
    for (const path of ['src/hooks/useMissionManager.js', 'src/components/student/MyAgitPanel.jsx', 'src/components/teacher/TeacherStudentAgitViewer.jsx', 'src/hooks/useMissionSubmit.js']) {
        assert.match(await read(path), /teacher_edit_rounds/, `${path} 가 teacher_edit_rounds 를 읽지 않습니다.`);
    }
    const css = await read('src/modules/writing/review/teacherEditRounds.css');
    assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, '교정지 색은 토큰으로만 칠합니다.');
    const tokens = await read('src/styles/design-system.css');
    for (const token of ['--ui-proof-ink', '--ui-proof-paper']) assert.match(tokens, new RegExp(`${token}:`));
});

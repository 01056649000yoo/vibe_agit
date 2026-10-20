import assert from 'node:assert/strict';
import test from 'node:test';
import { attributeWritingChanges, countAttributedChanges, getRewriteShare } from '../src/modules/writing/review/writingAttribution.js';

/*
 * 누가 고쳤는지 가르기(2026-10-20): 판을 차례로 견주므로 조각을 이으면 처음 글과 지금 글이 그대로 되살아나야 한다.
 */

const currentOf = (items) => items.filter((item) => !item.removedBy).map((item) => item.text).join('');
const originalOf = (items) => items.filter((item) => item.author === 'orig').map((item) => item.text).join('');
const marked = (items, author) => items.filter((item) => item.author === author && !item.removedBy).map((item) => item.text.trim());

const ORIGINAL = '오늘은 운동장이 넓어 보였다. 이어달리기를 할수 있어서 신났다.';

test('교정 기록이 없으면 처음 글 → 지금 글이 모두 학생이 고친 것이다', () => {
    const current = '오늘은 운동장이 더 넓어 보였다. 이어달리기를 할수 있어서 신났다.';
    const items = attributeWritingChanges(ORIGINAL, [], current);
    assert.equal(currentOf(items), current);
    assert.equal(originalOf(items), ORIGINAL);
    assert.deepEqual(marked(items, 'student'), ['더']);
    assert.deepEqual(marked(items, 'teacher'), []);
});

test('선생님이 고친 곳은 선생님, 그 뒤 학생이 또 고친 곳은 학생으로 갈린다', () => {
    const base = '오늘은 운동장이 더 넓어 보였다. 이어달리기를 할수 있어서 신났다.'; // 학생이 '더'를 넣음
    const edited = '오늘은 운동장이 더 넓어 보였다. 이어달리기를 할 수 있어서 신났다.'; // 선생님이 띄어쓰기
    const current = '오늘은 운동장이 더 넓어 보였다. 이어달리기를 할 수 있어서 정말 신났다.'; // 학생이 '정말'
    const items = attributeWritingChanges(ORIGINAL, [{ base_content: base, edited_content: edited }], current);
    assert.equal(currentOf(items), current);
    assert.equal(originalOf(items), ORIGINAL);
    assert.deepEqual(marked(items, 'student'), ['더', '정말']);
    assert.deepEqual(marked(items, 'teacher'), ['할 수']);
    assert.ok(items.some((item) => item.removedBy === 'teacher' && item.text.includes('할수')), '선생님이 지운 곳이 남아 있어야 합니다.');
    assert.deepEqual(countAttributedChanges(items), { student: 2, teacher: 1 });
});

test('학생이 선생님 수정본을 다시 지우면 지금 글에는 안 나오고 처음 글은 그대로다', () => {
    const edited = '오늘은 운동장이 매우 넓어 보였다. 이어달리기를 할수 있어서 신났다.';
    const items = attributeWritingChanges(ORIGINAL, [{ base_content: ORIGINAL, edited_content: edited }], ORIGINAL);
    assert.equal(currentOf(items), ORIGINAL);
    assert.equal(originalOf(items), ORIGINAL);
    assert.ok(items.some((item) => item.author === 'teacher' && item.removedBy === 'student'));
});

test('여러 회차도 이어 붙인 글이 그대로 되살아난다', () => {
    const r1b = '가나다 라마바 사아자';
    const r1e = '가나다 라마바 사아자 차카';
    const r2b = '가나다 라마 사아자 차카';
    const r2e = '가나다 라마 사아자 차카 타파';
    const current = '가나다 라마 사아자 차카 타파 하';
    const items = attributeWritingChanges('가나다 라마바 사아', [
        { base_content: r1b, edited_content: r1e },
        { base_content: r2b, edited_content: r2e }
    ], current);
    assert.equal(currentOf(items), current);
    assert.equal(originalOf(items), '가나다 라마바 사아');
});

test('너무 긴 글은 null 을 돌려줘 화면이 옛 비교로 물러선다', () => {
    const big = Array.from({ length: 700 }, (_, i) => `단어${i}`).join('\n');
    const other = Array.from({ length: 700 }, (_, i) => `다른${i}`).join('\n');
    assert.equal(attributeWritingChanges(big, [], other), null);
});

test('처음 글의 절반 이상이 바뀌면 거의 새로 썼다고 보고, 누가 더 지웠는지 알려 준다', () => {
    const original = '하나 둘 셋 넷 다섯 여섯 일곱 여덟';
    // 학생이 앞의 다섯 어절을 갈아 씀(약 60%)
    const studentRewrite = '가 나 다 라 마 여섯 일곱 여덟';
    const byStudent = getRewriteShare(attributeWritingChanges(original, [], studentRewrite));
    assert.equal(byStudent.rewritten, true);
    assert.equal(byStudent.by, 'student');
    // 선생님이 갈아 쓰고 학생은 그대로 냄
    const teacherEdit = '가 나 다 라 마 여섯 일곱 여덟';
    const byTeacher = getRewriteShare(attributeWritingChanges(original, [{ base_content: original, edited_content: teacherEdit }], teacherEdit));
    assert.equal(byTeacher.rewritten, true);
    assert.equal(byTeacher.by, 'teacher');
    // 한 어절만 고치면 안내하지 않는다
    const small = getRewriteShare(attributeWritingChanges(original, [], '하나 둘 셋 넷 다섯 여섯 일곱 여덟째'));
    assert.equal(small.rewritten, false);
    assert.ok(small.percent < 50);
});

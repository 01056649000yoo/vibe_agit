import assert from 'node:assert/strict';
import test from 'node:test';
import { applyCommonResponse, combineStudentEntries } from '../src/modules/writing/student-input/checker/entryCache.js';

const entry = (id, wrong, at, extra = {}) => ({ id, wrong_expression: wrong, correct_expression: `${wrong}!`, updated_at: at, ...extra });

test('처음 받기(full)는 켜진 자료만 그대로 저장한다', () => {
    const { next, consistent } = applyCommonResponse(null, {
        full: true, common_version: 't2', common_count: 2,
        common: [entry('a', '되', 't2', { status: 'approved' }), entry('b', '돼', 't1', { status: 'approved' })]
    });
    assert.equal(consistent, true);
    assert.equal(next.version, 't2');
    assert.deepEqual(next.entries.map((item) => item.id), ['a', 'b']);
    assert.equal(Object.hasOwn(next.entries[0], 'status'), false);
    assert.equal(next.entries[0].scope, 'common');
});

test('바뀐 것만 받으면 고친 것은 덮고, 꺼진 것은 지우고, 새 것은 더한다', () => {
    const cached = { version: 't2', entries: [entry('a', '되', 't2'), entry('b', '돼', 't1'), entry('c', '않', 't0')] };
    const { next, consistent } = applyCommonResponse(cached, {
        full: false, common_version: 't5', common_count: 3,
        common: [
            entry('a', '되요', 't5', { status: 'approved' }),
            entry('b', '돼', 't4', { status: 'disabled' }),
            entry('d', '왠', 't3', { status: 'approved' })
        ]
    });
    assert.equal(consistent, true);
    assert.deepEqual(next.entries.map((item) => item.id), ['a', 'd', 'c']);
    assert.equal(next.entries[0].wrong_expression, '되요');
});

test('합친 개수가 서버와 다르면 믿지 않는다(처음부터 다시 받게)', () => {
    const cached = { version: 't2', entries: [entry('a', '되', 't2')] };
    const { consistent } = applyCommonResponse(cached, { full: false, common_version: 't2', common_count: 5, common: [] });
    assert.equal(consistent, false);
});

test('저장본이 깨졌으면 받은 것만 쓴다', () => {
    const { next } = applyCommonResponse({ version: 'x', entries: 'broken' }, { full: false, common_version: 't1', common_count: 1, common: [entry('a', '되', 't1', { status: 'approved' })] });
    assert.deepEqual(next.entries.map((item) => item.id), ['a']);
});

test('공통 자료가 먼저고, 같은 틀린 표현의 반별 수첩은 뺀다', () => {
    const merged = combineStudentEntries(
        [entry('a', '되요', 't1', { scope: 'common' })],
        [entry('x', ' 되요 ', 't2'), entry('y', '몇일', 't3')]
    );
    assert.deepEqual(merged.map((item) => `${item.id}:${item.scope}`), ['a:common', 'y:class']);
});

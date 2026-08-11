import assert from 'node:assert/strict';
import test from 'node:test';
import {
    collectSpellingCandidates,
    createSpellingCandidateIndex
} from '../src/modules/writing/spelling-learning/candidateIndex.js';
import { findClassSpellingIssues } from '../src/modules/writing/spelling-learning/detection.js';

test('후보 색인은 겹치는 표현과 이모지 뒤의 UTF-16 위치를 보존한다', () => {
    const items = [
        { label: '되/돼', trigger: '되요' },
        { label: '어미', trigger: '요' }
    ];
    const index = createSpellingCandidateIndex(items, (item) => item.trigger);
    const candidates = collectSpellingCandidates('😀되요 되요', index);

    assert.equal(index.size, 2);
    assert.deepEqual(candidates.map(({ item, starts }) => ({ label: item.label, starts })), [
        { label: '되/돼', starts: [2, 5] },
        { label: '어미', starts: [3, 6] }
    ]);
});

test('학급 맞춤법도 라벨 후보만 검사하고 기존 비중첩 위치를 유지한다', () => {
    const entries = [
        { id: 'class-1', wrong_expression: '되요', correct_expression: '돼요', label: '되/돼' },
        { id: 'class-2', wrong_expression: 'aa', correct_expression: 'a', label: '반복 검사' },
        { id: 'class-3', wrong_expression: '같음', correct_expression: '같음', label: '제외' }
    ];

    assert.deepEqual(
        findClassSpellingIssues('😀되요', entries).map(({ start, end, label }) => ({ start, end, label })),
        [{ start: 2, end: 4, label: '되/돼' }]
    );
    assert.deepEqual(
        findClassSpellingIssues('aaaaa', entries).map(({ start, end }) => ({ start, end })),
        [{ start: 0, end: 2 }, { start: 2, end: 4 }]
    );
});

import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
    checkSpelling,
    issuesSafeWhileTyping,
    uniqueSpellingIssues,
    MAX_SPELLING_ISSUES
} from '../src/modules/writing/student-input/checker/spellingEngine.js';
import { findElementarySpellingIssues } from '../src/modules/writing/student-input/checker/elementarySpellingEntries.js';

const engine = (text, entries = []) => checkSpelling(text, { elementaryDetector: findElementarySpellingIssues, entries });

test('학생 입력기 엔진: 빠른 규칙·기본 자료·공통 자료를 겹치지 않게 합쳐 위치 순으로 돌려준다', () => {
    const entries = [{ id: 'c1', wrong_expression: '설겆이', correct_expression: '설거지', label: '설거지' }];
    const issues = engine('김치찌게를 먹고 설겆이를 했다.', entries);
    assert.ok(issues.some((issue) => issue.right === '찌개'));
    assert.ok(issues.some((issue) => issue.right === '설거지'));
    for (let i = 1; i < issues.length; i += 1) {
        assert.ok(issues[i - 1].end <= issues[i].start, '밑줄끼리 겹치면 안 된다');
    }
});

test('학생 입력기 엔진: 바른 글에는 밑줄이 없고, 개수 상한을 넘지 않는다', () => {
    assert.deepEqual(engine('책을 반듯이 놓았어요.'), []);
    assert.deepEqual(engine(''), []);
    const many = Array.from({ length: 80 }, () => '김치찌게').join(' ');
    assert.equal(engine(many).length, MAX_SPELLING_ISSUES);
});

test('학생 입력기 엔진: 기본 자료가 아직 안 왔어도 빠른 규칙만으로 동작한다', () => {
    assert.doesNotThrow(() => checkSpelling('되요 안되요', {}));
});

test('손을 멈추기 전에는 훑은 글과 같은 앞부분의 밑줄만 남긴다', () => {
    const issues = [{ start: 0, end: 3 }, { start: 10, end: 13 }];
    assert.deepEqual(issuesSafeWhileTyping(issues, '0123456789abc', '0123456789abc'), issues);
    assert.deepEqual(issuesSafeWhileTyping(issues, '0123456789abc', '01234X'), [{ start: 0, end: 3 }]);
});

test('같은 항목의 칩은 한 번만', () => {
    const issues = [{ entryId: 'a' }, { entryId: 'a' }, { entryId: 'b' }];
    assert.deepEqual(uniqueSpellingIssues(issues).map((issue) => issue.entryId), ['a', 'b']);
});

test('글을 쓰는 칸은 학생 입력기 모듈 하나로만 만든다(옛 부품·따로 합치는 검사가 다시 생기지 않게)', async () => {
    const index = await readFile('src/modules/writing/student-input/index.js', 'utf8');
    assert.match(index, /StudentTextArea/);
    assert.match(index, /StudentTextField/);
    const toolFiles = await readdir('src/modules/writing/tools/spelling-lookup');
    assert.ok(!toolFiles.includes('SpellingUnderlineTextarea.jsx'));
    assert.ok(!toolFiles.includes('SpellingUnderlineInput.jsx'));
    // 빨간 줄을 구하는 스크립트도 같은 엔진을 쓴다
    for (const script of ['scripts/spelling-shadow.mjs', 'scripts/spelling-scorecard.mjs']) {
        const source = await readFile(script, 'utf8');
        assert.match(source, /checkSpelling\(/, `${script} 는 학생 입력기 엔진을 써야 한다`);
        assert.doesNotMatch(source, /findClassSpellingIssues/, `${script} 가 빨간 줄을 따로 합치고 있다`);
    }
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    buildSpellingQuizPool, createSpellingQuiz, gradeSpellingAnswer, publicQuizQuestion, QUIZ_BLANK,
    SPELLING_QUIZ_LEVELS, spellingSourcesFromCatalog, spellingSourcesFromEntries, spellingSourcesFromLearningEntries
} from '../src/modules/game/spelling-claw/quiz/spellingQuizBuilder.js';
import { getElementarySpellingEntries } from '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js';

/*
 * 맞춤법 퀴즈 만들기(2026-10-01). 사전 항목에서 문제를 그때그때 만든다 — 공통 자료가 게시되면 저절로 출제된다.
 * 화면과 서버가 같은 문제를 내야 하므로 앱 사전과 공개 파일이 같은 묶음을 만드는지까지 본다.
 */
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const basePool = buildSpellingQuizPool(spellingSourcesFromEntries(getElementarySpellingEntries()));

test('앱 사전과 공개 파일(서버가 읽음)이 똑같은 문제 묶음을 만든다', async () => {
    const [lookup, detection] = await Promise.all([
        readFile('public/spelling/elementary-lookup-v1.json', 'utf8'),
        readFile('public/spelling/elementary-detection-v1.json', 'utf8')
    ]);
    const catalogPool = buildSpellingQuizPool(spellingSourcesFromCatalog(JSON.parse(lookup), JSON.parse(detection)));
    assert.deepEqual(catalogPool, basePool);
    assert.ok(new Set(basePool.map((item) => item.entryKey)).size >= 480, '대부분의 사전 항목에서 문제가 나와야 합니다.');
});

test('모든 문제가 바르게 만들어진다 — 정답이 보기에 있고, 고칠 문장은 정말 틀린 문장이다', () => {
    for (const item of basePool) {
        if (item.kind === 'choice') {
            assert.equal(item.choices.length, 2);
            assert.ok(item.choices.includes(item.answer), item.id);
            assert.notEqual(item.choices[0], item.choices[1], item.id);
        } else {
            assert.ok(item.highlight && item.prompt.includes(item.highlight), item.id);
            assert.notEqual(item.prompt, item.solution, `${item.id}: 고칠 문장이 바른 문장과 같습니다.`);
            assert.ok(gradeSpellingAnswer(item, item.answer).correct, item.id);
            assert.ok(!gradeSpellingAnswer(item, item.highlight).correct, `${item.id}: 틀린 말을 그대로 써도 정답입니다.`);
        }
        if (item.type === 'blankChoose') assert.equal(item.prompt.split(QUIZ_BLANK).length, 2, item.id);
        // 정답이 늘 같은 개념 문항(옛 수첩 퀴즈)은 만들지 않는다.
        assert.doesNotMatch(JSON.stringify(item.choices || []), /둘 중 하나만|쓰임이 달라요/);
    }
    // 검출 패턴이 낱말 중간에서 끊긴 조각을 보기로 쓰지 않는다.
    assert.ok(!basePool.some((item) => item.type === 'choose' && item.choices.some((choice) => /걸$/.test(choice))));
    // 뜻 구별 항목(안/않)도 문맥 문제로 나온다.
    assert.ok(basePool.some((item) => item.entryKey === 'base:an-anh' && item.type === 'fixWrite'));
});

test('주관식 채점: 앞뒤 공백·끝 문장부호는 봐주고, 띄어쓰기 문제는 띄어쓰기까지 맞아야 한다', () => {
    const fix = basePool.find((item) => item.entryKey === 'base:an-anh' && item.type === 'fixWrite' && item.answer === '않');
    for (const answer of ['않', ' 않았어요. ', '나는 약속을 잊지 않았어요']) assert.ok(gradeSpellingAnswer(fix, answer).correct, answer);
    assert.ok(!gradeSpellingAnswer(fix, '안았어요').correct);
    const spacing = basePool.find((item) => item.type === 'spacingWrite');
    assert.ok(gradeSpellingAnswer(spacing, spacing.answer).correct);
    assert.ok(!gradeSpellingAnswer(spacing, spacing.answer.replace(/ /g, '')).correct);
    const spaced = basePool.find((item) => item.type === 'fixWrite' && item.answer.includes(' '));
    const nearly = gradeSpellingAnswer(spaced, spaced.answer.replace(/ /g, ''));
    assert.equal(nearly.correct, false);
    assert.equal(nearly.nearMiss, true, '글자는 맞고 띄어쓰기만 다르면 거의 맞았다고 알려야 합니다.');
});

test('10문제: 항목이 겹치지 않고, 난이도별 주관식 수를 지키며, 학생에게는 정답을 보내지 않는다', () => {
    for (const level of Object.values(SPELLING_QUIZ_LEVELS)) {
        const quiz = createSpellingQuiz(basePool, { writeCount: level.writeCount, random: seeded(3) });
        assert.equal(quiz.length, 10);
        assert.equal(quiz.filter((item) => item.kind === 'write').length, level.writeCount);
        assert.equal(new Set(quiz.map((item) => item.entryKey)).size, 10);
        for (const item of quiz) {
            const shown = publicQuizQuestion(item);
            assert.ok(!('answer' in shown) && !('accepted' in shown) && !('solution' in shown));
        }
    }
});

test('새로 게시된 공통 자료와 학급 자료는 저절로 출제되고, 꺼진 자료는 빠진다', () => {
    const rows = [
        { id: 'c1', status: 'approved', wrong_expression: '할수록', correct_expression: '할수록', examples: [] },
        { id: 'c2', status: 'approved', wrong_expression: '먹을만큼', correct_expression: '먹을 만큼', label: '띄어쓰기', explanation: '‘만큼’은 띄어 써요.', examples: ['먹을 만큼만 담아요.'] },
        { id: 'c3', status: 'disabled', wrong_expression: '왠만하면', correct_expression: '웬만하면', examples: ['웬만하면 같이 가자.'] }
    ];
    const pool = buildSpellingQuizPool([...spellingSourcesFromLearningEntries(rows, 'common'), ...spellingSourcesFromEntries(getElementarySpellingEntries())]);
    const common = pool.filter((item) => item.source === 'common');
    assert.ok(common.some((item) => item.type === 'spacingWrite' && item.answer === '먹을 만큼'));
    assert.ok(!common.some((item) => item.entryKey === 'common:c3'), '적용 중지한 공통 자료가 출제됐습니다.');
    assert.ok(!common.some((item) => item.entryKey === 'common:c1'), '틀린 말과 바른 말이 같은 자료로 문제를 만들었습니다.');
    // 먼저 낼 항목(내가 헷갈린 말)이 앞에 온다.
    const quiz = createSpellingQuiz(pool, { writeCount: 4, preferredEntryKeys: ['common:c2'], random: seeded(5) });
    assert.ok(quiz.some((item) => item.entryKey === 'common:c2'));
});

test('문제 만들기는 앱 전용 코드를 부르지 않는다(서버 Deno 에서도 돈다)', async () => {
    // 원본은 서버 함수 폴더에 있고(2026-10-02), 앱 쪽 파일은 그곳을 다시 내보내기만 한다.
    for (const file of ['supabase/functions/spelling-claw/spellingQuizBuilder.js', 'supabase/functions/spelling-claw/prizeTable.js']) {
        const source = await readFile(file, 'utf8');
        assert.doesNotMatch(source, /^import /m, `${file} 가 다른 파일을 부릅니다(Edge 함수 폴더 밖은 운영에 올라가지 않습니다).`);
    }
});

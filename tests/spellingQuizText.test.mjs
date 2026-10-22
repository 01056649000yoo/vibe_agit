import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripMakerNotes } from '../supabase/functions/spelling-weekly-review/reviewCore.js';
import { fixParticles } from '../src/modules/writing/student-input/checker/catalog/koreanText.js';
import {
    QUIZ_BLANK,
    matchLeadingParticle,
    gradeSpellingAnswer,
    createFreshSpellingQuiz,
    buildSpellingQuizPool,
    spellingSourcesFromCatalog
} from '../supabase/functions/spelling-claw/spellingQuizBuilder.js';

const readJson = (name) => JSON.parse(readFileSync(new URL(`../public/spelling/${name}`, import.meta.url), 'utf8'));
const lookup = readJson('elementary-lookup-v1.json');
const detection = readJson('elementary-detection-v1.json');
const pool = buildSpellingQuizPool(spellingSourcesFromCatalog(lookup, detection));

test('따옴표 낱말 뒤 조사를 받침에 맞게 고친다', () => {
    assert.equal(fixParticles('‘귀뜸’가 아니라 ‘귀띔’로 적어요.'), '‘귀뜸’이 아니라 ‘귀띔’으로 적어요.');
    assert.equal(fixParticles('‘모델’라고 써요.'), '‘모델’이라고 써요.');
    assert.equal(fixParticles('‘끈나풀’가 아니라 ‘끄나풀’로 적어요.'), '‘끈나풀’이 아니라 ‘끄나풀’로 적어요.');
    assert.equal(fixParticles('‘줄’는 띄어 써요.'), '‘줄’은 띄어 써요.');
    assert.equal(fixParticles('‘택시’예요. ‘칼슘’예요.'), '‘택시’예요. ‘칼슘’이에요.');
    assert.equal(fixParticles('‘ㅆ’을 써서 ‘했다’예요.'), '‘ㅆ’을 써서 ‘했다’예요.');
});

test('내보낸 설명에는 조사가 틀린 곳이 없다', () => {
    const wrong = lookup.lookupEntries.filter((entry) => fixParticles(entry.explanation) !== entry.explanation);
    assert.deepEqual(wrong.map((entry) => entry.id), []);
});

test('인형뽑기 고르기 보기는 어미 조각(있었 / 있엇)이 아니라 낱말이다', () => {
    const fragments = pool.filter((item) => item.type === 'choose' && /[았었랐렀겠쳤졌꼈]$/u.test(item.answer));
    assert.deepEqual(fragments.map((item) => item.choices.join(' / ')), []);
});

test('같은 문제를 두 번 만들지 않고, 문장 전체가 빈칸인 문제도 없다', () => {
    const signatures = pool.map((item) => `${item.entryKey}|${item.type}|${item.prompt}|${item.answer}`);
    assert.equal(new Set(signatures).size, signatures.length);
    const wholeBlank = pool.filter((item) => item.type === 'blankChoose' && [...item.prompt.replace(QUIZ_BLANK, '').replace(/[^가-힣]/gu, '')].length < 2);
    assert.deepEqual(wholeBlank.map((item) => item.prompt), []);
});

test('틀린 낱말로 바꿔 넣으면 붙은 조사도 그 낱말의 받침에 맞춘다', () => {
    assert.equal(matchLeadingParticle('이 물건을 옮겼어요.', '로보트'), '가 물건을 옮겼어요.');
    assert.equal(matchLeadingParticle('를 길렀어요.', '구렛나루'), '를 길렀어요.');
    assert.equal(matchLeadingParticle('를 먹었다.', '스테잌'), '을 먹었다.');
    assert.equal(matchLeadingParticle('으로 만들었다.', '스티로폴'), '로 만들었다.');
    assert.equal(matchLeadingParticle('은행에 갔다.', '로보트'), '은행에 갔다.');
});

test('빈칸은 앞말에 붙은 낱말의 뒷부분만 비우지 않는다', () => {
    const cut = pool.filter((item) => item.type === 'blankChoose' && /[가-힣]＿＿＿/u.test(item.prompt));
    assert.deepEqual(cut.map((item) => item.prompt), []);
});

test('학생용 설명에서 만든 사람용 메모 문장을 뺀다', () => {
    assert.equal(stripMakerNotes('‘바꼈다’는 틀려요. 하지만 이 표현은 한 학급에서만 나온 것이므로 주의가 필요합니다.'), '‘바꼈다’는 틀려요.');
    assert.equal(stripMakerNotes('‘게’는 앞말과 띄어 써요. 한 번 나온 표현이라 공통 자료로 삼기에는 조심스러워요.'), '‘게’는 앞말과 띄어 써요.');
    assert.equal(stripMakerNotes('‘뵈다’는 ‘보이다’의 준말이에요.'), '‘뵈다’는 ‘보이다’의 준말이에요.');
});

test('주관식은 정답 뒤에 조사까지 붙여 써도 맞게 본다', () => {
    const item = pool.find((entry) => entry.type === 'spacingWrite' && entry.answer === '이 사람');
    assert.ok(item, '이 사람 문제가 있어야 합니다.');
    for (const given of ['이 사람', '이 사람은', ' 이 사람을 ']) assert.ok(gradeSpellingAnswer(item, given).correct, given);
    assert.ok(!gradeSpellingAnswer(item, '이사람은').correct);
});

test('많이 푸는 학생도 80판 동안 같은 말·같은 정답이 다시 나오지 않는다', () => {
    let seed = 7;
    const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
    const seenKeys = []; const seenAnswers = []; // 가장 최근이 앞
    const askedKeys = new Set(); const askedAnswers = new Set();
    for (let round = 0; round < 80; round += 1) {
        const quiz = createFreshSpellingQuiz(pool, seenKeys, { count: 10, writeCount: 4, random, seenAnswers });
        assert.equal(quiz.length, 10);
        assert.equal(new Set(quiz.map((item) => item.answer.replace(/\s/gu, ''))).size, 10, '한 판 안에 같은 정답이 둘 있습니다.');
        for (const item of quiz) {
            const answer = item.answer.replace(/\s/gu, '');
            assert.ok(!askedKeys.has(item.entryKey), `${round + 1}번째 판에서 ${item.entryKey} 가 다시 나왔습니다.`);
            assert.ok(!askedAnswers.has(answer), `${round + 1}번째 판에서 정답 ${item.answer} 가 다시 나왔습니다.`);
            askedKeys.add(item.entryKey); askedAnswers.add(answer);
        }
        seenKeys.unshift(...quiz.map((item) => item.entryKey)); seenAnswers.unshift(...quiz.map((item) => item.answer));
    }
});

test('조사를 줄줄이 이은 말(이가·이이)은 정답으로 보지 않는다', () => {
    const item = { kind: 'write', answer: '이 사람', accepted: ['이 사람'], strictSpacing: true };
    assert.equal(gradeSpellingAnswer(item, '이 사람').correct, true);
    assert.equal(gradeSpellingAnswer(item, '이 사람이').correct, true);
    assert.equal(gradeSpellingAnswer(item, '이 사람은').correct, true);
    assert.equal(gradeSpellingAnswer(item, '이 사람에서도').correct, true);
    assert.equal(gradeSpellingAnswer(item, '이 사람이가').correct, false);
    assert.equal(gradeSpellingAnswer(item, '이 사람이이').correct, false);
});

test('같은 정답을 허용해 채울 때도 한 판은 요청한 문제 수를 넘지 않는다', () => {
    const make = (n, kind, answer) => ({ id: `${kind}${n}`, entryKey: `k-${kind}-${n}`, kind, answer, source: 'base', level: 'daily', type: kind, prompt: `p${n}`, choices: kind === 'choice' ? [answer, `${answer}x`] : undefined });
    const pool = [
        ...[1, 2, 3, 4].map((n) => make(n, 'write', '베개')),
        ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => make(n, 'choice', `낱말${n}`)),
    ];
    for (let round = 0; round < 50; round += 1) {
        const quiz = createFreshSpellingQuiz(pool, [], { count: 10, writeCount: 4 });
        assert.ok(quiz.length <= 10, `문제가 ${quiz.length}개 나왔습니다`);
    }
});

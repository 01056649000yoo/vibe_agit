import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import {
    ARENA_LIMITS, buildDefaultSet, buildSpellingQuestions, buildVocabQuestions, fitExplanation, toArenaPayload, validateArenaQuestions
} from '../src/modules/game/quiz-arena/quizSetBuilder.js';
import { buildSpellingQuizPool, spellingSourcesFromCatalog } from '../supabase/functions/spelling-claw/spellingQuizBuilder.js';

// 퀴즈 아레나 기본 문제 세트: 아지트의 어휘·맞춤법 자료로 만든 문제가 게임 서버 규칙(validate.ts)을 지키는지 본다.
const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const vocab = [3, 4, 5, 6].flatMap((grade) => readJson(`../public/data/grade${grade}_vocab.json`));
const pool = buildSpellingQuizPool(spellingSourcesFromCatalog(readJson('../public/spelling/elementary-lookup-v1.json'), readJson('../public/spelling/elementary-detection-v1.json')));
const seeded = (seed) => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

test('어휘 세트: 한도를 지키고 정답이 보기 안에 한 번만 있으며 뜻에 낱말이 그대로 보이지 않는다', () => {
    const questions = buildVocabQuestions(vocab, { count: 50, rng: seeded(1) });
    assert.equal(questions.length, 50);
    assert.deepEqual(validateArenaQuestions(questions), []);
    for (const q of questions) {
        const answerWord = q.choices[q.answer];
        assert.equal(q.choices.filter((c) => c === answerWord).length, 1);
        const entry = vocab.find((w) => w.word === answerWord && q.text.endsWith(w.definition));
        assert.ok(entry, `뜻과 정답이 맞는 낱말이 없습니다: ${q.text}`);
        assert.ok(!q.text.includes(answerWord), `정답이 문제에 보입니다: ${q.text}`);
    }
});

test('어휘 세트: 한 판 안에서 같은 낱말이 두 번 나오지 않고 정답 위치가 고르게 섞인다', () => {
    const questions = buildVocabQuestions(vocab, { count: 40, rng: seeded(7) });
    const answers = questions.map((q) => q.choices[q.answer]);
    assert.equal(new Set(answers).size, answers.length);
    const positions = [0, 1, 2, 3].map((i) => questions.filter((q) => q.answer === i).length);
    assert.ok(positions.every((n) => n >= 3), `정답 위치가 한쪽에 몰립니다: ${positions}`);
});

test('맞춤법 세트: O/X 정답이 실제 바른 표현과 맞고 한도를 지키며 항목이 겹치지 않는다', () => {
    const questions = buildSpellingQuestions(pool, { count: 50, rng: seeded(3) });
    assert.equal(questions.length, 50);
    assert.deepEqual(validateArenaQuestions(questions), []);
    const oCount = questions.filter((q) => q.answer === 0).length;
    assert.ok(oCount > 10 && oCount < 40, `O/X 비율이 한쪽으로 쏠렸습니다: O ${oCount}/50`);
    // 정답이 O 인 문장은 풀의 정답 표현(고르기: 정답 문장, 빈칸: 정답을 채운 문장)과 일치해야 한다.
    const rightSentences = new Set(pool.filter((i) => i.kind === 'choice').map((i) => (i.prompt.includes('＿＿＿') ? i.prompt.replace('＿＿＿', i.answer) : i.answer)));
    for (const q of questions.filter((item) => item.answer === 0)) {
        assert.ok(rightSentences.has(q.text.replace('바르게 쓴 문장일까요? ', '')), `O 문장이 바른 표현이 아닙니다: ${q.text}`);
    }
});

test('섞기 세트와 서버 전송 모양', () => {
    const questions = buildDefaultSet('mix', { vocab, spellingPool: pool, count: 11, rng: seeded(5) });
    assert.equal(questions.length, 11);
    assert.ok(questions.some((q) => q.kind === 'c4') && questions.some((q) => q.kind === 'ox'));
    const payload = toArenaPayload(questions);
    assert.deepEqual(validateArenaQuestions(payload), []);
    assert.ok(payload.filter((q) => q.kind === 'ox').every((q) => !('choices' in q)));
    assert.deepEqual(buildDefaultSet('없는종류', { vocab, spellingPool: pool }), []);
    assert.equal(buildDefaultSet('vocab', { vocab, count: 999 }).length, ARENA_LIMITS.questions);
});

test('설명은 문장 단위로 줄이고 첫 문장도 길면 뺀다', () => {
    assert.equal(fitExplanation('짧아요.'), '짧아요.');
    assert.equal(fitExplanation('첫 문장이에요. ' + '가'.repeat(100) + '.'), '첫 문장이에요.');
    assert.equal(fitExplanation('가'.repeat(100) + '.'), '');
});

test('검증기는 서버와 같은 잘못을 잡는다', () => {
    assert.ok(validateArenaQuestions([]).length);
    assert.ok(validateArenaQuestions([{ kind: 'c4', text: 'q', choices: ['a', 'a', 'b', 'c'], answer: 0 }]).length);
    assert.ok(validateArenaQuestions([{ kind: 'ox', text: 'q', answer: 2 }]).length);
    assert.ok(validateArenaQuestions([{ kind: 'ox', text: '가'.repeat(61), answer: 0 }]).length);
    assert.deepEqual(validateArenaQuestions([{ kind: 'ox', text: 'q', answer: 1 }]), []);
});

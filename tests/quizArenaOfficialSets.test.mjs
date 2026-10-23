import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildOfficialFile } from '../scripts/build-quiz-arena-official-sets.mjs';
import { validateArenaQuestions } from '../src/modules/game/quiz-arena/quizSetBuilder.js';

// 퀴즈 아레나 기본(공식) 세트: 어휘 학년별 10세트(3~6학년) + 맞춤법 하·중·상 10세트씩 = 70세트, 세트마다 15 또는 20문제.
const file = JSON.parse(readFileSync('public/quiz-arena/official-sets-v1.json', 'utf8'));
const vocab = file.sets.filter((set) => set.kind === 'vocab');
const spelling = file.sets.filter((set) => set.kind === 'spelling');

test('세트 구성: 어휘 40(학년별 10) · 맞춤법 30(수준별 10), 크기는 15·20 번갈아', () => {
    assert.equal(file.version, 1);
    assert.equal(file.sets.length, 70);
    for (const grade of [3, 4, 5, 6]) assert.equal(vocab.filter((set) => set.grade === grade).length, 10);
    for (const level of ['low', 'mid', 'high']) assert.equal(spelling.filter((set) => set.id.startsWith(`official-spelling-${level}-`)).length, 10);
    file.sets.forEach((set, index) => assert.deepEqual([15, 20].includes(set.questions.length), true, `${set.id}: ${set.questions.length}문제`));
    assert.deepEqual(vocab.slice(0, 4).map((set) => set.questions.length), [15, 20, 15, 20]);
    assert.equal(new Set(file.sets.map((set) => set.id)).size, 70);
});

test('모든 문제가 게임 서버 규칙을 지키고 정답 번호가 맞다', () => {
    for (const set of file.sets) {
        assert.deepEqual(validateArenaQuestions(set.questions), [], set.id);
        assert.ok(set.title.length <= 40 && set.description.length <= 200, `${set.id}: 제목·설명 길이`);
        assert.ok(!JSON.stringify(set).includes('undefined'));
    }
});

test('어휘: 한 학년 안에서 낱말이 겹치지 않고, 정답이 문제에 그대로 보이지 않으며, 쉬움·보통·어려움이 섞인다', () => {
    for (const grade of [3, 4, 5, 6]) {
        const answers = vocab.filter((set) => set.grade === grade).flatMap((set) => set.questions.map((q) => q.choices[q.answer]));
        assert.equal(answers.length, 175);
        assert.equal(new Set(answers).size, 175, `${grade}학년 낱말이 겹칩니다`);
    }
    for (const set of vocab) {
        for (const q of set.questions) {
            assert.ok(!q.text.includes(q.choices[q.answer]), `${set.id}: 정답이 문제에 보입니다 — ${q.text}`);
            assert.equal(new Set(q.choices).size, 4);
        }
        assert.ok(set.questions.some((q) => q.text.startsWith('뜻에')) && set.questions.some((q) => q.text.startsWith('빈칸')), `${set.id}: 문제 형태가 한 가지뿐`);
    }
});

test('맞춤법: 같은 항목이 두 번 나오지 않고 O·X 가 거의 반반이며 수준별 세트에 정답이 한쪽으로 몰리지 않는다', () => {
    const texts = spelling.flatMap((set) => set.questions.map((q) => q.text));
    assert.equal(new Set(texts).size, texts.length, '같은 문제가 있습니다');
    for (const set of spelling) {
        const o = set.questions.filter((q) => q.answer === 0).length;
        assert.ok(Math.abs(o - set.questions.length / 2) <= 1, `${set.id}: O ${o}/${set.questions.length}`);
        assert.ok(set.questions.every((q) => q.kind === 'ox' && q.text.startsWith('바르게 쓴 문장일까요?')));
    }
});

test('파일이 생성 스크립트의 결과와 같다(입력 자료나 제외 목록을 바꿨으면 다시 만든다)', () => {
    assert.equal(readFileSync('public/quiz-arena/official-sets-v1.json', 'utf8'), buildOfficialFile());
});

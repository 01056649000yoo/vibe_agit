import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildOfficialFile } from '../scripts/build-quiz-arena-official-sets.mjs';
import { validateArenaQuestions } from '../src/modules/game/quiz-arena/quizSetBuilder.js';

// 퀴즈 아레나 기본(공식) 세트(2026-10-23 판): 어휘 학년×수준별 · 맞춤법 학년(3~6)별. 문항 형식은 O/X·2지선다·4지선다가 섞인다.
const file = JSON.parse(readFileSync('public/quiz-arena/official-sets-v1.json', 'utf8'));
const vocab = file.sets.filter((set) => set.kind === 'vocab');
const spelling = file.sets.filter((set) => set.kind === 'spelling');
const kindsOf = (set) => new Set(set.questions.map((q) => q.kind));

test('세트 구성: 어휘는 학년(3~6)×수준(1~3) 모두 있고, 맞춤법은 학년(3~6)마다 여러 세트, 크기는 15·20', () => {
    assert.equal(file.version, 1);
    for (const grade of [3, 4, 5, 6]) for (const level of [1, 2, 3]) {
        assert.ok(vocab.filter((set) => set.grade === grade && set.level === level).length >= 2, `${grade}학년 수준 ${level} 세트가 모자랍니다`);
    }
    for (const grade of [3, 4, 5, 6]) assert.ok(spelling.filter((set) => set.grade === grade).length >= 10, `${grade}학년 맞춤법 세트가 모자랍니다`);
    file.sets.forEach((set) => assert.ok([15, 20].includes(set.questions.length), `${set.id}: ${set.questions.length}문제`));
    assert.equal(new Set(file.sets.map((set) => set.id)).size, file.sets.length);
    // 한 세트의 낱말은 모두 같은 수준이다(어휘)
    vocab.forEach((set) => assert.ok(set.questions.every((q) => q.meta === undefined) && [1, 2, 3].includes(set.level)));
});

test('모든 문제가 게임 서버 규칙을 지키고 정답 번호가 보기 안에 있다', () => {
    for (const set of file.sets) {
        assert.deepEqual(validateArenaQuestions(set.questions), [], set.id);
        assert.ok(set.title.length <= 40 && set.description.length <= 200, `${set.id}: 제목·설명 길이`);
        assert.ok(!JSON.stringify(set).includes('undefined'));
    }
});

test('문항 형식이 섞인다: 어휘 세트마다 O/X·2지선다·4지선다, 맞춤법 세트마다 O/X·2지선다(4지선다 없음)가 들어 있고 전체 비율이 쏠리지 않는다', () => {
    for (const set of vocab) assert.deepEqual([...kindsOf(set)].sort(), ['c2', 'c4', 'ox'], `${set.id}: 형식이 한 가지 이상 빠졌습니다`);
    for (const set of spelling) assert.deepEqual([...kindsOf(set)].sort(), ['c2', 'ox'], `${set.id}: 맞춤법은 O/X·2지선다만 씁니다`);
    for (const [sets, kinds] of [[vocab, ['ox', 'c2', 'c4']], [spelling, ['ox', 'c2']]]) {
        const all = sets.flatMap((set) => set.questions);
        for (const kind of kinds) assert.ok(all.filter((q) => q.kind === kind).length / all.length > 0.15, `${kind} 비율이 너무 낮습니다`);
        const ox = all.filter((q) => q.kind === 'ox');
        const o = ox.filter((q) => q.answer === 0).length / ox.length;
        assert.ok(o > 0.35 && o < 0.65, `O/X 정답이 한쪽으로 쏠립니다: O ${o}`);
    }
});

test('어휘: 한 학년 안에서 낱말이 겹치지 않고, 정답이 문제에 그대로 보이지 않으며, 보기가 서로 다르다', () => {
    for (const grade of [3, 4, 5, 6]) {
        const words = vocab.filter((set) => set.grade === grade).flatMap((set) => set.questions.map((q) => {
            if (q.kind === 'ox') return q.text.match(/^‘(.+?)’/u)?.[1];
            return q.choices[q.answer];
        }));
        assert.equal(new Set(words).size, words.length, `${grade}학년 낱말이 겹칩니다`);
    }
    for (const set of vocab) for (const q of set.questions) {
        if (q.kind === 'ox') continue;
        assert.ok(!q.text.includes(q.choices[q.answer]), `${set.id}: 정답이 문제에 보입니다 — ${q.text}`);
        assert.equal(new Set(q.choices).size, q.choices.length);
    }
});

test('맞춤법: 같은 문제가 두 번 나오지 않고, 낱말만 보여 주는 문제 없이 모두 문장 속에서 묻는다', () => {
    const texts = spelling.flatMap((set) => set.questions.map((q) => `${q.kind}|${q.text}|${q.choices?.join('/') ?? ''}`));
    assert.equal(new Set(texts).size, texts.length, '같은 문제가 있습니다');
    for (const set of spelling) for (const q of set.questions) {
        const body = q.text.replace(/^(바르게 쓴 (문장|말)일까요\?|빈칸에 알맞은 말은\?) /u, '').replace(/＿+/gu, '').trim();
        assert.ok(body.length >= 6, `${set.id}: 문장이 없습니다 — ${q.text}`);
        assert.ok(q.kind === 'ox' ? /^바르게 쓴 문장일까요\? .*[.!?]$/u.test(q.text) : q.choices.length === 2, `${set.id}: 낱말만 묻는 형식입니다 — ${q.text}`);
    }
});

test('파일이 생성 스크립트의 결과와 같다(입력 자료나 제외 목록을 바꿨으면 다시 만든다)', () => {
    assert.equal(readFileSync('public/quiz-arena/official-sets-v1.json', 'utf8'), buildOfficialFile());
});

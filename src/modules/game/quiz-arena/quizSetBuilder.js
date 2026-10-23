/**
 * 퀴즈 아레나 기본 문제 세트 만들기 (2026-10-22).
 *
 * 아지트에 이미 있는 자료로 아레나 문제(`ox` / `c4`)를 만든다 — 교사가 아무것도 입력하지 않아도 바로 쓸 수 있는 기본값.
 *   · 어휘: `public/data/gradeN_vocab.json`(뜻 → 낱말 4지선다)
 *   · 맞춤법: 인형뽑기와 같은 문제 재료(`spelling-claw/spellingQuizBuilder.js` 의 풀)에서 `바르게 쓴 문장일까요?` O/X
 * 순수 함수라 화면·Edge·시험이 같은 코드를 쓴다. 난수는 `rng` 로 받아 시험에서 고정할 수 있다.
 * 문제 모양과 글자 수 한도는 게임 서버(`suhoryong-arena/server/src/game/validate.ts`)와 같게 둔다 —
 * 서버가 한도를 바꾸면 `ARENA_LIMITS` 도 함께 바꾼다.
 */
import { QUIZ_BLANK } from '../spelling-claw/quiz/spellingQuizBuilder.js';

export const ARENA_LIMITS = Object.freeze({ question: 60, choice: 20, explanation: 80, questions: 50 });

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const shuffle = (list, rng = Math.random) => {
    // 무작위 키를 붙여 정렬한다(자리 바꾸기 대신 — 인덱스 접근 없이 같은 결과).
    return list.map((value) => ({ value, key: rng() })).sort((a, b) => a.key - b.key).map(({ value }) => value);
};

/** 설명이 한도를 넘으면 문장 단위로 줄이고, 첫 문장도 길면 뺀다(잘린 문장은 내보내지 않는다). */
export const fitExplanation = (text, max = ARENA_LIMITS.explanation) => {
    const full = clean(text);
    if (!full) return '';
    if (full.length <= max) return full;
    const sentences = full.match(/[^.!?。]+[.!?。]?/gu)?.map((s) => s.trim()).filter(Boolean) ?? [];
    let out = '';
    for (const sentence of sentences) {
        const next = out ? `${out} ${sentence}` : sentence;
        if (next.length > max) break;
        out = next;
    }
    return out;
};

/**
 * 어휘 4지선다: 뜻을 보고 낱말을 고른다.
 * 오답 보기는 같은 분류의 다른 낱말을 먼저 쓰고, 모자라면 다른 분류에서 채운다. 뜻에 낱말이 그대로 들어 있으면(정답이 보임) 빼고,
 * 글자 수 한도를 넘는 문제·보기는 만들지 않는다.
 */
export const buildVocabQuestions = (words, { count = 10, rng = Math.random, limits = ARENA_LIMITS } = {}) => {
    const seenWords = new Set();
    const usable = (words || []).filter((w) => {
        const word = clean(w?.word);
        const definition = clean(w?.definition);
        if (!word || !definition || word.length > limits.choice || definition.includes(word) || seenWords.has(word)) return false;
        seenWords.add(word); // 학년이 달라도 같은 낱말은 한 번만(한 판에 같은 정답이 두 번 나오지 않게)
        return true;
    });
    const byCategory = new Map();
    usable.forEach((w) => byCategory.set(w.category, [...(byCategory.get(w.category) || []), w]));
    const questions = [];
    for (const item of shuffle(usable, rng)) {
        if (questions.length >= count) break;
        const text = `뜻에 알맞은 낱말은? ${clean(item.definition)}`;
        if (text.length > limits.question) continue;
        const same = shuffle((byCategory.get(item.category) || []).filter((w) => w.word !== item.word), rng);
        const others = shuffle(usable.filter((w) => w.category !== item.category), rng);
        const distractors = [];
        for (const w of [...same, ...others]) {
            const word = clean(w.word);
            if (word !== clean(item.word) && !distractors.includes(word)) distractors.push(word);
            if (distractors.length === 3) break;
        }
        if (distractors.length < 3) continue;
        const choices = shuffle([clean(item.word), ...distractors], rng);
        const example = fitExplanation(item.example, limits.explanation);
        questions.push({ kind: 'c4', text, choices, answer: choices.indexOf(clean(item.word)), ...(example ? { explanation: example } : {}) });
    }
    return questions;
};

/** 맞춤법 O/X: 두 표현 중 하나를 문장으로 보여 주고 바르게 쓴 문장인지 묻는다(정답 비율은 무작위). */
export const buildSpellingQuestions = (pool, { count = 10, rng = Math.random, limits = ARENA_LIMITS } = {}) => {
    const candidates = shuffle((pool || []).filter((item) => item.kind === 'choice' && item.choices?.length === 2 && item.answer), rng);
    const questions = [];
    const seenEntries = new Set();
    for (const item of candidates) {
        if (questions.length >= count) break;
        if (seenEntries.has(item.entryKey)) continue; // 한 판에 같은 항목은 한 번만
        const shown = item.choices[rng() < 0.5 ? 0 : 1];
        const sentence = String(item.prompt).includes(QUIZ_BLANK) ? String(item.prompt).replace(QUIZ_BLANK, shown) : shown;
        const text = `바르게 쓴 문장일까요? ${clean(sentence)}`;
        if (text.length > limits.question) continue;
        const explanation = fitExplanation(item.explanation, limits.explanation);
        seenEntries.add(item.entryKey);
        questions.push({ kind: 'ox', text, choices: ['O', 'X'], answer: shown === item.answer ? 0 : 1, ...(explanation ? { explanation } : {}) });
    }
    return questions;
};

/** 게임 서버로 보내는 모양(`id`·`choices` 는 서버가 다시 만든다). */
export const toArenaPayload = (questions) => questions.map(({ kind, text, choices, answer, explanation }) => (
    { kind, text, ...(kind === 'c4' || kind === 'c2' ? { choices } : {}), answer, ...(explanation ? { explanation } : {}) }
));

/** 서버 검증(`validate.ts`)과 같은 규칙으로 미리 확인한다. 문제 목록이 올바르면 빈 배열. */
export const validateArenaQuestions = (questions, limits = ARENA_LIMITS) => {
    if (!Array.isArray(questions) || questions.length < 1) return ['문제가 없어요'];
    if (questions.length > limits.questions) return [`문제는 ${limits.questions}개까지예요`];
    const problems = [];
    questions.forEach((q, index) => {
        const n = index + 1;
        const text = clean(q?.text);
        if (!text) problems.push(`${n}번 문제 글이 비었어요`);
        else if (text.length > limits.question) problems.push(`${n}번 문제가 ${limits.question}자를 넘어요`);
        if (q?.kind !== 'ox' && q?.kind !== 'c4' && q?.kind !== 'c2') { problems.push(`${n}번 문제 형태(ox / c2 / c4)를 확인해 주세요`); return; }
        let choices = ['O', 'X'];
        if (q.kind === 'c4' || q.kind === 'c2') {
            const want = q.kind === 'c4' ? 4 : 2;
            choices = Array.isArray(q.choices) ? q.choices.map(clean) : [];
            if (choices.length !== want || choices.some((c) => !c)) problems.push(`${n}번 문제 보기는 ${want}개가 필요해요`);
            else if (choices.some((c) => c.length > limits.choice)) problems.push(`${n}번 문제 보기가 ${limits.choice}자를 넘어요`);
            else if (new Set(choices).size !== want) problems.push(`${n}번 문제 보기가 서로 같아요`);
        }
        if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer >= choices.length) problems.push(`${n}번 문제 정답 번호를 확인해 주세요`);
        if (q.explanation && clean(q.explanation).length > limits.explanation) problems.push(`${n}번 해설이 ${limits.explanation}자를 넘어요`);
    });
    return problems;
};

/** 기본 세트 종류. 학년 어휘 + 맞춤법 + 섞기. 어휘 자료는 학년별 JSON 이라 불러오는 쪽(화면)이 넘겨 준다. */
export const DEFAULT_SET_KINDS = Object.freeze([
    { id: 'vocab', label: '어휘 뜻 맞히기', description: '뜻을 보고 알맞은 낱말을 고르는 4지선다', needs: ['vocab'] },
    { id: 'spelling', label: '맞춤법 O/X', description: '문장이 바르게 쓰였는지 O/X', needs: ['spelling'] },
    { id: 'mix', label: '어휘 + 맞춤법 섞기', description: '두 가지를 번갈아 내는 종합 세트', needs: ['vocab', 'spelling'] }
]);

export const buildDefaultSet = (kind, { vocab = [], spellingPool = [], count = 10, rng = Math.random, limits = ARENA_LIMITS } = {}) => {
    const total = Math.min(Math.max(1, Math.floor(count)), limits.questions);
    let questions;
    if (kind === 'vocab') questions = buildVocabQuestions(vocab, { count: total, rng, limits });
    else if (kind === 'spelling') questions = buildSpellingQuestions(spellingPool, { count: total, rng, limits });
    else if (kind === 'mix') {
        const half = Math.ceil(total / 2);
        const a = buildVocabQuestions(vocab, { count: half, rng, limits });
        const b = buildSpellingQuestions(spellingPool, { count: total - half, rng, limits });
        questions = shuffle([...a, ...b], rng);
    } else questions = [];
    return questions;
};

/** 게임 서버 선생님 입구 주소 뒤에 세트를 실어 보내는 주소(`#set=` 은 서버로 가지 않는 해시). 20문제 안팎이라 주소에 담긴다. */
export const arenaOpenUrl = (hostUrl, set) => {
    const json = JSON.stringify({ title: set.title, questions: toArenaPayload(set.questions) });
    const bytes = new TextEncoder().encode(json);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const encoded = btoa(binary).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
    return `${hostUrl}#set=${encoded}`;
};

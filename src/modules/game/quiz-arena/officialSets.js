/**
 * 퀴즈 아레나 **기본(공식) 문제 세트** 만들기 (2026-10-23, 선생님 요청).
 *
 * 아지트에 이미 있는 어휘·맞춤법 자료로 고정 세트를 만든다 — 학년별 어휘 10세트(3~6학년 = 40세트) +
 * 맞춤법 수준별(하·중·상) 10세트씩(30세트), 세트마다 15문제 또는 20문제. 같은 입력이면 항상 같은 세트가 나온다(난수는 고정 씨앗).
 * 결과는 `public/quiz-arena/official-sets-v1.json` 으로 내보내고(`scripts/build-quiz-arena-official-sets.mjs`),
 * 교사 화면의 `기본 세트` 탭이 그 파일을 읽는다. 문제 모양·한도는 `quizSetBuilder.js`(= 게임 서버 검증)를 따른다.
 *
 * 검토에서 지적된 문제(정답이 둘로 읽히는 보기·어색한 문장 등)는 `exclusions` 로 빼고, 빠진 자리는 같은 수준의 다른 자료로
 * 채운다(`scripts/quiz-arena-official-exclusions.json`). 한 자료는 한 학년(수준)의 모든 세트를 통틀어 한 번만 쓴다.
 */
import { QUIZ_BLANK } from '../spelling-claw/quiz/spellingQuizBuilder.js';
import { ARENA_LIMITS, fitExplanation, validateArenaQuestions } from './quizSetBuilder.js';

export const OFFICIAL_SET_COUNT = 10;
export const OFFICIAL_SET_SIZES = Object.freeze([15, 20]);
export const SPELLING_LEVELS = Object.freeze([
    { id: 'low', level: 1, label: '하', title: '쉬움' },
    { id: 'mid', level: 2, label: '중', title: '보통' },
    { id: 'high', level: 3, label: '상', title: '어려움' }
]);

const mulberry32 = (seed) => () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = (list, rng) => list.map((value) => ({ value, key: rng() })).sort((a, b) => a.key - b.key).map(({ value }) => value);
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
/** 세트 크기: 홀수 번째 15문제, 짝수 번째 20문제. */
export const sizeOfSet = (index) => OFFICIAL_SET_SIZES[index % 2];
const sum = (list) => list.reduce((a, b) => a + b, 0);

/** 난이도 칸 수(세트 크기 → 쉬움·보통·어려움 문제 수). 합이 크기와 같다. */
const splitCounts = (size, ratio) => {
    const counts = ratio.map((r) => Math.floor(size * r));
    let rest = size - sum(counts);
    for (let i = 0; rest > 0; i = (i + 1) % counts.length, rest -= 1) counts[i] += 1; // eslint-disable-line security/detect-object-injection
    return counts;
};

/* ---------------- 어휘 ---------------- */

const DEF_PREFIX = '뜻에 알맞은 낱말은? ';
const EX_PREFIX = '빈칸에 알맞은 낱말은? ';

/** 낱말 하나로 만들 수 있는 문제 모양들(뜻형·예문 빈칸형). */
const vocabForms = (word, limits) => {
    const text = clean(word.word);
    const forms = [];
    const definition = clean(word.definition);
    if (definition && !definition.includes(text) && DEF_PREFIX.length + definition.length <= limits.question) {
        forms.push({ type: 'def', text: `${DEF_PREFIX}${definition}` });
    }
    const example = clean(word.example);
    if (example.includes(text)) {
        const blanked = example.replace(text, QUIZ_BLANK);
        if (!blanked.includes(text) && EX_PREFIX.length + blanked.length <= limits.question) forms.push({ type: 'ex', text: `${EX_PREFIX}${blanked}` });
    }
    return forms;
};

const pickDistractors = (target, grade, words, rng) => {
    const name = clean(target.word);
    const same = shuffle(words.filter((w) => w.category === target.category && clean(w.word) !== name), rng);
    const others = shuffle(words.filter((w) => w.category !== target.category && clean(w.word) !== name), rng);
    const out = [];
    for (const w of [...same, ...others]) {
        const candidate = clean(w.word);
        if (candidate.length <= ARENA_LIMITS.choice && !out.includes(candidate) && !clean(target.definition).includes(candidate)) out.push(candidate);
        if (out.length === 3) break;
    }
    return out;
};

/** 검토용 표식(`meta`)을 뺀 문제(서버로 보내는 모양). */
export const stripMeta = (question) => {
    const copy = { ...question };
    delete copy.meta;
    return copy;
};

/** 같은 낱말이 자료에 두 번 있으면 첫 번째만 쓴다. */
const uniqueWords = (words) => {
    const seen = new Set();
    return words.filter((w) => {
        const key = clean(w.word);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

/** 학년 하나의 어휘 세트 10개. 한 낱말은 그 학년 세트들을 통틀어 한 번만 나온다. 쉬움·보통·어려움(자료의 level 1·2·3)을 4:4:2 로 섞는다. */
export const buildVocabSets = (grade, words, { exclusions = [], limits = ARENA_LIMITS } = {}) => {
    const rng = mulberry32(1000 + grade);
    words = uniqueWords(words);
    const banned = new Set(exclusions);
    // 검토에서 뺀 낱말 때문에 뒤쪽 세트가 통째로 밀리지 않게: 섞은 순서는 그대로 두고, 세트에 들어갈 몫(main)과 대체용(reserve)으로 나눈 뒤
    // 뺀 낱말이 걸리면 그 자리만 reserve 에서 채운다.
    const byLevel = new Map([1, 2, 3].map((level) => [level, shuffle(words.filter((w) => w.level === level && vocabForms(w, limits).length), rng)]));
    const need = [0, 0, 0];
    for (let s = 0; s < OFFICIAL_SET_COUNT; s += 1) splitCounts(sizeOfSet(s), [0.4, 0.4, 0.2]).forEach((count, i) => { need[i] += count; }); // eslint-disable-line security/detect-object-injection
    const reserve = new Map([1, 2, 3].map((level) => [level, byLevel.get(level).splice(need[level - 1])]));
    const sets = [];
    for (let s = 0; s < OFFICIAL_SET_COUNT; s += 1) {
        const size = sizeOfSet(s);
        const counts = splitCounts(size, [0.4, 0.4, 0.2]);
        const questions = [];
        [1, 2, 3].forEach((level, li) => {
            // 그 수준 자료가 바닥나면(검토에서 뺀 뒤 쉬운 낱말이 모자라는 학년) 가까운 수준에서 채운다
            const order = [level, ...[1, 2, 3].filter((l) => l !== level).sort((x, y) => Math.abs(x - level) - Math.abs(y - level))];
            for (let n = 0; n < counts[li]; n += 1) { // eslint-disable-line security/detect-object-injection
                const pool = order.map((l) => byLevel.get(l)).find((list) => list.length);
                if (!pool) break;
                let word = pool.shift();
                while (word && banned.has(`g${grade}:${clean(word.word)}`)) word = order.map((l) => reserve.get(l)).find((list) => list.length)?.shift();
                if (!word) break;
                const forms = vocabForms(word, limits);
                // 뜻형을 먼저, 한 세트에서 예문형이 약 40% 되도록 번갈아 쓴다
                const wantEx = (questions.length % 5) >= 3;
                const form = forms.find((f) => f.type === (wantEx ? 'ex' : 'def')) || forms[0];
                const distractors = pickDistractors(word, grade, words, rng);
                if (distractors.length < 3) { n -= 1; continue; }
                const choices = shuffle([clean(word.word), ...distractors], rng);
                const explanation = fitExplanation(form.type === 'def' ? word.example : word.definition, limits.explanation);
                questions.push({ kind: 'c4', text: form.text, choices, answer: choices.indexOf(clean(word.word)), ...(explanation ? { explanation } : {}), meta: { level, word: clean(word.word) } });
            }
        });
        const mixed = shuffle(questions, rng);
        sets.push({
            id: `official-vocab-g${grade}-${String(s + 1).padStart(2, '0')}`,
            title: `${grade}학년 어휘 ${s + 1}세트`,
            grade,
            subject: '국어',
            unit: '어휘 익히기',
            description: `뜻과 예문으로 ${grade}학년 낱말을 익혀요. ${mixed.length}문제, 쉬운 문제와 어려운 문제가 섞여 있어요.`,
            kind: 'vocab',
            questions: mixed
        });
    }
    return sets;
};

/* ---------------- 맞춤법 ---------------- */

const toStatement = (item, shown) => {
    const sentence = String(item.prompt).includes(QUIZ_BLANK) ? String(item.prompt).replace(QUIZ_BLANK, shown) : shown;
    return clean(sentence);
};

/** 맞춤법 O/X 세트: 수준(하·중·상)마다 10세트. 자료는 수준 맵(`difficulty`: 항목키 → 1·2·3)으로 나눈다. 한 항목은 모든 맞춤법 세트를 통틀어 한 번만. */
export const buildSpellingSets = (pool, difficulty, { exclusions = [], limits = ARENA_LIMITS } = {}) => {
    const banned = new Set(exclusions);
    const items = (pool || []).filter((item) => item.kind === 'choice' && item.choices?.length === 2 && item.answer);
    // 항목(entryKey)마다 문제 하나: 보여 줄 문장이 한도 안이어야 한다
    const byEntry = new Map();
    items.forEach((item) => {
        if (byEntry.has(item.entryKey)) return;
        const lengths = item.choices.map((shown) => `바르게 쓴 문장일까요? ${toStatement(item, shown)}`.length);
        if (Math.max(...lengths) <= limits.question) byEntry.set(item.entryKey, item);
    });
    const used = new Set();
    const usedTexts = new Set(); // 문장이 같은 다른 항목도 한 번만(같은 문제가 두 번 나오지 않게)
    const statementsOf = (item) => item.choices.map((shown) => toStatement(item, shown));
    const sets = [];
    for (const lv of SPELLING_LEVELS) {
        const rng = mulberry32(2000 + lv.level);
        const poolOf = (level) => shuffle([...byEntry.values()].filter((item) => difficulty[item.entryKey] === level && !used.has(item.entryKey)), rng);
        const own = poolOf(lv.level);
        // 가까운 수준을 30% 섞는다(하·상은 중, 중은 하·상 절반씩)
        const near = lv.level === 2 ? [poolOf(1), poolOf(3)] : [poolOf(2)];
        for (let s = 0; s < OFFICIAL_SET_COUNT; s += 1) {
            const size = sizeOfSet(s);
            const nearCount = Math.round(size * 0.3);
            const picked = [];
            // 검토에서 뺀 항목이 앞에서 걸리면 그 자리만 같은 목록의 뒤쪽(대체용)에서 채워, 다른 세트가 밀리지 않게 한다
            const take = (list) => {
                let next = list.shift();
                while (next && (banned.has(next.entryKey) || used.has(next.entryKey))) next = list.pop();
                return next;
            };
            for (let n = 0; n < size - nearCount && own.length; n += 1) { const next = take(own); if (next) picked.push(next); }
            for (let n = 0; picked.length < size; n += 1) {
                const source = near[n % near.length];
                const next = take(source) || take(own) || take(near.flat());
                if (!next) break;
                picked.push(next);
            }
            // 같은 문장이 이미 쓰였으면 그 항목은 빼고 같은 풀에서 채운다
            for (let i = picked.length - 1; i >= 0; i -= 1) {
                const statements = statementsOf(picked[i]); // eslint-disable-line security/detect-object-injection
                if (statements.some((t) => usedTexts.has(t))) {
                    picked.splice(i, 1);
                    const spare = [...own, ...near.flat()].find((c) => !used.has(c.entryKey) && !picked.includes(c) && !statementsOf(c).some((t) => usedTexts.has(t)));
                    if (spare) { picked.push(spare); [own, ...near].forEach((list) => { const at = list.indexOf(spare); if (at >= 0) list.splice(at, 1); }); }
                }
            }
            picked.forEach((item) => { used.add(item.entryKey); statementsOf(item).forEach((t) => usedTexts.add(t)); });
            const questions = picked.map((item, index) => {
                // 정답이 O·X 반반이 되게 번갈아 바른 문장·틀린 문장을 보여 준다
                const right = index % 2 === 0;
                const shown = right ? item.answer : item.choices.find((c) => c !== item.answer);
                const explanation = fitExplanation(item.explanation, limits.explanation);
                return { kind: 'ox', text: `바르게 쓴 문장일까요? ${toStatement(item, shown)}`, answer: right ? 0 : 1, ...(explanation ? { explanation } : {}), meta: { level: difficulty[item.entryKey], entry: item.entryKey } };
            });
            sets.push({
                id: `official-spelling-${lv.id}-${String(s + 1).padStart(2, '0')}`,
                title: `맞춤법 ${lv.label}(${lv.title}) ${s + 1}세트`,
                grade: null,
                subject: '국어',
                unit: '맞춤법',
                description: `바르게 쓴 문장인지 O/X로 맞춰요. 수준 ${lv.label}, ${questions.length}문제.`,
                kind: 'spelling',
                questions: shuffle(questions, rng)
            });
        }
    }
    return sets;
};

/** 모든 기본 세트. 문제 하나하나를 서버 규칙으로 검사하고 문제가 있으면 던진다. */
export const buildOfficialSets = ({ vocabByGrade, spellingPool, difficulty, exclusions = {}, limits = ARENA_LIMITS }) => {
    const sets = [
        ...Object.keys(vocabByGrade).sort().flatMap((grade) => buildVocabSets(Number(grade), vocabByGrade[grade], { exclusions: exclusions.vocab || [], limits })), // eslint-disable-line security/detect-object-injection
        ...buildSpellingSets(spellingPool, difficulty, { exclusions: exclusions.spelling || [], limits })
    ];
    sets.forEach((set) => {
        const problems = validateArenaQuestions(set.questions.map(stripMeta), limits);
        if (problems.length) throw new Error(`${set.id}: ${problems[0]}`);
        if (!OFFICIAL_SET_SIZES.includes(set.questions.length)) throw new Error(`${set.id}: 문제 수가 ${set.questions.length}개예요(15 또는 20이어야 함)`);
    });
    return sets;
};

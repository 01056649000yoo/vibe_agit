/**
 * 퀴즈 아레나 **기본(공식) 문제 세트** 만들기 — 2026-10-23 판(문항 형식 다양화).
 *
 * 아지트의 어휘·맞춤법 자료로 고정 세트를 만든다. 같은 입력이면 항상 같은 세트가 나온다(난수는 고정 씨앗).
 *   · 어휘: 학년(3~6) × 수준(쉬움·보통·어려움) 별 세트. 한 세트는 같은 수준 낱말만 모으고, 문항 형식은 섞는다.
 *       4지선다(뜻→낱말) · 4지선다(예문 빈칸) · O/X(낱말과 뜻이 맞는지) — 2지선다는 너무 쉬워 어휘에서 뺐다(2026-10-24)
 *   · 맞춤법: 학년(3~6)별 여러 세트. **문장 속에서만** 묻는다(낱말만 보여 주고 묻지 않는다).
 *       O/X(바르게 쓴 문장인지) · 2지선다(빈칸에 알맞은 말 — 고쳐 쓰기)
 * 세트마다 15문제 또는 20문제. 결과는 `public/quiz-arena/official-sets-v1.json`(`scripts/build-quiz-arena-official-sets.mjs`).
 * 문제 모양·글자 수 한도는 `quizSetBuilder.js`(= 게임 서버 검증)를 따른다.
 *
 * 검토에서 지적된 자료는 `exclusions`(`scripts/quiz-arena-official-exclusions.json`)로 빼고, 그 자리만 같은 수준의 예비 자료로 채운다 —
 * 자리마다 형식이 정해져 있고 예비는 뒤쪽에서 꺼내므로, 자료 하나를 빼도 다른 세트가 밀리지 않는다(다시 검토할 문제가 최소).
 */
import { QUIZ_BLANK } from '../spelling-claw/quiz/spellingQuizBuilder.js';
import { ARENA_LIMITS, fitExplanation, validateArenaQuestions } from './quizSetBuilder.js';

export const OFFICIAL_SET_SIZES = Object.freeze([15, 20]);
export const VOCAB_LEVELS = Object.freeze([
    { level: 1, id: 'easy', label: '쉬움' },
    { level: 2, id: 'normal', label: '보통' },
    { level: 3, id: 'hard', label: '어려움' }
]);
/** 세트 크기별 형식 개수(합 = 크기). */
export const VOCAB_FORMAT_PLAN = Object.freeze({ 15: { def: 6, blank: 6, ox: 3 }, 20: { def: 8, blank: 8, ox: 4 } });
export const SPELLING_FORMAT_PLAN = Object.freeze({ 15: { ox: 7, pair: 8 }, 20: { ox: 10, pair: 10 } });

const hash = (text) => { let h = 2166136261; for (const ch of String(text)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };
const mulberry32 = (seed) => () => {
    seed = (seed + 0x6D2B79F5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const shuffle = (list, rng) => list.map((value) => ({ value, key: rng() })).sort((a, b) => a.key - b.key).map(({ value }) => value);
/** 항목마다 고정된 키로 정렬 — 목록 구성이 바뀌어도 나머지 순서가 그대로다. */
const stableOrder = (list, tag, keyOf) => [...list].sort((a, b) => hash(`${tag}|${keyOf(a)}`) - hash(`${tag}|${keyOf(b)}`));
/** 맞춤법 자료의 해설 가운데 교차 검토에서 부정확하다고 지적된 문구를 바로잡는다(자료 원본은 인형뽑기와 함께 쓰므로 여기서만 고친다). */
const EXPLANATION_FIXES = Object.freeze([
    ['외래어는 된소리(ㄲ·ㄸ·ㅃ·ㅆ·ㅉ)로 적지 않는 것이 원칙이라', '외래어 표기법에 따라'],
    ['‘달라, 달랐다’에서만 ‘ㄹ’이 하나 더 생겨요.', '‘-아’가 붙으면 ‘달라’처럼 ‘ㄹ’이 하나 더 생겨요.'],
    ['‘몰라, 몰랐다’에서만 ‘ㄹ’이 하나 더 생겨요.', '‘-아’가 붙으면 ‘몰라’처럼 ‘ㄹ’이 하나 더 생겨요.'],
    ['매일을 뜻하는 ‘마다’는 앞말에 붙여 써요.', '‘마다’는 하나하나 모두를 뜻하는 조사라서 앞말에 붙여 써요.'],
    ['‘ㅂ’이 바뀌는 말은 ‘-워’로 적어서 ‘무서워’예요.', '‘무섭다’에 ‘-어’가 붙으면 ‘ㅂ’이 ‘우’로 바뀌어 ‘무서워’가 돼요.'],
    ['낱말 사이를 ‘띄우다’에서 온 말이라 ‘띄어쓰기’예요.', '낱말 사이를 띄어 쓰는 일이라 ‘띄어쓰기’예요.'],
    ['뒤 글자가 된소리·거센소리이거나 한자어끼리 합친 말이라 사이시옷을 쓰지 않아서 ‘위층 집’이에요.', '‘층’이 거센소리로 시작하므로 사이시옷 없이 ‘위층’으로 쓰고, ‘집’은 띄어 ‘위층 집’으로 적어요.'],
    ['사람을 귀엽게 이를 때 ‘-둥이’를 써요.', '‘-둥이’로 적고 ‘-동이’로 적지 않아요.'],
    ['시간을 나타내는 의존 명사 ‘때’는 앞말과 띄어 써요.', '시간을 나타내는 ‘때’는 앞말과 띄어 써요.'],
    ['‘안’은 띄어 쓰고 ‘-겠-’은 받침에 ‘ㅆ’을 써요.', '이 문장에서는 ‘안’을 띄어 쓰고, ‘-겠-’은 받침에 ‘ㅆ’을 써요.'],
    ['‘소리 지르고, 문지르고’처럼 써요.', '‘소리 지르고’처럼 써요.'],
    ['‘것이에요’가 줄면 ‘거예요’가 돼요.', '‘거’ 뒤에는 ‘이에요’가 줄어 ‘거예요’라고 써요.'],
    ['어떤 방법으로도 알기 어렵다는 뜻의 말은 ‘도대체’라고 적어요.', '‘도대체’라고 적고 ‘도데체’로 적지 않아요.'],
    ['‘ㅂ’이 바뀌는 말은 ‘-워’로 적어서 ‘즐거워’예요.', '‘즐겁다’는 ‘ㅂ’이 ‘우’로 바뀌어 ‘즐거워’예요.'],
    ['받침이 있는 말 뒤에는 ‘-으려고’를 붙여 ‘먹으려고’예요. ‘ㄹ’을 넣지 않아요.', '‘먹다’ 뒤에는 ‘-으려고’를 붙여 ‘먹으려고’예요. ‘먹을려고’로 쓰지 않아요.'],
    ['위아래가 짝이 있는 말은 ‘윗-’을 써요. ‘아랫니’가 있으니 ‘윗니’예요.', '‘아랫니’와 짝인 말이라 ‘윗니’로 써요.'],
    ['길지 않은 끈의 나머지 조각을 가리켜요.', '길지 않은 끈을 가리켜요.'],
    ['흐트러진 일을 바로잡는 것은 ‘걷잡다’', '번져 가는 것을 붙들어 막는 것은 ‘걷잡다’'],
    ['여러 조각을 이어 붙이거나 내용을 모아 만드는 것은 ‘짜깁기’예요.', '‘짜깁기’로 적고 ‘짜집기’로 적지 않아요.'],
    ['밥이나 국수를 솥에 넣어 익히는 것은 ‘안치다’', '밥이나 국수를 솥에 올리는 것은 ‘안치다’'],
    ['‘안’은 뒤의 ‘돼’와 띄어 써요.', '‘안’은 띄어 쓰고, ‘되어’가 줄면 ‘돼’라고 써요.'],
    ['장소나 경우를 나타내는 ‘데’가 있고, 다른 사람에게 들은 말을 전할 때 쓰는 ‘-대’가 있어요.', '다른 사람에게 들은 말을 전할 때는 ‘-대(요)’를 써요. 직접 겪은 일을 말할 때는 ‘-데(요)’를 써요.'],
    ['외국에서 들어온 이 말은 한글로', '외래어 표기법에 따라'],
    ['외래어는 된소리로 적지 않아서', '외래어 표기법에 따라'],
    ['외래어는 된소리로 적지 않는 것이 원칙이라', '외래어 표기법에 따라'],
    ['외래어 끝의 ‘-ow’는 ‘우’를 붙이지 않고 ‘오’로 적어요.', '‘window’처럼 끝의 ‘-ow’는 ‘우’ 없이 ‘오’로 적는 말이 있어요.'],
    ['위아래 짝이 있는 말이라 ‘위쪽’이에요.', '‘쪽’이 된소리로 시작해서 ‘웃’ 대신 ‘위’를 써서 ‘위쪽’이에요.'],
    ['동작 앞에 붙는 말은 ‘안’이에요. ‘안 보다’ 또는 ‘보지 않다’로 써요.', '‘보이다’ 앞에서 부정을 나타내는 말은 ‘안’이고, 띄어 써서 ‘안 보이던’이에요.']
]);
const fixExplanation = (text) => EXPLANATION_FIXES.reduce((acc, [from, to]) => acc.replaceAll(from, to), String(text ?? ''));
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
const sizeOfSet = (index) => OFFICIAL_SET_SIZES.at(index % 2);
const vocabPlanOf = (size) => (size === 15 ? VOCAB_FORMAT_PLAN[15] : VOCAB_FORMAT_PLAN[20]);
const spellingPlanOf = (size) => (size === 15 ? SPELLING_FORMAT_PLAN[15] : SPELLING_FORMAT_PLAN[20]);
export const stripMeta = (question) => { const copy = { ...question }; delete copy.meta; return copy; };

const eunNeun = (word) => {
    const code = clean(word).codePointAt(clean(word).length - 1) - 0xac00;
    return code >= 0 && code <= 11171 ? (code % 28 === 0 ? '는' : '은') : '은(는)';
};
const formatSequence = (plan, rng) => shuffle(Object.entries(plan).flatMap(([name, count]) => Array.from({ length: count }, () => name)), rng);

/* ---------------- 어휘 ---------------- */

const vocabQuestion = (format, word, helpers) => {
    const { limits, rng, others, confusable = new Set(), isBad = () => false } = helpers;
    const name = clean(word.word), def = clean(word.definition), example = clean(word.example);
    const blanked = example.includes(name) ? example.replace(name, QUIZ_BLANK) : '';
    const exFits = (prefix) => blanked && !blanked.includes(name) && `${prefix}${blanked}`.length <= limits.question;
    const pickFrom = (list, count) => { const out = []; for (const w of list) { const n = clean(w.word); if (n !== name && n.length <= limits.choice && !out.includes(n) && !def.includes(n) && !confusable.has([name, n].sort().join('|')) && !isBad(n)) out.push(n); if (out.length === count) break; } return out; };
    const sameCat = shuffle(others.filter((w) => w.category === word.category), rng);
    const otherCat = shuffle(others.filter((w) => w.category !== word.category), rng);
    if (format === 'def') {
        const text = `뜻에 알맞은 낱말은? ${def}`;
        if (def.includes(name) || text.length > limits.question) return null;
        const distractors = pickFrom([...sameCat, ...otherCat], 3);
        if (distractors.length < 3) return null;
        const choices = shuffle([name, ...distractors], rng);
        return { kind: 'c4', text, choices, answer: choices.indexOf(name), explanation: fitExplanation(example, limits.explanation) };
    }
    if (format === 'blank') {
        if (!exFits('빈칸에 알맞은 낱말은? ')) return null;
        const distractors = pickFrom([...sameCat, ...otherCat], 3);
        if (distractors.length < 3) return null;
        const choices = shuffle([name, ...distractors], rng);
        return { kind: 'c4', text: `빈칸에 알맞은 낱말은? ${blanked}`, choices, answer: choices.indexOf(name), explanation: fitExplanation(def, limits.explanation) };
    }
    // ox: 낱말과 뜻이 맞는지(거짓은 다른 분류 낱말의 뜻을 붙인다 — 확실히 거짓이 되도록)
    const budget = limits.question - (`‘${name}’${eunNeun(name)} `).length;
    const wantTrue = rng() < 0.5;
    if (wantTrue) {
        if (def.length > budget || def.includes(name)) return null;
        return { kind: 'ox', text: `‘${name}’${eunNeun(name)} ${def}`, answer: 0, explanation: fitExplanation(example, limits.explanation) };
    }
    const wrong = otherCat.find((w) => clean(w.definition).length <= budget && !clean(w.definition).includes(name) && !clean(w.definition).includes(clean(w.word))) ?? null;
    if (!wrong) return null;
    return { kind: 'ox', text: `‘${name}’${eunNeun(name)} ${clean(wrong.definition)}`, answer: 1, explanation: fitExplanation(`‘${name}’${eunNeun(name)} ${def}`, limits.explanation) };
};

const buildVocabLevel = (grade, lv, ordered, unique, setCount, banned, limits, confusable) => {
    const rng = mulberry32(hash(`vocab|${grade}|${lv.level}`));
    const sizes = Array.from({ length: setCount }, (_, index) => sizeOfSet(index));
    const need = sizes.reduce((a, b) => a + b, 0);
    const main = ordered.slice(0, need);
    const reserve = ordered.slice(need);
    let cursor = 0;
    const out = [];
    for (const [s, size] of sizes.entries()) {
        const sequence = formatSequence(vocabPlanOf(size), rng);
        const remaining = { ...vocabPlanOf(size) };
        const questions = [];
        const attempt = (candidate) => {
            if (banned.has(`g${grade}:${clean(candidate.word)}`)) return null;
            const preferred = sequence.at(questions.length);
            const order = [preferred, ...Object.keys(remaining).filter((f) => f !== preferred)].filter((f) => remaining[f] > 0); // eslint-disable-line security/detect-object-injection
            const others = unique.filter((w) => clean(w.word) !== clean(candidate.word));
            for (const format of order) {
                const q = vocabQuestion(format, candidate, { limits, rng: mulberry32(hash(`vq|${grade}|${clean(candidate.word)}|${format}`)), others, confusable, isBad: (word) => banned.has(`g${grade}:${word}`) });
                if (q) { remaining[format] -= 1; return { ...q, meta: { level: lv.level, word: clean(candidate.word), format } }; } // eslint-disable-line security/detect-object-injection
            }
            return null;
        };
        while (questions.length < size) {
            // 자리마다 정해진 낱말(main)을 먼저 쓰고, 제외·실패하면 그 자리만 예비(reserve)에서 채워 다른 세트가 밀리지 않게 한다
            let made = cursor < main.length ? attempt(main.at(cursor++)) : null;
            while (!made) {
                const spare = reserve.shift();
                if (!spare) return null;
                made = attempt(spare);
            }
            questions.push(made);
        }
        out.push({
            id: `official-vocab-g${grade}-${lv.id}-${String(s + 1).padStart(2, '0')}`,
            title: `${grade}학년 어휘 ${lv.label} ${s + 1}`,
            grade,
            subject: '국어',
            unit: '어휘',
            description: `${grade}학년 ${lv.label} 수준 낱말을 O/X·4지선다로 풀어요. ${questions.length}문제.`,
            kind: 'vocab',
            level: lv.level,
            questions: shuffle(questions, rng)
        });
    }
    return out;
};

/** 학년 하나의 어휘 세트(수준별). 한 낱말은 그 학년의 모든 세트를 통틀어 한 번만 나온다. */
export const buildVocabSets = (grade, words, { exclusions = [], excludedWords = [], confusable = [], limits = ARENA_LIMITS } = {}) => {
    const banned = new Set([...exclusions, ...excludedWords].map((item) => String(item)));
    const seen = new Set();
    const unique = words.filter((w) => { const key = clean(w.word); if (seen.has(key)) return false; seen.add(key); return true; });
    const sets = [];
    for (const lv of VOCAB_LEVELS) {
        const ordered = stableOrder(unique.filter((w) => w.level === lv.level), `vocab|${grade}|${lv.level}`, (w) => clean(w.word));
        // 세트 수를 줄여 가며 모든 세트가 정해진 크기로 채워지는 가장 많은 수를 찾는다(예비 자료를 남겨 둔다).
        for (let setCount = Math.max(1, Math.floor((ordered.length * 0.9) / 17.5)); setCount >= 1; setCount -= 1) {
            const built = buildVocabLevel(grade, lv, ordered, unique, setCount, banned, limits, new Set(confusable.map((pair) => [...pair].sort().join('|'))));
            if (built) { sets.push(...built); break; }
        }
    }
    return sets;
};

/* ---------------- 맞춤법 ---------------- */

const statementOf = (item, shown) => clean(String(item.prompt).includes(QUIZ_BLANK) ? String(item.prompt).replace(QUIZ_BLANK, shown) : shown);
/** 맞춤법 세트: **학년(3~6) 수준**별로 여러 세트. 항목마다 학년은 `grades`(항목키 → 3~6)로 나눈다.
 * 한 항목은 같은 형식으로는 한 번만, 형식이 다르면 두 형식까지(O/X·2지선다로 같은 말을 다시 풀어 보게) 나온다.
 * 문제는 늘 문장 속에서 묻는다. 세트마다 O/X와 2지선다가 모두 들어가고, 재료가 바닥나면 그 학년은 거기서 끝난다. */
export const buildSpellingSets = (pool, lookupEntries, grades, { exclusions = [], badForms = [], limits = ARENA_LIMITS } = {}) => {
    const banned = new Set(exclusions);
    // 복수 표준어처럼 '틀린 표기'로 쓰면 안 되는 말이 들어 있는 항목은 통째로 뺀다
    const bad = new Set(badForms);
    for (const entry of lookupEntries || []) if (clean(entry.learningLabel || entry.question).split(' / ').some((form) => bad.has(clean(form)))) banned.add(`base:${entry.id}`);
    const choiceItems = new Map(); // 항목당 문제 재료(문장형 우선) — O/X 용
    const blankItems = new Map(); // 항목당 빈칸형 재료 — 2지선다 용
    (pool || []).filter((item) => item.kind === 'choice' && item.choices?.length === 2 && item.answer).forEach((item) => {
        const target = String(item.prompt).includes(QUIZ_BLANK) ? blankItems : choiceItems;
        if (!target.has(item.entryKey)) target.set(item.entryKey, item);
    });
    blankItems.forEach((item, key) => { if (!choiceItems.has(key)) choiceItems.set(key, item); });
    const usedFormats = new Map(); // 항목 → 이미 쓴 형식들
    const usedTexts = new Set(); // 같은 문제(문장·보기)가 두 번 나오지 않게
    const gradeOf = (key) => grades[key]; // eslint-disable-line security/detect-object-injection

    const makePair = (key) => {
        const item = blankItems.get(key);
        const text = `빈칸에 알맞은 말은? ${clean(item.prompt)}`;
        if (clean(String(item.prompt).replace(QUIZ_BLANK, '')).length < 6) return null; // 문장 없이 빈칸뿐인 문제는 만들지 않는다
        if (text.length > limits.question || item.choices.some((c) => clean(c).length > limits.choice)) return null;
        const choices = shuffle(item.choices.map(clean), mulberry32(hash(`${key}|p`)));
        return { kind: 'c2', text, choices, answer: choices.indexOf(clean(item.answer)), explanation: fitExplanation(fixExplanation(item.explanation), limits.explanation) };
    };
    const makeOx = (key, tag) => {
        const item = choiceItems.get(key);
        const right = hash(`${tag}|${key}|ox`) % 2 === 0;
        const shown = right ? item.answer : item.choices.find((c) => c !== item.answer);
        const sentence = statementOf(item, shown);
        if (!/\s/u.test(sentence) || sentence.length < 6 || !/[.!?]$/u.test(sentence)) return null; // 낱말·구만 보여 주고 묻지 않는다(완성된 문장만)
        const text = `${/[.!?]$/u.test(sentence) ? '바르게 쓴 문장일까요?' : '바르게 쓴 말일까요?'} ${sentence}`;
        if (text.length > limits.question) return null;
        return { kind: 'ox', text, answer: right ? 0 : 1, explanation: fitExplanation(fixExplanation(item.explanation), limits.explanation) };
    };
    const questionSignature = (q) => `${q.kind}|${q.text}|${(q.choices ?? []).join('/')}`;

    const sets = [];
    for (const grade of [3, 4, 5, 6]) {
        const tag = `spelling|g${grade}`;
        const rng = mulberry32(hash(tag));
        const inGrade = (key) => gradeOf(key) === grade;
        const queues = {
            pair: stableOrder([...blankItems.keys()].filter(inGrade), `${tag}|pair`, (key) => key),
            ox: stableOrder([...choiceItems.keys()].filter(inGrade), `${tag}|ox`, (key) => key)
        };
        const maker = { pair: makePair, ox: (key) => makeOx(key, tag) };
        const allowed = (key, format) => {
            const seen = usedFormats.get(key);
            return !banned.has(key) && !seen?.has(format) && (seen?.size ?? 0) < 2;
        };
        // 앞에서 꺼낸 항목이 제외·실패하면 목록 뒤쪽(예비)에서 채워, 뒤의 세트들이 밀리지 않게 한다
        const take = (format) => {
            const list = queues[format]; // eslint-disable-line security/detect-object-injection
            let key = list.shift();
            while (key !== undefined) {
                if (allowed(key, format)) {
                    const made = maker[format](key); // eslint-disable-line security/detect-object-injection
                    if (made && !usedTexts.has(questionSignature(made))) return { key, made };
                }
                key = list.pop();
            }
            return null;
        };
        for (let s = 0; s < 80; s += 1) {
            const size = sizeOfSet(s);
            const plan = spellingPlanOf(size);
            if (queues.ox.length < plan.ox || queues.pair.length < plan.pair) break; // 재료가 모자라면 이 학년은 여기서 끝
            const questions = [];
            for (const preferred of formatSequence(plan, rng)) {
                const order = preferred === 'ox' ? ['ox', 'pair'] : ['pair', 'ox'];
                for (const format of order) {
                    const got = take(format);
                    if (!got) continue;
                    usedFormats.set(got.key, new Set([...(usedFormats.get(got.key) ?? []), format]));
                    usedTexts.add(questionSignature(got.made));
                    questions.push({ ...got.made, meta: { grade, entry: got.key, format } });
                    break;
                }
            }
            const kinds = new Set(questions.map((q) => q.kind));
            if (questions.length < size || kinds.size < 2) break; // 두 형식이 모두 있는 꽉 찬 세트만 만든다
            sets.push({
                id: `official-spelling-g${grade}-${String(s + 1).padStart(2, '0')}`,
                title: `${grade}학년 맞춤법 ${s + 1}`,
                grade,
                subject: '국어',
                unit: '맞춤법',
                description: `${grade}학년 수준 맞춤법을 문장 속에서 O/X·2지선다로 풀어요. ${questions.length}문제.`,
                kind: 'spelling',
                level: grade,
                questions: shuffle(questions, rng)
            });
        }
    }
    return sets;
};

/** 모든 기본 세트. 문제 하나하나를 서버 규칙으로 검사하고 문제가 있으면 던진다. */
export const buildOfficialSets = ({ vocabByGrade, spellingPool, lookupEntries, grades, exclusions = {}, limits = ARENA_LIMITS }) => {
    const sets = [
        ...Object.keys(vocabByGrade).sort().flatMap((grade) => buildVocabSets(Number(grade), vocabByGrade[grade], { exclusions: exclusions.vocab || [], excludedWords: exclusions.badWords || [], confusable: exclusions.confusable || [], limits })), // eslint-disable-line security/detect-object-injection
        ...buildSpellingSets(spellingPool, lookupEntries, grades, { exclusions: exclusions.spelling || [], badForms: exclusions.badForms || [], limits })
    ];
    sets.forEach((set) => {
        const problems = validateArenaQuestions(set.questions.map(stripMeta), limits);
        if (problems.length) throw new Error(`${set.id}: ${problems.at(0)}`);
        if (!OFFICIAL_SET_SIZES.includes(set.questions.length)) throw new Error(`${set.id}: 문제 수가 ${set.questions.length}개예요(15 또는 20이어야 함)`);
    });
    return sets;
};

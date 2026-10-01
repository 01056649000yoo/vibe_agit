/* eslint-disable security/detect-object-injection -- 배열·맵은 이 파일이 만든 숫자 인덱스와 문자열 키로만 읽는다. */
/**
 * 맞춤법 퀴즈 만들기·채점 — 하나뿐인 원본(2026-10-01).
 *
 * 문제를 미리 써 두지 않고 **사전 항목에서 그때그때 만든다.** 그래서 관리자가 공통 자료를 게시하거나
 * 교사가 학급 자료를 승인하면 다음 퀴즈부터 저절로 나온다. 화면(실험실)과 서버(2단계 Edge 함수)가
 * 이 파일 하나를 함께 쓴다 — 앱 전용 import 를 넣지 않는다(Deno 에서도 돌아야 한다).
 *
 * 유형
 *   A choose       고르기(객관식)      — 바른 표현은? [돼요 / 되요]  (문맥이 필요한 항목은 문맥째 보여 준다)
 *   B blankChoose  빈칸 고르기(객관식) — 이제 집에 가도 ＿＿＿. [되 / 돼]
 *   D fixWrite     고쳐 쓰기(주관식)   — 오늘 학교에 [갓다]. → 갔다
 *   E spacingWrite 띄어 쓰기(주관식)   — [할수있어요] → 할 수 있어요 (띄어쓰기까지 맞아야 정답)
 * 주관식은 **틀린 말을 보여 주고 고치게** 한다. `빈칸 쓰기` 는 뺐다 — `검은 ＿＿＿으로 이름을 썼어요` 에
 * 사인펜 대신 볼펜을 써도 말이 되어, 정답이 하나로 정해지지 않았다(2026-10-01 시험 출제에서 발견).
 * 고친 낱말만 써도, 고친 문장 전체를 써도 정답이다.
 *
 * 재료: 틀린 말 → 바른 말 쌍(사전의 검출 패턴·공통 자료의 틀린/바른 표현)과 예문.
 * 옛 수첩 퀴즈의 `쓰임이 달라요 / 둘 중 하나만 언제나 맞아요` 같은 개념 문항은 만들지 않는다
 * (정답이 늘 같아 외워 버린다). 그런 항목도 검출 패턴으로 문맥 문제를 만든다.
 */

export const SPELLING_QUIZ_TYPES = Object.freeze({
    choose: { id: 'choose', kind: 'choice', label: '고르기' },
    blankChoose: { id: 'blankChoose', kind: 'choice', label: '빈칸 고르기' },
    fixWrite: { id: 'fixWrite', kind: 'write', label: '고쳐 쓰기' },
    spacingWrite: { id: 'spacingWrite', kind: 'write', label: '띄어 쓰기' }
});

/** 10문제 중 주관식 수(교사가 고르는 난이도). 찍어서 통과하는 일을 막는다. */
export const SPELLING_QUIZ_LEVELS = Object.freeze({
    easy: { id: 'easy', label: '쉬움', writeCount: 3 },
    normal: { id: 'normal', label: '보통', writeCount: 4 },
    hard: { id: 'hard', label: '어려움', writeCount: 6 }
});

export const QUIZ_BLANK = '＿＿＿';
const MAX_WRITE_LENGTH = 10;

const nfc = (value) => String(value ?? '').normalize('NFC');
/** 주관식 답 다듬기: 앞뒤 공백·끝의 문장부호(. ! ?)를 지우고 겹친 공백은 하나로. */
export const normalizeQuizAnswer = (value) => nfc(value).trim().replace(/[.!?。]+$/u, '').trim().replace(/\s+/g, ' ');
const withoutSpaces = (value) => nfc(value).replace(/\s+/g, '');
const isSpacingOnly = (wrong, right) => wrong !== right && withoutSpaces(wrong) === withoutSpaces(right);
const countOccurrences = (text, part) => (part ? text.split(part).length - 1 : 0);
const letterCount = (value) => [...withoutSpaces(value)].length;
/** 예문에서 고칠 곳이 든 어절(문장부호 뗌). `잊지 안았어요` 를 고칠 때 `않았어요` 로 써도 맞게 한다. */
const wordAround = (sentence, focus) => {
    const at = sentence.indexOf(focus);
    if (at < 0) return null;
    const start = sentence.lastIndexOf(' ', at) + 1;
    const endSpace = sentence.indexOf(' ', at + focus.length);
    const word = sentence.slice(start, endSpace < 0 ? sentence.length : endSpace).replace(/[.,!?。·"'’”)]+$/u, '');
    return word && word !== focus ? word : null;
};

/** 문맥 패턴(`학교에 않 간`, 고칠 곳 `않` → `안`)을 바른 문맥으로 바꾼다. */
const correctContext = (pattern) => {
    const text = nfc(pattern.text);
    const target = nfc(pattern.target);
    const right = nfc(pattern.right);
    const offset = Number.isInteger(pattern.targetOffset) && text.slice(pattern.targetOffset, pattern.targetOffset + target.length) === target
        ? pattern.targetOffset
        : text.indexOf(target);
    if (offset < 0) return null;
    return text.slice(0, offset) + right + text.slice(offset + target.length);
};

const addPair = (pairs, pair) => {
    if (!pair.wrong || !pair.right || pair.wrong === pair.right) return;
    if (!pair.focusWrong || !pair.focusRight || pair.focusWrong === pair.focusRight) return;
    if (pairs.some((item) => item.wrong === pair.wrong && item.right === pair.right)) return;
    pairs.push(pair);
};

/**
 * 사전 항목 하나 → 문제 재료. `patterns` 는 검출 패턴(앱 사전은 항목 안에, 공개 파일은 검출 규칙 파일에 있다).
 */
const baseSource = (entry, patterns = []) => {
    const pairs = [];
    for (const pattern of patterns) {
        const target = nfc(pattern.target || pattern.text);
        const right = nfc(pattern.right);
        const text = nfc(pattern.text || target);
        if (text === target) addPair(pairs, { wrong: target, right, focusWrong: target, focusRight: right });
        else {
            const fixed = correctContext({ ...pattern, text, target, right });
            if (fixed) addPair(pairs, { wrong: text, right: fixed, focusWrong: target, focusRight: right });
        }
    }
    // `돼요 / 되요` 처럼 두 표기 중 하나가 정답인 항목은 그 쌍도 재료가 된다.
    const choices = nfc(entry.question).split('/').map((choice) => choice.trim()).filter(Boolean);
    if (choices.length === 2 && choices.includes(entry.answer)) {
        const wrong = choices.find((choice) => choice !== entry.answer);
        addPair(pairs, { wrong, right: entry.answer, focusWrong: wrong, focusRight: entry.answer });
    }
    return {
        key: `base:${entry.id}`, source: 'base', entryId: entry.id,
        label: entry.learningLabel || entry.question, explanation: entry.explanation || '',
        examples: (entry.examples || []).map(nfc), pairs
    };
};

/** 앱 사전(`getElementarySpellingEntries()`, 항목 안에 `detectionPatterns`)에서. */
export const spellingSourcesFromEntries = (entries) => entries.map((entry) => baseSource(entry, entry.detectionPatterns || []));

/** 공개 파일(`elementary-lookup-v1.json` + `elementary-detection-v1.json`)에서 — 서버가 쓴다. */
export const spellingSourcesFromCatalog = (lookupPayload, detectionPayload) => {
    const patternsByEntry = new Map();
    for (const rule of detectionPayload?.elementaryRules || []) {
        patternsByEntry.set(rule.entryId, [...(patternsByEntry.get(rule.entryId) || []), ...(rule.patterns || [])]);
    }
    return (lookupPayload?.lookupEntries || []).map((entry) => baseSource(entry, patternsByEntry.get(entry.id) || []));
};

/** 공통 자료(관리자 게시)·학급 자료(교사 승인) 행에서. 켜진(approved) 것만 넘긴다. */
export const spellingSourcesFromLearningEntries = (rows, source = 'common') => rows
    .filter((row) => !row.status || row.status === 'approved')
    .map((row) => {
        const wrong = nfc(row.wrong_expression).trim();
        const right = nfc(row.correct_expression).trim();
        const pairs = [];
        addPair(pairs, { wrong, right, focusWrong: wrong, focusRight: right });
        return {
            key: `${source}:${row.id}`, source, entryId: row.id,
            label: row.label || `${right} / ${wrong}`, explanation: row.explanation || '',
            examples: (Array.isArray(row.examples) ? row.examples : []).map(nfc), pairs
        };
    });

/** 재료 하나에서 만들 수 있는 문제를 모두 만든다. */
const itemsFromSource = (src) => {
    const items = [];
    const base = { entryKey: src.key, source: src.source, label: src.label, explanation: src.explanation };
    src.pairs.forEach((pair, pairIndex) => {
        const spacing = isSpacingOnly(pair.focusWrong, pair.focusRight);
        // 문맥 항목(검출 패턴이 `숙제하는 데 한 시간이 걸` 처럼 낱말 중간에서 끊긴 조각)은 그대로 보이면 어색하다.
        // 바른 문맥이 들어 있는 예문이 있으면 예문 전체로 보이고, 없으면 고르기 문제를 만들지 않는다.
        const isContext = pair.wrong !== pair.focusWrong;
        const contextExample = isContext ? src.examples.find((sentence) => countOccurrences(sentence, pair.right) === 1) : null;
        if (!isContext || contextExample) {
            const right = contextExample || pair.right;
            const wrong = contextExample ? contextExample.replace(pair.right, pair.wrong) : pair.wrong;
            items.push({
                ...base, id: `${src.key}#${pairIndex}:choose`, type: 'choose', kind: 'choice',
                prompt: '바른 표현을 고르세요.', choices: [right, wrong], answer: right,
                strictSpacing: true, solution: right
            });
        }
        // 예문 속에 바른 말이 꼭 한 번 나오는 것만 쓴다(두 번이면 어디를 비울지 모호하다).
        const example = src.examples.find((sentence) => countOccurrences(sentence, pair.focusRight) === 1);
        if (example) {
            const blanked = example.replace(pair.focusRight, QUIZ_BLANK);
            const wrongSentence = example.replace(pair.focusRight, pair.focusWrong);
            items.push({
                ...base, id: `${src.key}#${pairIndex}:blankChoose`, type: 'blankChoose', kind: 'choice',
                prompt: blanked, choices: [pair.focusRight, pair.focusWrong], answer: pair.focusRight,
                strictSpacing: true, solution: example
            });
            if (!spacing && letterCount(pair.focusRight) <= MAX_WRITE_LENGTH && wrongSentence !== example) {
                items.push({
                    ...base, id: `${src.key}#${pairIndex}:fixWrite`, type: 'fixWrite', kind: 'write',
                    prompt: wrongSentence, highlight: pair.focusWrong, hint: '틀린 곳을 바르게 고쳐 쓰세요',
                    answer: pair.focusRight,
                    accepted: [pair.focusRight, wordAround(example, pair.focusRight), example].filter(Boolean),
                    strictSpacing: false, solution: example
                });
            }
        }
        if (spacing && letterCount(pair.focusRight) <= MAX_WRITE_LENGTH + 4) {
            items.push({
                ...base, id: `${src.key}#${pairIndex}:spacingWrite`, type: 'spacingWrite', kind: 'write',
                prompt: example ? example.replace(pair.focusRight, pair.focusWrong) : pair.focusWrong,
                highlight: pair.focusWrong, hint: '띄어쓰기를 바르게 고쳐 쓰세요',
                answer: pair.focusRight, accepted: [pair.focusRight, example || pair.focusRight],
                strictSpacing: true, solution: example || pair.focusRight
            });
        }
    });
    return items;
};

/** 모든 재료 → 문제 묶음. 같은 항목 키가 겹치면(공통 자료가 학급 자료와 같으면) 먼저 온 것을 쓴다. */
export const buildSpellingQuizPool = (sources) => {
    const seen = new Set();
    const items = [];
    for (const src of sources) {
        if (seen.has(src.key)) continue;
        seen.add(src.key);
        items.push(...itemsFromSource(src));
    }
    return items;
};

const shuffle = (list, random) => {
    const copy = [...list];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swap = Math.floor(random() * (index + 1));
        [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
};

/**
 * 10문제 뽑기. 한 항목에서는 한 문제만, 주관식은 `writeCount` 개.
 * `preferredEntryKeys` 는 먼저 낼 항목(내가 헷갈린 말·우리 반이 자주 틀린 말) — 2단계에서 서버가 채운다.
 */
export const createSpellingQuiz = (pool, { count = 10, writeCount = 4, random = Math.random, preferredEntryKeys = [] } = {}) => {
    const byEntry = new Map();
    for (const item of pool) byEntry.set(item.entryKey, [...(byEntry.get(item.entryKey) || []), item]);
    const preferred = preferredEntryKeys.filter((key) => byEntry.has(key));
    const rest = shuffle([...byEntry.keys()].filter((key) => !preferred.includes(key)), random);
    const order = [...preferred, ...rest];
    const picked = [];
    const used = new Set();
    const take = (kind, limit) => {
        for (const key of order) {
            if (picked.filter((item) => item.kind === kind).length >= limit) return;
            if (used.has(key)) continue;
            const options = byEntry.get(key).filter((item) => item.kind === kind);
            if (!options.length) continue;
            used.add(key);
            picked.push(options[Math.floor(random() * options.length)]);
        }
    };
    take('write', Math.min(writeCount, count));
    take('choice', count - picked.length);
    return shuffle(picked, random).map((item, index) => ({
        ...item,
        number: index + 1,
        choices: item.choices ? shuffle(item.choices, random) : undefined
    }));
};

/** 학생에게 보내는 모양 — 정답·풀이 문장은 빼고 보낸다(2단계에서 서버가 이것만 내려준다). */
export const publicQuizQuestion = (item) => ({
    id: item.id, number: item.number, type: item.type, kind: item.kind, label: item.label,
    prompt: item.prompt, highlight: item.highlight, hint: item.hint, choices: item.choices, source: item.source
});

/**
 * 채점. 주관식은 앞뒤·겹친 공백만 봐주고, 띄어쓰기 문제(strictSpacing)는 띄어쓰기까지 맞아야 한다.
 * 띄어쓰기 문제가 아닌데 글자는 맞고 띄어쓰기만 다르면 `nearMiss`(거의 맞았어요) — 오답으로 센다.
 */
export const gradeSpellingAnswer = (item, input) => {
    const accepted = (item.accepted?.length ? item.accepted : [item.answer]).map(normalizeQuizAnswer);
    const given = normalizeQuizAnswer(input);
    if (!given) return { correct: false, nearMiss: false };
    if (accepted.includes(given)) return { correct: true, nearMiss: false };
    const nearMiss = item.kind === 'write' && !item.strictSpacing
        && accepted.some((answer) => withoutSpaces(given) === withoutSpaces(answer));
    return { correct: false, nearMiss };
};

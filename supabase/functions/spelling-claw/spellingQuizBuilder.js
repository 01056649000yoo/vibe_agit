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
/**
 * 퀴즈마다 꼭 넣는 재료 수(2026-10-03 선생님 결정): 관리자가 게시한 **공통 자료**에서 2문제는 무조건.
 * 공통 자료는 학생들이 실제로 자주 틀린 표현이라 기본 사전 486개 사이에 묻혀 평균 1.3문제만 나왔다.
 * 나머지 칸은 전처럼 무작위라 공통 자료가 더 나올 수도 있다. 공통 자료가 모자라면 있는 만큼만.
 */
export const SPELLING_QUIZ_GUARANTEED = Object.freeze({ common: 2 });
const MAX_WRITE_LENGTH = 10;

const nfc = (value) => String(value ?? '').normalize('NFC');
/** 주관식 답 다듬기: 앞뒤 공백·끝의 문장부호(. ! ?)를 지우고 겹친 공백은 하나로. */
export const normalizeQuizAnswer = (value) => nfc(value).trim().replace(/[.!?。]+$/u, '').trim().replace(/\s+/g, ' ');
const withoutSpaces = (value) => nfc(value).replace(/\s+/g, '');
const isSpacingOnly = (wrong, right) => wrong !== right && withoutSpaces(wrong) === withoutSpaces(right);
const countOccurrences = (text, part) => (part ? text.split(part).length - 1 : 0);
const hangulCount = (value) => [...value.replace(/[^가-힣]/gu, '')].length;
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
        // 검출 패턴은 `있엇` → `있었` 처럼 낱말 앞부분만 잡을 때가 있다. 보기가 낱말이 아니라 조각이 되므로,
        // 낱말 전체(`있었다 / 있엇다`)가 질문에 있으면 그 쪽만 쓴다(2026-10-22).
        for (let index = pairs.length - 1; index >= 0; index -= 1) {
            const pair = pairs[index];
            if (pair.wrong === pair.focusWrong && pair.wrong !== wrong && wrong.includes(pair.wrong) && entry.answer.includes(pair.right)) pairs.splice(index, 1);
        }
        addPair(pairs, { wrong, right: entry.answer, focusWrong: wrong, focusRight: entry.answer });
    }
    return {
        key: `base:${entry.id}`, source: 'base', entryId: entry.id, level: entry.level === 'book' ? 'book' : 'daily',
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

const isHangul = (char) => /[가-힣]/u.test(char || '');
/** 낱말 뒤에 붙어 낱말을 이루지 않는 조사(들)만으로 된 꼬리인가. */
const JOSA_ONLY = /^(?:이에요|예요|이라고|라고|입니다|이다|에서|에게|께서|으로|까지|부터|처럼|보다|밖에|이랑|한테|이|가|은|는|을|를|과|와|도|만|의|에|께|로|랑|나)+$/u;
const PARTICLE_FORMS = new Map(Object.entries({
    가: ['가', '이'], 이: ['가', '이'], 는: ['는', '은'], 은: ['는', '은'], 를: ['를', '을'], 을: ['를', '을'],
    와: ['와', '과'], 과: ['와', '과'], 라고: ['라고', '이라고'], 이라고: ['라고', '이라고'], 예요: ['예요', '이에요'], 이에요: ['예요', '이에요']
}));
const LEADING_PARTICLE = /^(이라고|이에요|으로|라고|예요|가|이|는|은|를|을|와|과|로)(?![가-힣])/u;
/** 낱말을 바꿔 넣은 뒤 바로 붙은 조사를 새 낱말의 받침에 맞춘다(`로봇이` → `로보트가`). 받침에 맞지 않는 조사가 붙은 비현실적 오답을 막는다. */
export const matchLeadingParticle = (after, word) => {
    const match = LEADING_PARTICLE.exec(after);
    const code = (word.slice(-1).codePointAt(0) ?? 0) - 0xAC00;
    if (!match || code < 0 || code > 11171) return after;
    const finalSound = code % 28;
    const particle = match[1];
    let fixed;
    if (particle === '로' || particle === '으로') fixed = finalSound === 0 || finalSound === 8 ? '로' : '으로';
    else {
        const forms = PARTICLE_FORMS.get(particle);
        fixed = forms ? forms[finalSound === 0 ? 0 : 1] : particle;
    }
    return fixed + after.slice(particle.length);
};

/**
 * 예문 속 고칠 곳을 **낱말 단위로** 넓힌다. 고칠 곳이 낱말의 일부(`맛＿＿＿` 의 `있겠다`, `놀랐` 의 `다`)이면 그대로 보기로 쓰면
 * 낱말이 잘린 보기가 되므로, 앞쪽에 붙은 글자와 조사가 아닌 뒤쪽 꼬리까지 포함한다. 조사만 붙었으면 그대로 둔다.
 */
const wholeWordView = (sentence, pair) => {
    const at = sentence.indexOf(pair.focusRight);
    if (at < 0) return null;
    let start = at;
    while (start > 0 && isHangul(sentence[start - 1])) start -= 1;
    const focusEnd = at + pair.focusRight.length;
    let tailEnd = focusEnd;
    while (tailEnd < sentence.length && isHangul(sentence[tailEnd])) tailEnd += 1;
    const tail = sentence.slice(focusEnd, tailEnd);
    // `싫지만` 의 `만` 처럼 어미 `-지` 뒤에 붙은 말은 조사가 아니라 낱말의 일부다.
    const tailIsParticle = JOSA_ONLY.test(tail) && !(pair.focusRight.endsWith('지') && tail.startsWith('만'));
    const end = tail && !tailIsParticle ? tailEnd : focusEnd;
    const prefix = sentence.slice(start, at);
    const suffix = sentence.slice(focusEnd, end);
    return {
        right: prefix + pair.focusRight + suffix,
        wrong: prefix + pair.focusWrong + suffix,
        before: sentence.slice(0, start),
        after: sentence.slice(end),
        widened: Boolean(prefix || suffix)
    };
};
const sentenceWith = (view, word) => view.before + word + matchLeadingParticle(view.after, word);

/** 재료 하나에서 만들 수 있는 문제를 모두 만든다. */
const itemsFromSource = (src) => {
    const items = [];
    const base = { entryKey: src.key, source: src.source, label: src.label, explanation: src.explanation, level: src.level || 'daily' };
    src.pairs.forEach((pair, pairIndex) => {
        // `든, 든` 처럼 한 문제에 빈칸이 둘인 연습 문제 조각은 낱개 문제로 만들 수 없다.
        if (pair.focusRight.includes(',') || pair.focusWrong.includes(',')) return;
        const spacing = isSpacingOnly(pair.focusWrong, pair.focusRight);
        // 문맥 항목(검출 패턴이 `숙제하는 데 한 시간이 걸` 처럼 낱말 중간에서 끊긴 조각)은 그대로 보이면 어색하다.
        // 바른 문맥이 들어 있는 예문이 있으면 예문 전체로 보이고, 없으면 고르기 문제를 만들지 않는다.
        const isContext = pair.wrong !== pair.focusWrong;
        const contextExample = isContext ? src.examples.find((sentence) => countOccurrences(sentence, pair.right) === 1) : null;
        // 예문 속에 바른 말이 꼭 한 번 나오는 것만 쓴다(두 번이면 어디를 비울지 모호하다).
        let example = src.examples.find((sentence) => countOccurrences(sentence, pair.focusRight) === 1);
        let view = example ? wholeWordView(example, pair) : null;
        // `닫히다 / 닫치다` 처럼 사전 꼴인데 예문에는 활용형(`닫혔어요`)으로만 있으면 어간(`닫히` / `닫치`)으로 찾아 예문 속 낱말로 보인다.
        if (!view && pair.focusRight.endsWith('다') && pair.focusWrong.endsWith('다') && pair.focusRight.length >= 3) {
            const stemPair = { focusRight: pair.focusRight.slice(0, -1), focusWrong: pair.focusWrong.slice(0, -1) };
            const stemExample = src.examples.find((sentence) => countOccurrences(sentence, stemPair.focusRight) === 1);
            const stemView = stemExample ? wholeWordView(stemExample, stemPair) : null;
            if (stemView?.right.endsWith('다') || stemView?.widened) { example = stemExample; view = stemView; }
        }
        // `-ㄴ 뒤`·`-을 텐데` 처럼 앞말이 없는 어미 표시는 예문의 실제 낱말로만 보인다.
        const isAffixMark = pair.focusRight.startsWith('-') || pair.focusWrong.startsWith('-');
        if ((!isContext && !isAffixMark) || contextExample) {
            // 낱말만 보이면 틀린 쪽도 다른 뜻의 맞는 말일 수 있다(금새·바다가·대게·번번히). 예문이 있으면 예문 속에서 고르게 한다.
            const inSentence = !isContext && view ? view : null;
            const right = contextExample || (inSentence ? example : pair.right);
            const wrong = contextExample ? contextExample.replace(pair.right, pair.wrong) : inSentence ? sentenceWith(inSentence, inSentence.wrong) : pair.wrong;
            items.push({
                ...base, id: `${src.key}#${pairIndex}:choose`, type: 'choose', kind: 'choice',
                prompt: '바른 표현을 고르세요.', choices: [right, wrong], answer: right,
                strictSpacing: true, solution: right
            });
        }
        if (view) {
            // 빈칸 바로 뒤에 붙은 조사는 보기에 함께 넣는다(`로봇이 / 로보트가`) — 조사만 보고 정답을 알거나 호응이 어긋나지 않게.
            const particle = LEADING_PARTICLE.exec(view.after)?.[1] || '';
            const rest = view.after.slice(particle.length);
            // 문장 전체가 빈칸이면(`＿＿＿.`) 단서가 없어 고를 수 없다 — 남는 한글이 두 자 이상일 때만 낸다(2026-10-22).
            if (hangulCount(view.before + rest) >= 2) items.push({
                ...base, id: `${src.key}#${pairIndex}:blankChoose`, type: 'blankChoose', kind: 'choice',
                prompt: view.before + QUIZ_BLANK + rest,
                choices: [view.right + particle, view.wrong + matchLeadingParticle(particle, view.wrong)], answer: view.right + particle,
                strictSpacing: true, solution: example
            });
            const wrongSentence = sentenceWith(view, view.wrong);
            if (!spacing && letterCount(view.right) <= MAX_WRITE_LENGTH && wrongSentence !== example) {
                items.push({
                    ...base, id: `${src.key}#${pairIndex}:fixWrite`, type: 'fixWrite', kind: 'write',
                    prompt: wrongSentence, highlight: view.wrong, hint: '틀린 곳을 바르게 고쳐 쓰세요',
                    answer: view.right,
                    accepted: [view.right, pair.focusRight, wordAround(example, pair.focusRight), example].filter(Boolean),
                    strictSpacing: false, solution: example
                });
            }
        }
        // 문맥 항목은 문장 없이 낱말만 보이면 정답이 하나로 정해지지 않는다(`갈 걸` → 갈걸 / 갈 것을).
        if (spacing && !(isContext && !view) && !(isAffixMark && !view) && letterCount(view?.right || pair.focusRight) <= MAX_WRITE_LENGTH + 4) {
            const answer = view?.right || pair.focusRight;
            items.push({
                ...base, id: `${src.key}#${pairIndex}:spacingWrite`, type: 'spacingWrite', kind: 'write',
                prompt: view ? sentenceWith(view, view.wrong) : pair.focusWrong,
                highlight: view?.wrong || pair.focusWrong, hint: '띄어쓰기를 바르게 고쳐 쓰세요',
                answer, accepted: [answer, pair.focusRight, example || pair.focusRight],
                strictSpacing: true, solution: example || pair.focusRight
            });
        }
    });
    return items;
};

/**
 * 퀴즈에서 뺀 항목(2026-10-22 교차 점검): 틀리다고 한 쪽도 표준어이거나 붙여 쓰기가 허용되어 정답이 둘이 되거나, 규범이 불확실한 것.
 * 수첩 검색·밑줄 쪽 처리는 그대로이고 인형뽑기 퀴즈에서만 뺀다.
 */
export const SPELLING_QUIZ_SKIPPED_ENTRIES = Object.freeze({
    'base:aneun-cheokhada': '‘아는척하다’ 붙여 쓰기 허용(한글 맞춤법 제47항)',
    'base:bon-chehada': '‘본체하다’ 붙여 쓰기 허용(한글 맞춤법 제47항)',
    'base:expansion-matdaktteurida': '‘맞닥트리다’도 표준어(복수 표준어)',
    'base:x-35cb237de5': '‘길다란’도 표준어(길다랗다)',
    'base:x-a389e4f07d': '‘여지껏’도 표준어',
    'base:x-f5e6d83360': '‘지리하다’도 표준어',
    'base:x-59b74c47e6': '‘알타리무’도 표준어(복수 표준어)',
    'base:expansion-seomtteuk': '‘섬뜻’도 쓰이는 표준어(규범 확인 전까지 뺌)',
    'base:x-35034f0eeb': '‘랍스터’ 규범 표기 확인 전까지 뺌',
    'base:practice-spelling-quiz-059': '‘건들다’ 표준어 여부 확인 전까지 뺌',
    'base:x-63bff7f0c3': '‘찌게개’는 학생이 쓰지 않는 꼴(찌개 / 찌게 항목이 따로 있음)',
    'base:practice-spelling-quiz-010': '‘안 했다 / 않았다’ — ‘않다’도 본동사로 쓰여 정답이 둘로 읽힘',
    'base:x-079ca25c50': '‘상판대기 / 쌍판대기’ 모델 풀이에서 의견이 갈림 — 규범 확인 전까지 뺌',
    'base:x-3cd1217ab9': '‘가득이’를 고치면 ‘가득’도 ‘가득히’도 바른 말',
    'base:x-37f61123bd': '‘전선대’ 표준어 여부 확인 전까지 뺌',
    'base:x-c96c83c2c5': '‘귀엣고리’ 표준어 여부 확인 전까지 뺌',
    'base:x-dc24584f6a': '‘짜증나다 / 짜증 나다’ 둘 다 쓰임',
    'base:hal-geol': '‘할 걸 / 할걸’ 문맥 없이는 정답이 둘',
    'base:practice-spelling-quiz-093': '‘나도 한번 / 한 번 해 보고 싶다’ 문맥에 따라 둘 다 맞음',
    'base:practice-spelling-quiz-086': '‘갈 걸’ 도 바른 말이라 오답 보기가 하나로 정해지지 않음',
    'base:x-d07cba09a7': '‘허위적거리다’ 표준어 여부 확인 전까지 뺌',
    'base:x-b14dcfdc77': '‘소나기비’ 표준어 여부 확인 전까지 뺌',
    'base:x-9b5f76f853': '‘빈자떡’ 표준어 여부 확인 전까지 뺌',
    'base:x-2e22b0737a': '‘애닯다’ 표준어 여부 확인 전까지 뺌',
    'base:expansion-meoritgireum': '‘머릿기름 / 머리기름’ 둘 다 쓰임',
    'base:x-c352b76991': '‘괴퍅하다’ 표준어 여부 확인 전까지 뺌',
    'base:x-f61ae49ef4': '‘궁시렁거리다’ 표준어 여부 확인 전까지 뺌'
});

/** 모든 재료 → 문제 묶음. 같은 항목 키가 겹치면(공통 자료가 학급 자료와 같으면) 먼저 온 것을 쓴다. */
export const buildSpellingQuizPool = (sources) => {
    const seen = new Set();
    const asked = new Set();
    const items = [];
    for (const src of sources) {
        if (seen.has(src.key) || Reflect.has(SPELLING_QUIZ_SKIPPED_ENTRIES, src.key)) continue;
        seen.add(src.key);
        for (const item of itemsFromSource(src)) {
            // 같은 항목의 검출 패턴이 여러 개여도 똑같은 문제는 한 번만 둔다.
            const signature = `${item.entryKey}|${item.type}|${item.prompt}|${item.answer}`;
            if (asked.has(signature)) continue;
            asked.add(signature);
            items.push(item);
        }
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
/*
 * 책 낱말(level: 'book', 2026-10-08 선생님 결정): 책에서 보고 쓸 수 있지만 생활에서는 드문 말(사글세·괴팍하다 같은 것).
 * 밑줄은 똑같이 긋되 퀴즈에는 한 번에 이만큼까지만 섞는다 — 아이들이 모르는 말만 나오면 어렵고 재미가 없다.
 */
export const SPELLING_QUIZ_BOOK_LIMIT = 1;

export const createSpellingQuiz = (pool, {
    count = 10, writeCount = 4, random = Math.random, preferredEntryKeys = [], guaranteed = SPELLING_QUIZ_GUARANTEED,
    bookLimit = SPELLING_QUIZ_BOOK_LIMIT, excludeEntryKeys = []
} = {}) => {
    const byEntry = new Map();
    for (const item of pool) byEntry.set(item.entryKey, [...(byEntry.get(item.entryKey) || []), item]);
    for (const key of excludeEntryKeys) byEntry.delete(key);
    // 꼭 넣을 재료(공통 자료 2개)를 무작위로 골라 먼저 낼 항목 앞에 둔다 — 아래 take 가 먼저 낼 항목부터 쓰므로 반드시 들어간다.
    const mustKeys = Object.entries(guaranteed || {}).flatMap(([source, need]) => shuffle(
        [...byEntry.keys()].filter((key) => byEntry.get(key)[0]?.source === source && !preferredEntryKeys.includes(key)), random
    ).slice(0, Math.max(0, Number(need) || 0)));
    const preferred = [...mustKeys, ...preferredEntryKeys].filter((key) => byEntry.has(key));
    const isBook = (key) => byEntry.get(key)[0]?.level === 'book';
    const restKeys = [...byEntry.keys()].filter((key) => !preferred.includes(key));
    // 책 낱말은 bookLimit 개만 생활 낱말 사이 아무 자리에 끼운다(먼저 낼 항목은 그대로 앞에).
    const daily = shuffle(restKeys.filter((key) => !isBook(key)), random);
    const books = shuffle(restKeys.filter(isBook), random).slice(0, Math.max(0, bookLimit));
    for (const key of books) daily.splice(Math.floor(random() * Math.min(daily.length + 1, count)), 0, key);
    const order = [...preferred, ...daily];
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

/**
 * 전에 푼 적 없는 새 문제로 만든다. `seenEntryKeys` 는 최근에 푼 순서(가장 최근이 앞)의 항목 키 —
 * 전부 빼고도 문제가 모자라면(많이 풀어 새 말이 바닥남) 가장 오래전에 푼 말부터 다시 내서 채운다.
 */
export const createFreshSpellingQuiz = (pool, seenEntryKeys = [], options = {}) => {
    const count = options.count ?? 10;
    const seen = [...new Set(seenEntryKeys)];
    for (let keep = seen.length; keep >= 0; keep = keep > 0 ? Math.floor(keep / 2) : -1) {
        const quiz = createSpellingQuiz(pool, { ...options, excludeEntryKeys: seen.slice(0, keep) });
        if (quiz.length >= count) return quiz;
    }
    return createSpellingQuiz(pool, options);
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
    // 학생이 낱말에 조사까지 붙여 쓴 것(`이 사람은`)도 맞게 본다 — 고칠 곳이 `이 사람` 일 때(2026-10-22 세 모델 풀이에서 발견).
    if (item.kind === 'write' && accepted.some((answer) => given.startsWith(answer) && JOSA_ONLY.test(given.slice(answer.length)))) {
        return { correct: true, nearMiss: false };
    }
    const nearMiss = item.kind === 'write' && !item.strictSpacing
        && accepted.some((answer) => withoutSpaces(given) === withoutSpaces(answer));
    return { correct: false, nearMiss };
};

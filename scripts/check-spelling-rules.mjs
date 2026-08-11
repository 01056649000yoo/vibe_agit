/**
 * 맞춤법 밑줄 규칙 검사기.
 *
 *   node scripts/check-spelling-rules.mjs
 *
 * 규칙을 고치거나 늘린 뒤에 반드시 돌린다. 오탐이 하나라도 나오면 실패로 끝난다.
 *
 * 【왜 오탐을 실패로 두는가 — 2026-08-04 결정】
 * 맞게 쓴 글에 빨간 줄이 그어지는 것은 못 잡는 것보다 나쁘다. 초등학생은 밑줄을 보고
 * 맞는 글을 틀리게 고치거나, 밑줄 자체를 믿지 않게 된다.
 *
 * 아래 '정상' 목록은 실제로 규칙을 늘리다 걸렸던 것들이다. 지우지 말 것 —
 * 예전 `[가-힣]수` 규칙은 '박수 없이'를, `이예요` 규칙은 '고양이예요'를,
 * `꽃입` 규칙은 '꽃입니다'를, `찌게` 규칙은 '고구마를 찌게'를 물었다.
 */

import {
    findSpellingIssues,
    MAX_SPELLING_ISSUES,
    SPELLING_DETECTION_ENTRY_IDS,
    SPELLING_DETECTION_RULE_COUNT
} from '../src/modules/writing/tools/spelling-lookup/spellingDetectionRules.js';
import {
    ELEMENTARY_SPELLING_DETECTION_ENTRY_IDS,
    ELEMENTARY_SPELLING_DETECTION_RULE_COUNT,
    ELEMENTARY_SPELLING_DETECTION_RULES,
    ELEMENTARY_SPELLING_ENTRY_IDS,
    ELEMENTARY_SPELLING_LABEL_COUNT,
    ELEMENTARY_SPELLING_TRIGGER_COUNT,
    findElementarySpellingIssues,
    getElementarySpellingQuizPool,
    getElementarySpellingEntries
} from '../src/modules/writing/tools/spelling-lookup/elementarySpellingEntries.js';
import {
    ELEMENTARY_SPELLING_CATEGORY_COUNTS,
    SPELLING_CATEGORY_DEFINITIONS,
    SPELLING_DETECTION_MODES
} from '../src/modules/writing/tools/spelling-lookup/catalog/index.js';

// ── 전부 올바른 문장. 여기 밑줄이 그어지면 오탐이다 ──────────────────────────
const 정상 = [
    // 명사 + 있다/없다 — '할 수 있다' 규칙이 물기 쉬운 자리
    '친구들이 박수 없이 조용히 들어주었다.',
    '나는 실수 없이 발표를 마쳤다.',
    '점수 없이 즐기는 경기였다.',
    '홀수 없는 줄에 서세요.',
    '가수 있잖아, 내가 좋아하는.',
    '선수 없이 경기를 할 수 없다.',
    '횟수 없이 반복했다.',
    '분수 있는 문제를 풀었다.',
    // 받침 없는 말 + 예요 (이 형태가 맞다)
    '우리 집 고양이예요.',
    '이건 종이예요.',
    '제가 좋아하는 아이예요.',
    '무지개예요.',
    // 꽃입니다 / 나무입니다
    '이것은 예쁜 꽃입니다.',
    '큰 나무입니다.',
    '내가 심은 꽃입니다.',
    // 고유 이름
    '요세미티 국립공원에 가고 싶다.',
    '희안이와 같은 모둠이 되었다.',
    // 띄어쓰기가 이미 올바른 경우
    '나는 할 수 있다고 믿어요.',
    '갈 수 없는 곳이었다.',
    '그것 같은 색깔이에요.',
    '한 번 더 해 볼게요.',
    '내일 갈게요.',
    '내가 도와줄게.',
    // 문맥에 따라 맞는 표현 — 규칙에서 일부러 뺀 것들
    '공부가 안돼서 속상했다.',
    '엄마가 동생을 낳았다.',
    '색이 바램 없이 그대로다.',
    '선생님이 가르쳐 주셨다.',
    '시계가 가리키는 시각을 보았다.',
    '이따가 만나자.',
    '교실에 있다가 나왔다.',
    '학생으로서 최선을 다했다.',
    '비가 온대.',
    '맛있는 곳을 안다는데.',
    // 올바른 -이/-히 부사
    '방을 깨끗이 청소했다.',
    '곰곰이 생각해 보았다.',
    '솔직히 말하면 조금 무서웠다.',
    '조용히 앉아 있었다.',
    '가만히 기다렸다.',
    '나란히 걸어갔다.',
    // 올바른 사이시옷
    '등굣길에 친구를 만났다.',
    '하굣길이 즐거웠다.',
    '나뭇잎이 떨어졌다.',
    '꽃잎이 날렸다.',
    // 기타
    '오랫동안 기다렸다.',
    '요새 날씨가 좋다.',
    '왠지 기분이 좋아요.',
    '웬일로 일찍 왔니?',
    '책을 책상 위에 반듯이 놓았어요.',
    '줄을 반듯이 그었어요.',
    '글씨를 반듯이 썼어요.',
    '책을 반드시 책상 위에 놓아야 해요.',
    '고구마를 찌게 불을 켰다.',
    '떡을 볶기 시작했다.'
];

// ── 전부 틀린 문장. 여기서 못 잡으면 미탐이다 ───────────────────────────────
const 오류 = [
    ['학교에 갔슴니다.', '갔습니다'],
    ['비가 오고 있슴니다.', '있습니다'],
    ['숙제를 다 했읍니다.', '했습니다'],
    ['제 이름은 민수임니다.', '민수입니다'],
    ['그렇게 하면 안 되요.', '안 돼요'],
    ['드디어 다 됬어요.', '됐어요'],
    ['오늘 몇일이야?', '며칠'],
    ['내 역활이 뭐야?', '역할'],
    ['설레임이 가득했다.', '설렘'],
    ['금새 끝났어요.', '금세'],
    ['오랫만에 만났다.', '오랜만'],
    ['방을 깨끗히 치웠다.', '깨끗이'],
    ['곰곰히 생각했다.', '곰곰이'],
    ['일일히 확인했다.', '일일이'],
    ['틈틈히 연습했다.', '틈틈이'],
    ['왠일인지 조용하다.', '웬일'],
    ['그거 어떻해?', '어떡해'],
    ['이거 어떡게 해?', '어떻게'],
    ['제 것이 아니예요.', '아니에요'],
    ['내일 뵈요.', '봬요'],
    ['도데체 무슨 일이야?', '도대체'],
    ['어의없는 일이었다.', '어이없는'],
    ['눈쌀을 찌푸렸다.', '눈살'],
    ['설겆이를 했다.', '설거지'],
    ['김치찌게를 먹었다.', '김치찌개'],
    ['육계장이 맛있었다.', '육개장'],
    ['떡볶기를 먹었다.', '떡볶이'],
    ['갑짜기 비가 왔다.', '갑자기'],
    ['어짜피 늦었어.', '어차피'],
    ['하마트면 넘어질 뻔했다.', '하마터면'],
    ['챙피해서 숨었다.', '창피'],
    ['마춤법을 공부했다.', '맞춤법'],
    ['통털어 열 명이다.', '통틀어'],
    ['짜집기한 글이다.', '짜깁기'],
    ['개구장이 동생.', '개구쟁이'],
    ['등교길에서 만났다.', '등굣길'],
    ['나무잎이 예뻤다.', '나뭇잎'],
    ['갈수 있어요.', '갈 수'],
    ['먹을수 있나요?', '먹을 수'],
    ['그럴 것같아요.', '것 같아요'],
    ['내가 할께요.', '할게요'],
    ['이따 갈꺼야.', '갈 거야'],
    ['숙제는 반듯이 해야 해요.', '반드시'],
    ['규칙을 반듯이 지켜야 해요.', '반드시'],
    ['내일 반듯이 참석하세요.', '반드시']
];

let 오탐 = 0;
const 오탐목록 = [];
for (const 문장 of 정상) {
    for (const issue of [...findSpellingIssues(문장), ...findElementarySpellingIssues(문장)]) {
        오탐 += 1;
        오탐목록.push(`  "${문장}"\n      └ "${issue.text}" ← 규칙 ${issue.ruleId} (${issue.wrong}→${issue.right})`);
    }
}

let 미탐 = 0;
const 미탐목록 = [];
for (const [문장, 정답] of 오류) {
    if (findSpellingIssues(문장).length === 0 && findElementarySpellingIssues(문장).length === 0) {
        미탐 += 1;
        미탐목록.push(`  "${문장}"  (→ ${정답})`);
    }
}

console.log(`맞춤법 밑줄 규칙 기본 자료 ${ELEMENTARY_SPELLING_DETECTION_RULE_COUNT}개 · 빠른 고정 검사 ${SPELLING_DETECTION_RULE_COUNT}개\n`);
console.log(`오탐  정상 문장 ${정상.length}개 중 ${오탐}건`);
if (오탐목록.length) console.log(오탐목록.join('\n'));
console.log(`미탐  오류 문장 ${오류.length}개 중 ${미탐}건`);
if (미탐목록.length) console.log(미탐목록.join('\n'));

if (오탐 > 0) {
    console.error('\n실패 — 맞는 글에 밑줄이 그어진다. 오탐은 하나도 허용하지 않는다.');
    process.exit(1);
}
if (미탐 > 0) {
    console.error('\n실패 — 틀린 글을 놓친다.');
    process.exit(1);
}

const 반복오류 = '되요 '.repeat(MAX_SPELLING_ISSUES + 10);
const 제한결과 = findSpellingIssues(반복오류);
if (제한결과.length !== MAX_SPELLING_ISSUES) {
    console.error(`\n실패 — 밑줄 결과 상한이 ${MAX_SPELLING_ISSUES}개로 지켜지지 않는다.`);
    process.exit(1);
}

const 수첩항목 = new Set(ELEMENTARY_SPELLING_ENTRY_IDS);
const 없는수첩항목 = SPELLING_DETECTION_ENTRY_IDS.filter((id) => !수첩항목.has(id));
if (없는수첩항목.length > 0) {
    console.error(`\n실패 — 감지 규칙이 가리키는 수첩 항목이 없다: ${없는수첩항목.join(', ')}`);
    process.exit(1);
}

const 기본규칙아이디 = new Set(ELEMENTARY_SPELLING_DETECTION_ENTRY_IDS);
const 빈기본규칙 = ELEMENTARY_SPELLING_DETECTION_RULES.filter((rule) => rule.patterns.length === 0);
const 라벨없는기본규칙 = ELEMENTARY_SPELLING_DETECTION_RULES.filter((rule) => !rule.label || !rule.category);
if (
    ELEMENTARY_SPELLING_DETECTION_RULE_COUNT !== 500 ||
    기본규칙아이디.size !== 500 ||
    빈기본규칙.length > 0 ||
    라벨없는기본규칙.length > 0 ||
    ELEMENTARY_SPELLING_ENTRY_IDS.some((id) => !기본규칙아이디.has(id))
) {
    console.error(`\n실패 — 500개 기본 자료 밑줄 연결 오류: 규칙 ${ELEMENTARY_SPELLING_DETECTION_RULE_COUNT}개, 고유 항목 ${기본규칙아이디.size}개, 빈 규칙 ${빈기본규칙.length}개, 라벨 없음 ${라벨없는기본규칙.length}개`);
    process.exit(1);
}
console.log(`라벨 색인  학습 라벨 ${ELEMENTARY_SPELLING_LABEL_COUNT}개 · 검사 표현 ${ELEMENTARY_SPELLING_TRIGGER_COUNT}개 · 후보 문맥만 확인`);

const 전체수첩항목 = getElementarySpellingEntries();
const 중복수첩아이디 = 전체수첩항목.length - new Set(전체수첩항목.map((entry) => entry.id)).size;
const 불완전수첩항목 = 전체수첩항목.filter((entry) => (
    !entry.category ||
    !entry.categoryId ||
    !entry.subcategory ||
    !entry.subcategoryId ||
    !entry.detectionMode ||
    !entry.explanation ||
    !entry.examples?.length ||
    !entry.source?.url
));
const 사전형수첩항목 = 전체수첩항목.filter((entry) => entry.contentType === 'reference');
const 문장형수첩항목 = 전체수첩항목.filter((entry) => entry.contentType === 'practice');
const 잘못된예문수 = 전체수첩항목.filter((entry) => (
    entry.examples.length !== (entry.contentType === 'practice' ? 1 : 2)
));
const 예문오탐 = 전체수첩항목.flatMap((entry) => entry.examples.flatMap((example) => (
    [...findSpellingIssues(example), ...findElementarySpellingIssues(example)]
        .map((issue) => ({ entryId: entry.id, example, issue }))
)));
if (
    전체수첩항목.length !== 500 ||
    사전형수첩항목.length !== 400 ||
    문장형수첩항목.length !== 100 ||
    중복수첩아이디 > 0 ||
    불완전수첩항목.length > 0 ||
    잘못된예문수.length > 0 ||
    예문오탐.length > 0
) {
    console.error(`\n실패 — 수첩 데이터 품질 오류: 전체 ${전체수첩항목.length}개, ID 중복 ${중복수첩아이디}개, 불완전 ${불완전수첩항목.length}개`);
    for (const item of 예문오탐.slice(0, 10)) {
        console.error(`  ${item.entryId}: "${item.example}"에서 "${item.issue.text}" 오탐`);
    }
    process.exit(1);
}
console.log(`수첩  기본 자료 ${전체수첩항목.length}개(사전형 400 + 문장형 100) · 바른 예문 오탐 0건 · 설명/출처 확인`);

const 기대분류수 = {
    grammar: 130,
    conjugation: 55,
    meaning: 64,
    word: 156,
    compound: 49,
    loanword: 46
};
const 분류정의 = new Map(SPELLING_CATEGORY_DEFINITIONS.map((category) => [category.id, category]));
const 검출방식 = new Set(SPELLING_DETECTION_MODES.map((mode) => mode.id));
const 잘못된분류 = 전체수첩항목.filter((entry) => {
    const category = 분류정의.get(entry.categoryId);
    return !category
        || !category.subcategories.some((subcategory) => subcategory.id === entry.subcategoryId)
        || !검출방식.has(entry.detectionMode);
});
const 잘못된순서 = 전체수첩항목.filter((entry, index) => entry.sortOrder !== index + 1);
const 잘못된검출방식 = 전체수첩항목.filter((entry) => {
    const hasContext = entry.detectionPatterns.some((pattern) => {
        const target = pattern.target || pattern.text;
        return pattern.text !== target || (pattern.targetOffset || 0) > 0;
    });
    const inferred = hasContext
        ? 'context'
        : entry.detectionPatterns.some((pattern) => pattern.text.includes(' ')) ? 'phrase' : 'exact';
    return inferred !== entry.detectionMode;
});
const 분류수불일치 = Object.entries(기대분류수)
    .filter(([categoryId, count]) => ELEMENTARY_SPELLING_CATEGORY_COUNTS[categoryId] !== count);
if (
    잘못된분류.length > 0
    || 잘못된순서.length > 0
    || 잘못된검출방식.length > 0
    || 분류수불일치.length > 0
) {
    console.error(`\n실패 — 분류 계약 오류: 분류 ${잘못된분류.length}개, 순서 ${잘못된순서.length}개, 검출 방식 ${잘못된검출방식.length}개, 개수 불일치 ${분류수불일치.length}개`);
    process.exit(1);
}
console.log('분류  문장 규칙 130 · 용언 활용 55 · 뜻 구별 64 · 낱말 표기 156 · 합성어·사이시옷 49 · 외래어 46');
console.log('검출 계약  모든 항목에 세부 분류와 exact/phrase/context 방식 지정');

const 기존항목 = 전체수첩항목.filter((entry) => entry.origin !== 'expansion');
const 확장항목 = 전체수첩항목.filter((entry) => entry.origin === 'expansion');
const normalizePair = (value) => String(value).normalize('NFC').replace(/[^가-힣a-z0-9]/gi, '');
const 기존검색어 = new Set(기존항목.flatMap((entry) => (
    [entry.answer, entry.question, ...entry.searchable].map(normalizePair).filter(Boolean)
)));
const 확장오답 = 확장항목.map((entry) => (
    entry.question.split('/').map((choice) => choice.trim()).find((choice) => choice !== entry.answer)
));
const 기존과겹치는확장표현 = 확장항목.flatMap((entry) => (
    [entry.answer, ...entry.question.split('/').map((choice) => choice.trim())]
        .filter((value) => 기존검색어.has(normalizePair(value)))
        .map((value) => `${entry.id}:${value}`)
));
const 못찾은확장오답 = 확장항목.flatMap((entry) => (
    entry.question.split('/').map((choice) => choice.trim())
        .filter((choice) => choice !== entry.answer)
        .filter((wrong) => !findElementarySpellingIssues(`문장 ${wrong}.`, 500)
            .some((issue) => issue.entryId === entry.id))
        .map((wrong) => `${entry.id}:${wrong}`)
));
if (
    확장항목.length !== 200 ||
    new Set(확장오답).size !== 200 ||
    기존과겹치는확장표현.length > 0 ||
    못찾은확장오답.length > 0
) {
    console.error(`\n실패 — 추가 200개 품질 오류: 연결 ${확장항목.length}개, 고유 오답 ${new Set(확장오답).size}개, 기존 표현 중복 ${기존과겹치는확장표현.length}개, 밑줄 미탐 ${못찾은확장오답.length}개`);
    if (기존과겹치는확장표현.length > 0) console.error(`  기존 표현 중복: ${기존과겹치는확장표현.slice(0, 10).join(', ')}`);
    if (못찾은확장오답.length > 0) console.error(`  밑줄 미탐: ${못찾은확장오답.slice(0, 10).join(', ')}`);
    process.exit(1);
}
console.log('추가 자료  200개 · 기존 300개와 표현 중복 0 · 전체 분류 체계에 통합');

const 문장형문제 = 문장형수첩항목.map((entry, index) => ({
    id: entry.id,
    number: index + 1,
    question: entry.question,
    choices: entry.quiz?.choices || [],
    answer: entry.answer,
    explanation: entry.explanation,
    solution: entry.quiz?.solution || '',
    prompt: entry.quiz?.prompt || '',
    detectionPatterns: entry.detectionPatterns
}));
const 중복문제아이디 = 문장형문제.length - new Set(
    문장형문제.map((question) => question.id)
).size;
const 잘못된문제 = 문장형문제.filter((question, index) => (
    question.number !== index + 1 ||
    question.choices.length < 2 ||
    !question.choices.includes(question.answer) ||
    !question.explanation ||
    !question.solution ||
    !question.detectionPatterns?.length
));
if (문장형문제.length !== 100 || 중복문제아이디 > 0 || 잘못된문제.length > 0) {
    console.error(`\n실패 — 문제은행 품질 오류: 전체 ${문장형문제.length}개, ID 중복 ${중복문제아이디}개, 잘못된 문항 ${잘못된문제.length}개`);
    process.exit(1);
}
console.log(`문제은행  연속된 100문제 · ID 중복 0개 · 선택지/정답/설명 확인`);

const 놓친문제밑줄 = 문장형문제.flatMap((question) => (
    question.detectionPatterns
        .filter((item) => !findElementarySpellingIssues(item.text, 500)
            .some((issue) => issue.entryId === question.id))
        .map(() => question.number)
));
if (놓친문제밑줄.length > 0) {
    console.error(`\n실패 — 100문제 틀린 선택지 밑줄 미탐: ${놓친문제밑줄.join(', ')}`);
    process.exit(1);
}

const 전체문제후보 = getElementarySpellingQuizPool();
if (
    전체문제후보.length !== 500 ||
    new Set(전체문제후보.map((question) => question.sourceEntryId)).size !== 500 ||
    전체문제후보.some((question) => !question.choices.includes(question.answer))
) {
    console.error('\n실패 — 500개 랜덤 퀴즈 후보 구성이 올바르지 않다.');
    process.exit(1);
}
console.log('랜덤 퀴즈  500개 후보 · 열 때마다 중복 없는 5문제');
console.log('\n통과');

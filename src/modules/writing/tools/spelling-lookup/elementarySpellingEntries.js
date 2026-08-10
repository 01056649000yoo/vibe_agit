/**
 * 맞춤법 수첩의 사전 본문(설명·예문·출처).
 *
 * 이 파일은 학생이 **수첩을 열 때만** 내려간다. 글쓰기 창에 늘 따라다니는
 * 밑줄 감지 규칙은 `spellingDetectionRules.js` 에 따로 있다 — 그쪽이 훨씬 가볍다.
 */
import { findDetectedEntryIds } from './spellingDetectionRules.js';

const DICTIONARY_SEARCH_URL = 'https://stdict.korean.go.kr/search/searchResult.do?pageSize=10&searchKeyword=';
const KOREAN_NORMS_URL = 'https://korean.go.kr/kornorms/main/main.do';

const dictionarySource = (query) => ({
    label: '국립국어원 표준국어대사전',
    url: `${DICTIONARY_SEARCH_URL}${encodeURIComponent(query)}`
});

const normSource = {
    label: '국립국어원 한국어 어문 규범',
    url: KOREAN_NORMS_URL
};

const ELEMENTARY_SPELLING_ENTRIES = [
    {
        id: 'dwae-doe',
        question: '돼요 / 되요',
        answer: '돼요',
        searchable: ['돼요', '되요', '돼', '되', '되어요', '안 돼', '해도 돼'],
        explanation: '‘돼’는 ‘되어’가 줄어든 말이에요. ‘되어요’라고 바꾸어 말할 수 있으면 ‘돼요’를 써요.',
        examples: ['이제 집에 가도 돼요.', '그렇게 하면 안 돼요.'],
        source: dictionarySource('되다')
    },
    {
        id: 'an-anh',
        question: '안 / 않',
        answer: '쓰임이 달라요',
        searchable: ['안', '않', '안 해', '하지 않아', '않다', '안돼', '안 돼'],
        explanation: '‘안’은 뒤의 행동을 하지 않는다는 뜻이고, ‘않’은 보통 ‘-지 않다’처럼 써요.',
        examples: ['오늘은 숙제를 안 했어요.', '나는 약속을 잊지 않았어요.'],
        source: dictionarySource('않다')
    },
    {
        id: 'wen-waen',
        question: '웬 / 왠',
        answer: '대부분 ‘웬’, ‘왠지’만 ‘왠’',
        searchable: ['웬', '왠', '웬일', '왠일', '왠지', '웬지'],
        explanation: '‘어찌 된’이라는 뜻이면 ‘웬’을 써요. ‘왜인지’가 줄어든 ‘왠지’만 따로 기억해요.',
        examples: ['웬일로 일찍 왔니?', '오늘은 왠지 기분이 좋아요.'],
        source: dictionarySource('웬')
    },
    {
        id: 'eotteoke-eotteokhae',
        question: '어떻게 / 어떡해',
        answer: '둘 다 맞지만 쓰임이 달라요',
        searchable: ['어떻게', '어떡해', '어떻해', '어떻게 해'],
        explanation: '방법을 물으면 ‘어떻게’를 써요. ‘어떻게 해’가 줄어든 말은 ‘어떡해’예요.',
        examples: ['이 문제는 어떻게 풀어요?', '우산을 잃어버렸어. 어떡해!'],
        source: dictionarySource('어떡하다')
    },
    {
        id: 'myeochil',
        question: '며칠 / 몇일',
        answer: '며칠',
        searchable: ['며칠', '몇일', '몇 일'],
        explanation: '날짜나 날의 수를 물을 때에는 ‘며칠’이라고 적어요.',
        examples: ['오늘이 몇 월 며칠이지?', '며칠 동안 비가 내렸어요.'],
        source: dictionarySource('며칠')
    },
    {
        id: 'geumse',
        question: '금세 / 금새',
        answer: '금세',
        searchable: ['금세', '금새', '금방'],
        explanation: '아주 짧은 시간을 나타내는 말은 ‘금세’예요.',
        examples: ['비가 금세 그쳤어요.', '동생은 금세 잠이 들었어요.'],
        source: dictionarySource('금세')
    },
    {
        id: 'oraenman',
        question: '오랜만 / 오랫만',
        answer: '오랜만',
        searchable: ['오랜만', '오랫만', '오랜 만'],
        explanation: '‘오래간만’이 줄어든 말이므로 ‘오랜만’이라고 적어요.',
        examples: ['친구를 오랜만에 만났어요.', '오랜만에 운동장에 나갔어요.'],
        source: dictionarySource('오랜만')
    },
    {
        id: 'yeokhal',
        question: '역할 / 역활',
        answer: '역할',
        searchable: ['역할', '역활'],
        explanation: '자기가 맡아서 하는 일은 ‘역할’이라고 적어요.',
        examples: ['모둠에서 기록하는 역할을 맡았어요.', '배우가 주인공 역할을 맡았어요.'],
        source: dictionarySource('역할')
    },
    {
        id: 'seollem',
        question: '설렘 / 설레임',
        answer: '설렘',
        searchable: ['설렘', '설레임', '설레다'],
        explanation: '마음이 두근거리는 느낌은 동사 ‘설레다’에서 온 ‘설렘’이라고 적어요.',
        examples: ['여행을 앞두고 설렘을 느꼈어요.', '새 학기의 설렘이 가득했어요.'],
        source: dictionarySource('설렘')
    },
    {
        id: 'bwaeyo',
        question: '봬요 / 뵈요',
        answer: '봬요',
        searchable: ['봬요', '뵈요', '뵈어요', '내일 봬요'],
        explanation: '‘뵈어요’가 줄어들면 ‘봬요’가 돼요. 줄이지 않으면 ‘뵈어요’라고 써요.',
        examples: ['선생님, 내일 봬요.', '다음에 다시 뵈어요.'],
        source: dictionarySource('뵈다')
    },
    {
        id: 'anieyo',
        question: '아니에요 / 아니예요',
        answer: '아니에요',
        searchable: ['아니에요', '아니예요', '이에요', '예요'],
        explanation: '‘아니다’ 뒤에는 ‘-에요’가 붙어서 ‘아니에요’가 돼요.',
        examples: ['제가 한 일이 아니에요.', '그 연필은 제 것이 아니에요.'],
        source: dictionarySource('아니다')
    },
    {
        id: 'hal-su-itda',
        question: '할 수 있다 / 할수있다',
        answer: '할 수 있다',
        searchable: ['할 수 있다', '할수있다', '할수 있어', '갈 수 있다', '볼 수 있다'],
        explanation: '가능함을 나타내는 ‘수’는 앞말과 뒤의 ‘있다’에서 띄어 써요.',
        examples: ['나는 끝까지 해낼 수 있어요.', '여기에서 별을 볼 수 있어요.'],
        source: normSource
    },
    {
        id: 'geot-gatda',
        question: '것 같다 / 것같다',
        answer: '것 같다',
        searchable: ['것 같다', '것같다', '거 같다', '할 것 같다'],
        explanation: '‘것’은 앞말과 띄고, ‘같다’도 ‘것’과 띄어서 적어요.',
        examples: ['곧 비가 올 것 같아요.', '내 생각이 맞는 것 같아요.'],
        source: normSource
    },
    {
        id: 'natda-nata',
        question: '낫다 / 낳다',
        answer: '뜻이 달라요',
        searchable: ['낫다', '낳다', '나았다', '낳았다', '병이 낫다', '아기를 낳다'],
        explanation: '병이 좋아지거나 더 좋다는 뜻은 ‘낫다’, 아기나 알을 몸 밖으로 내놓는 뜻은 ‘낳다’예요.',
        examples: ['감기가 다 나았어요.', '닭이 알을 낳았어요.'],
        source: dictionarySource('낫다')
    },
    {
        id: 'machida-matchuda',
        question: '맞히다 / 맞추다',
        answer: '뜻이 달라요',
        searchable: ['맞히다', '맞추다', '정답을 맞추다', '정답을 맞히다'],
        explanation: '문제의 답을 알아내는 것은 ‘맞히다’, 서로 맞게 하거나 비교하는 것은 ‘맞추다’예요.',
        examples: ['수수께끼의 답을 맞혔어요.', '친구와 시계를 맞추었어요.'],
        source: dictionarySource('맞히다')
    },
    {
        id: 'gareuchida-garikida',
        question: '가르치다 / 가리키다',
        answer: '뜻이 달라요',
        searchable: ['가르치다', '가리키다', '알려주다', '손가락으로'],
        explanation: '지식이나 방법을 알려 주는 것은 ‘가르치다’, 손가락 등으로 방향이나 대상을 나타내는 것은 ‘가리키다’예요.',
        examples: ['선생님이 수학을 가르쳐 주셨어요.', '친구가 창밖의 새를 가리켰어요.'],
        source: dictionarySource('가르치다')
    },
    {
        id: 'kkaekkeusi',
        question: '깨끗이 / 깨끗히',
        answer: '깨끗이',
        searchable: ['깨끗이', '깨끗히', '깨끗하게'],
        explanation: '‘깨끗하다’가 행동을 꾸며 주는 말이 될 때에는 ‘깨끗이’라고 적어요.',
        examples: ['교실을 깨끗이 청소했어요.', '손을 깨끗이 씻었어요.'],
        source: dictionarySource('깨끗이')
    },
    {
        id: 'gomgomi',
        question: '곰곰이 / 곰곰히',
        answer: '곰곰이',
        searchable: ['곰곰이', '곰곰히', '곰곰'],
        explanation: '여러 번 깊이 생각하는 모양은 ‘곰곰이’라고 적어요.',
        examples: ['문제를 곰곰이 생각했어요.', '친구의 말을 곰곰이 되새겼어요.'],
        source: dictionarySource('곰곰이')
    },
    {
        id: 'bandeusi-bandeusi',
        question: '반드시 / 반듯이',
        answer: '뜻이 달라요',
        searchable: ['반드시', '반듯이', '꼭', '반듯하게'],
        explanation: '꼭 그렇게 된다는 뜻은 ‘반드시’, 비뚤어지지 않고 바르다는 뜻은 ‘반듯이’예요.',
        examples: ['약속은 반드시 지켜요.', '책을 책상 위에 반듯이 놓았어요.'],
        source: dictionarySource('반드시')
    },
    {
        id: 'han-beon',
        question: '한 번 / 한번',
        answer: '뜻에 따라 달라요',
        searchable: ['한 번', '한번', '한번 해 보다', '한 번만'],
        explanation: '횟수 ‘한 차례’를 세면 ‘한 번’으로 띄어요. 시험 삼아 해 본다는 뜻이 강하면 ‘한번’으로 붙여 쓸 수 있어요.',
        examples: ['딱 한 번만 더 읽어 볼게요.', '이 문제를 한번 풀어 보세요.'],
        source: dictionarySource('한번')
    },
    {
        id: 'de-dae',
        question: '데 / 대',
        answer: '뜻이 달라요',
        searchable: ['데', '대', '갈 데', '간대', '했대', '하는데'],
        explanation: '장소나 경우를 나타내는 ‘데’가 있고, 다른 사람에게 들은 말을 전할 때 쓰는 ‘-대’가 있어요.',
        examples: ['오늘은 갈 데가 없어요.', '민지가 내일 학교에 온대요.'],
        source: dictionarySource('데')
    },
    {
        id: 'ittaga',
        question: '이따가 / 있다가',
        answer: '뜻이 달라요',
        searchable: ['이따가', '있다가', '나중에', '여기 있다가'],
        explanation: '조금 뒤라는 뜻은 ‘이따가’, 어떤 곳에 머문 뒤라는 뜻은 ‘있다가’예요.',
        examples: ['이따가 운동장에서 만나자.', '교실에 있다가 집에 갔어요.'],
        source: dictionarySource('이따가')
    },
    {
        id: 'roseo-rosseo',
        question: '로서 / 로써',
        answer: '뜻이 달라요',
        searchable: ['로서', '로써', '학생으로서', '연필로써'],
        explanation: '자격이나 역할을 나타내면 ‘로서’, 도구나 방법을 나타내면 ‘로써’를 써요.',
        examples: ['학생으로서 약속을 지켰어요.', '대화로써 오해를 풀었어요.'],
        source: normSource
    },
    {
        id: 'neurida-neurida',
        question: '늘리다 / 늘이다',
        answer: '뜻이 달라요',
        searchable: ['늘리다', '늘이다', '수를 늘리다', '고무줄을 늘이다'],
        explanation: '수나 양을 많게 하는 것은 ‘늘리다’, 길이를 길게 하는 것은 ‘늘이다’예요.',
        examples: ['독서 시간을 조금씩 늘렸어요.', '고무줄을 길게 늘였어요.'],
        source: dictionarySource('늘리다')
    }
];

const POPULAR_SPELLING_ENTRY_IDS = [
    'dwae-doe',
    'an-anh',
    'wen-waen',
    'eotteoke-eotteokhae',
    'hal-su-itda',
    'myeochil'
];

export const ELEMENTARY_SPELLING_ENTRY_IDS = Object.freeze(
    ELEMENTARY_SPELLING_ENTRIES.map((entry) => entry.id)
);

const normalize = (value) => value
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s/·,?!."'’“”()_-]/g, '');

export const searchElementarySpelling = (query) => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return [];

    const detectedEntryIds = findDetectedEntryIds(query);

    return ELEMENTARY_SPELLING_ENTRIES
        .map((entry) => {
            const candidates = [entry.question, entry.answer, ...entry.searchable];
            const normalizedCandidates = candidates.map(normalize);
            const exact = normalizedCandidates.some((candidate) => candidate === normalizedQuery);
            const startsWith = normalizedCandidates.some((candidate) => candidate.startsWith(normalizedQuery));
            const includes = normalizedCandidates.some((candidate) => (
                (normalizedQuery.length >= 2 && candidate.includes(normalizedQuery)) ||
                (candidate.length >= 2 && normalizedQuery.includes(candidate))
            ));
            const explanationMatch = normalize(entry.explanation).includes(normalizedQuery);

            const detectedInSentence = detectedEntryIds.has(entry.id);
            const score = exact ? 100 : detectedInSentence ? 90 : startsWith ? 75 : includes ? 55 : explanationMatch ? 25 : 0;
            return { entry, score };
        })
        .filter(({ score }) => score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6)
        .map(({ entry }) => entry);
};

export const getPopularSpellingEntries = () => POPULAR_SPELLING_ENTRY_IDS
    .map((id) => ELEMENTARY_SPELLING_ENTRIES.find((entry) => entry.id === id))
    .filter(Boolean);

export const createOfficialDictionarySearchUrl = (query) => (
    `${DICTIONARY_SEARCH_URL}${encodeURIComponent(query.trim())}`
);

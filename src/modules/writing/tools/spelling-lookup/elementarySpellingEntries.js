/**
 * 맞춤법 수첩의 사전 본문(설명·예문·출처).
 *
 * 설명·예문·문제 본문은 수첩과 교사 화면에서 쓰고, 같은 500개 항목에서 만든
 * 밑줄 규칙은 글쓰기 화면이 열린 뒤 별도 청크로 한 번만 내려받는다.
 */
import { findDetectedEntryIds } from './spellingDetectionRules.js';
import { ADDITIONAL_ELEMENTARY_SPELLING_ENTRIES } from './elementarySpellingCatalog.js';
import { EXPANDED_ELEMENTARY_SPELLING_ENTRIES } from './elementarySpellingExpansionCatalog.js';
import { ELEMENTARY_SPELLING_QUIZ_QUESTIONS } from './elementarySpellingQuiz.js';
import {
    collectSpellingCandidates,
    createSpellingCandidateIndex
} from '../../spelling-learning/candidateIndex.js';

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

const BASE_ELEMENTARY_SPELLING_ENTRIES = [
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

const BASE_ENTRY_CATEGORIES = {
    'dwae-doe': '용언 활용',
    'an-anh': '뜻 구별',
    'wen-waen': '낱말 표기',
    'eotteoke-eotteokhae': '뜻 구별',
    myeochil: '낱말 표기',
    geumse: '낱말 표기',
    oraenman: '낱말 표기',
    yeokhal: '낱말 표기',
    seollem: '낱말 표기',
    bwaeyo: '용언 활용',
    anieyo: '어미 구별',
    'hal-su-itda': '띄어쓰기',
    'geot-gatda': '띄어쓰기',
    'natda-nata': '뜻 구별',
    'machida-matchuda': '뜻 구별',
    'gareuchida-garikida': '뜻 구별',
    kkaekkeusi: '부사 표기',
    gomgomi: '부사 표기',
    'bandeusi-bandeusi': '뜻 구별',
    'han-beon': '띄어쓰기',
    'de-dae': '어미 구별',
    ittaga: '뜻 구별',
    'roseo-rosseo': '어미 구별',
    'neurida-neurida': '뜻 구별'
};

const pattern = (text, target, right, lookup = right) => ({ text, target, right, lookup });

// 두 표현이 모두 존재하는 항목은 낱말만 보고 틀렸다고 할 수 없다.
// 학생 문장 안에서 뜻이 분명해지는 짧은 문맥까지 함께 맞을 때만 밑줄을 긋는다.
const CONTEXTUAL_REFERENCE_PATTERNS = {
    'an-anh': [pattern('학교에 않 간', '않', '안'), pattern('하지 안', '안', '않')],
    'wen-waen': [pattern('왠 사람이', '왠', '웬'), pattern('웬지', '웬지', '왠지'), pattern('왠일', '왠일', '웬일'), pattern('왠만', '왠만', '웬만')],
    'eotteoke-eotteokhae': [pattern('어떻해', '어떻해', '어떡해'), pattern('어떡게', '어떡게', '어떻게')],
    'natda-nata': [pattern('감기가 낳았다', '낳았다', '나았다'), pattern('새끼를 나았다', '나았다', '낳았다')],
    'machida-matchuda': [pattern('정답을 맞췄다', '맞췄다', '맞혔다'), pattern('시간에 맞혔다', '맞혔다', '맞췄다')],
    'gareuchida-garikida': [pattern('수학을 가리켜', '가리켜', '가르쳐'), pattern('하늘을 가르쳤다', '가르쳤다', '가리켰다')],
    'bandeusi-bandeusi': [
        pattern('약속은 반듯이', '반듯이', '반드시'),
        pattern('약속을 반듯이 지켜', '반듯이', '반드시'),
        pattern('규칙을 반듯이 지켜', '반듯이', '반드시'),
        pattern('숙제는 반듯이 해야', '반듯이', '반드시'),
        pattern('반듯이 기억하', '반듯이', '반드시'),
        pattern('반듯이 확인하', '반듯이', '반드시'),
        pattern('반듯이 참석하', '반듯이', '반드시'),
        pattern('반듯이 제출하', '반듯이', '반드시')
    ],
    'han-beon': [pattern('한번만', '한번', '한 번')],
    'de-dae': [pattern('전학을 간데', '데', '대'), pattern('맛있데', '데', '대'), pattern('가 봤는대', '대', '데'), pattern('숙제하는 대', '대', '데')],
    ittaga: [pattern('교실에 이따가 집에', '이따가', '있다가')],
    'roseo-rosseo': [pattern('학생으로써', '으로써', '으로서'), pattern('연필로서', '로서', '로써')],
    'neurida-neurida': [pattern('수를 늘이다', '늘이다', '늘리다'), pattern('고무줄을 늘리', '늘리', '늘이')],
    deulleotda: [pattern('문구점에 들렸다', '들렸다', '들렀다'), pattern('소리가 들렀다', '들렀다', '들렸다')],
    buditchida: [pattern('친구와 부딪혔다', '부딪혔다', '부딪쳤다'), pattern('바람에 벽에 부딪쳤다', '부딪쳤다', '부딪혔다')],
    'gyeoljae-gyeolje': [pattern('카드로 결재', '결재', '결제'), pattern('문서를 결제', '결제', '결재')],
    'gaebal-gyebal': [pattern('학습 도구를 계발', '계발', '개발'), pattern('재능을 개발', '개발', '계발')],
    'itda-ilda': [pattern('물건을 잊어버', '잊어버', '잃어버'), pattern('약속을 잃어버', '잃어버', '잊어버')],
    'itda-issda': [pattern('두 점을 있', '있', '잇'), pattern('연필이 잇어요', '잇어요', '있어요')],
    'matda-majda': [pattern('발표를 맞았', '맞았', '맡았'), pattern('답이 맡았', '맡았', '맞았')],
    'butida-buchida': [pattern('사진을 부쳤다', '부쳤다', '붙였다'), pattern('편지를 붙였다', '붙였다', '부쳤다')],
    'ttida-ttuida': [pattern('눈에 띠', '띠', '띄'), pattern('빛을 띄', '띄', '띠')],
    'barada-baraeda': [pattern('건강하기를 바래', '바래', '바라'), pattern('사진 색이 바랐다', '바랐다', '바랬다')],
    'beorida-beollida': [pattern('잔치를 벌렸다', '벌렸다', '벌였다'), pattern('두 팔을 벌였다', '벌였다', '벌렸다')],
    'sagida-sakhida': [pattern('화를 삭혔다', '삭혔다', '삭였다'), pattern('김치를 삭였다', '삭였다', '삭혔다')],
    'sseogida-sseokhida': [pattern('속을 썩혔다', '썩혔다', '썩였다'), pattern('음식을 썩였다', '썩였다', '썩혔다')],
    'jeorida-jeolida': [pattern('다리가 절였다', '절였다', '저렸다'), pattern('배추를 저렸다', '저렸다', '절였다')],
    'jorida-jolida': [pattern('감자를 졸였다', '졸였다', '조렸다'), pattern('마음을 조렸다', '조렸다', '졸였다')],
    'dareuda-teullida': [pattern('서로 같지 않아 틀리', '틀리', '다르'), pattern('계산한 답이 달라서 오답', '달라', '틀려')],
    'deon-deun': [pattern('사과던 배던', '던', '든'), pattern('어제 먹었든', '든', '던'), pattern('어디에 가던 연락', '던', '든')],
    'eyo-yeyo': [pattern('제 책에요', '에요', '이에요'), pattern('민수에요', '에요', '예요'), pattern('선생님이예요', '이예요', '이에요'), pattern('거에요', '거에요', '거예요')],
    'geochida-geothida': [pattern('안개가 거치', '거치', '걷히'), pattern('단계를 걷히', '걷히', '거치')],
    'geotjapda-geopjapda': [pattern('불길이 겉잡', '겉잡', '걷잡'), pattern('겉으로 걷잡', '걷잡', '겉잡')],
    'maeda-meda': [pattern('가방을 맸다', '맸다', '멨다'), pattern('신발 끈을 멨다', '멨다', '맸다')],
    'beda-baeda': [pattern('손가락을 배었다', '배었다', '베었다'), pattern('냄새가 베었다', '베었다', '배었다')],
    'saeda-seda': [pattern('수도관에서 물이 세', '세', '새'), pattern('구슬의 수를 새', '새', '세')],
    'anchida-anjhida': [pattern('솥에 밥을 앉', '앉', '안치'), pattern('동생을 의자에 안쳤', '안쳤', '앉혔')],
    'deulleuda-deullida': [pattern('문구점에 들렸다', '들렸다', '들렀다'), pattern('노랫소리가 들렀다', '들렀다', '들렸다')],
    'neomeo-neomeo': [pattern('산 넘어에', '넘어', '너머'), pattern('담장 너머갔', '너머', '넘어')],
    'bit-bit': [pattern('햇빚', '빚', '빛'), pattern('빌린 돈은 빛', '빛', '빚')],
    'nat-nat': [pattern('처음 보는 낮', '낮', '낯'), pattern('낯에는 햇빛', '낯', '낮')],
    'datda-data': [pattern('문을 닿았', '닿았', '닫았'), pattern('손이 선반에 닫', '닫', '닿')],
    'gatda-gatda': [pattern('책임을 같', '같', '갖'), pattern('크기가 갖', '갖', '같')],
    'batchida-bachida': [pattern('몸을 받친', '받친', '바친'), pattern('다리에 종이를 바쳤', '바쳤', '받쳤')],
    'geonneoda-geonneda': [pattern('길을 건넸', '건넸', '건넜'), pattern('쪽지를 건넜', '건넜', '건넸')],
    'mot-hada': [pattern('비가 와서 축구를 못했', '못했', '못 했')],
    'hal-ge': [pattern('할게 많이', '할게', '할 게'), pattern('청소는 내가 할 게.', '할 게', '할게')],
    'hal-geol': [pattern('할걸 먼저', '할걸', '할 걸'), pattern('갈 걸 그랬다', '갈 걸', '갈걸')]
};

// 다른 문장에서는 맞는 낱말이 될 수 있어 전역 문자열로 잡으면 안 되는 표기들이다.
const CONTEXT_ONLY_REFERENCE_PATTERNS = {
    jjigae: [pattern('김치찌게', '찌게', '찌개'), pattern('된장찌게', '찌게', '찌개')],
    badatga: [pattern('바다가에서', '바다가', '바닷가'), pattern('바다가에 파도', '바다가', '바닷가')],
    naetga: [pattern('내가에서', '내가', '냇가'), pattern('뒤 내가에 물', '내가', '냇가')],
    daegae: [pattern('대게 일찍', '대게', '대개'), pattern('대게 아홉', '대게', '대개')],
    yosae: [pattern('요세 날씨', '요세', '요새'), pattern('나는 요세', '요세', '요새')]
};

const createReferenceEntries = (entries) => entries.map(({
    sourceQuery,
    sourceType,
    ...entry
}) => ({
    ...entry,
    contentType: 'reference',
    source: sourceType === 'norm' ? normSource : dictionarySource(sourceQuery || entry.answer)
}));

const additionalEntries = createReferenceEntries(ADDITIONAL_ELEMENTARY_SPELLING_ENTRIES);
const expandedEntries = createReferenceEntries(EXPANDED_ELEMENTARY_SPELLING_ENTRIES);

const createPracticeLearningLabel = (question) => question.choices
    .map((choice) => choice.replace(/,\s*/g, '·'))
    .join(' / ');

const practiceEntries = ELEMENTARY_SPELLING_QUIZ_QUESTIONS.map((question) => ({
    id: `practice-${question.id}`,
    question: question.question,
    answer: question.answer,
    searchable: [question.prompt, question.solution, ...question.choices],
    category: '문장 연습',
    learningLabel: createPracticeLearningLabel(question),
    explanation: question.explanation,
    examples: [question.solution],
    detectionPatterns: question.detectionPatterns,
    contentType: 'practice',
    source: normSource
}));

const ELEMENTARY_SPELLING_ENTRIES = [
    ...BASE_ELEMENTARY_SPELLING_ENTRIES.map((entry) => ({
        ...entry,
        category: BASE_ENTRY_CATEGORIES[entry.id],
        contentType: 'reference'
    })),
    ...additionalEntries,
    ...expandedEntries,
    ...practiceEntries
].map((entry) => Object.freeze({
    ...entry,
    learningLabel: entry.learningLabel || entry.question
}));

const splitEntryChoices = (entry) => entry.question.split('/').map((choice) => choice.trim());

const createReferenceDetectionPatterns = (entry) => {
    const contextualPatterns = CONTEXTUAL_REFERENCE_PATTERNS[entry.id]
        || CONTEXT_ONLY_REFERENCE_PATTERNS[entry.id];
    if (contextualPatterns) return contextualPatterns;

    const choices = splitEntryChoices(entry);
    if (!choices.includes(entry.answer)) return [];
    return choices
        .filter((choice) => choice !== entry.answer)
        .map((choice) => pattern(choice.replace(/^-/, ''), choice.replace(/^-/, ''), entry.answer, entry.answer));
};

export const ELEMENTARY_SPELLING_DETECTION_RULES = Object.freeze(
    ELEMENTARY_SPELLING_ENTRIES.map((entry) => {
        const patterns = entry.contentType === 'practice'
            ? entry.detectionPatterns.map((item) => ({
                ...item,
                right: entry.answer,
                lookup: entry.answer
            }))
            : createReferenceDetectionPatterns(entry);
        return Object.freeze({
            id: `elementary-${entry.id}`,
            entryId: entry.id,
            label: entry.learningLabel,
            category: entry.category,
            patterns: Object.freeze(patterns.map((item) => Object.freeze(item)))
        });
    })
);

const ELEMENTARY_INDEXED_PATTERNS = Object.freeze(
    ELEMENTARY_SPELLING_DETECTION_RULES.flatMap((rule) => rule.patterns.map((item) => {
        const target = item.target || item.text;
        return Object.freeze({
            rule,
            item,
            target,
            targetOffset: Number.isInteger(item.targetOffset)
                ? item.targetOffset
                : Math.max(0, item.text.indexOf(target))
        });
    }))
);

const ELEMENTARY_SPELLING_CANDIDATE_INDEX = createSpellingCandidateIndex(
    ELEMENTARY_INDEXED_PATTERNS,
    (indexedPattern) => indexedPattern.target
);

export const ELEMENTARY_SPELLING_DETECTION_RULE_COUNT = ELEMENTARY_SPELLING_DETECTION_RULES.length;
export const ELEMENTARY_SPELLING_DETECTION_ENTRY_IDS = Object.freeze(
    ELEMENTARY_SPELLING_DETECTION_RULES.map((rule) => rule.entryId)
);
export const ELEMENTARY_SPELLING_LABEL_COUNT = new Set(
    ELEMENTARY_SPELLING_DETECTION_RULES.map((rule) => rule.label)
).size;
export const ELEMENTARY_SPELLING_TRIGGER_COUNT = new Set(
    ELEMENTARY_INDEXED_PATTERNS.map((indexedPattern) => indexedPattern.target)
).size;

/** 500개 기본 자료에서 본문 후보를 한 번 찾은 뒤 해당 라벨의 문맥만 확인한다. */
export const findElementarySpellingIssues = (value, limit = 50) => {
    const text = String(value || '').normalize('NFC');
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 50;
    if (!text || safeLimit === 0) return [];

    const issues = [];
    const candidates = collectSpellingCandidates(text, ELEMENTARY_SPELLING_CANDIDATE_INDEX);
    for (const { item: indexedPattern, starts } of candidates) {
        const { rule, item, target, targetOffset } = indexedPattern;
        let nextAllowedMatchStart = 0;
        for (const targetStart of starts) {
            const matchStart = targetStart - targetOffset;
            if (
                matchStart < nextAllowedMatchStart ||
                !text.startsWith(item.text, matchStart)
            ) continue;

            const start = matchStart + targetOffset;
            issues.push({
                id: `${rule.id}-${start}`,
                ruleId: rule.id,
                entryId: rule.entryId,
                label: rule.label,
                category: rule.category,
                start,
                end: start + target.length,
                text: text.slice(start, start + target.length),
                wrong: target,
                right: item.right,
                lookup: item.lookup || item.right
            });
            nextAllowedMatchStart = matchStart + item.text.length;
            if (issues.length >= safeLimit) break;
        }
        if (issues.length >= safeLimit) break;
    }

    return issues.sort((left, right) => left.start - right.start);
};

const quizQuestionByEntryId = new Map(
    ELEMENTARY_SPELLING_QUIZ_QUESTIONS.map((question) => [`practice-${question.id}`, question])
);

const ELEMENTARY_SPELLING_QUIZ_POOL = Object.freeze(
    ELEMENTARY_SPELLING_ENTRIES.map((entry, index) => {
        const originalQuestion = quizQuestionByEntryId.get(entry.id);
        if (originalQuestion) {
            return Object.freeze({
                ...originalQuestion,
                id: `pool-${entry.id}`,
                number: index + 1,
                sourceEntryId: entry.id
            });
        }

        const choices = splitEntryChoices(entry);
        const hasSingleCorrectChoice = choices.includes(entry.answer);
        return Object.freeze({
            id: `pool-${entry.id}`,
            number: index + 1,
            sourceEntryId: entry.id,
            question: entry.question,
            prompt: hasSingleCorrectChoice
                ? `바른 표현을 골라 보세요: ${entry.question}`
                : `‘${entry.question}’는 어떻게 써야 할까요?`,
            choices: Object.freeze(hasSingleCorrectChoice
                ? choices
                : [entry.answer, '둘 중 하나만 언제나 맞아요']),
            answer: entry.answer,
            explanation: entry.explanation,
            solution: entry.examples[0]
        });
    })
);

export const getElementarySpellingQuizPool = () => ELEMENTARY_SPELLING_QUIZ_POOL;

const takeRandomItems = (items, count, random) => {
    const remaining = [...items];
    const selected = [];
    while (selected.length < count) {
        const randomIndex = Math.floor(random() * remaining.length);
        const [item] = remaining.splice(randomIndex, 1);
        selected.push(item);
    }
    return selected;
};

/** 수첩을 열거나 다시 도전할 때 500개 중 겹치지 않는 문제만 뽑는다. */
export const createRandomElementarySpellingQuiz = (count = 5, random = Math.random) => {
    const safeCount = Math.min(Math.max(0, Math.floor(count)), ELEMENTARY_SPELLING_QUIZ_POOL.length);
    const selected = takeRandomItems(ELEMENTARY_SPELLING_QUIZ_POOL, safeCount, random);
    return selected.map((question, index) => ({
        ...question,
        choices: takeRandomItems(question.choices, question.choices.length, random),
        sessionNumber: index + 1
    }));
};

export const ELEMENTARY_SPELLING_ENTRY_IDS = Object.freeze(
    ELEMENTARY_SPELLING_ENTRIES.map((entry) => entry.id)
);

export const getElementarySpellingEntries = () => ELEMENTARY_SPELLING_ENTRIES;

const normalize = (value) => value
    .normalize('NFC')
    .toLocaleLowerCase('ko-KR')
    .replace(/[\s/·,?!."'’“”()_-]/g, '');

export const searchElementarySpelling = (query) => {
    const normalizedQuery = normalize(query.trim());
    if (!normalizedQuery) return [];

    const detectedEntryIds = new Set([
        ...findDetectedEntryIds(query),
        ...findElementarySpellingIssues(query).map((issue) => issue.entryId)
    ]);

    return ELEMENTARY_SPELLING_ENTRIES
        .map((entry) => {
            const candidates = [
                entry.question,
                entry.answer,
                entry.category,
                entry.learningLabel,
                ...entry.searchable,
                ...entry.examples
            ];
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

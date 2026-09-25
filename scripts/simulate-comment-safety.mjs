#!/usr/bin/env node

/**
 * 끄적끄적 아지트 댓글 작성 및 필터링 시뮬레이션 스크립트
 * 
 * 테스트 항목:
 * 1. 정상적이고 다정한 친구 댓글 (정상 허용)
 * 2. 글자 수 상한 경계값 (8자, 200자, 201자 초과)
 * 3. 성의 없는 댓글 및 무의미한 반복 도배
 * 4. 직설적인 비속어 및 욕설
 * 5. 공백/특수문자를 섞은 욕설 변형 우회 시도 (시.발, 개~새~끼, 존_나 등)
 * 6. 초성 욕설 및 초성 변형 (ㅅㅂ, ㅂ ㅅ, ㅈ...ㄹ 등)
 * 7. 초등학생 언어 변형 (시뱔, 개색기, 미친놈, 닥쳐, 꺼져 등)
 */

import { readFileSync } from 'node:fs';

// 1. vibe-ai 함수 추출 및 로직 복제
const edgeSource = readFileSync('supabase/functions/vibe-ai/index.ts', 'utf8');

// vibe-ai의 INAPPROPRIATE_WORDS와 로직 추출
const extractWords = (src) => {
    const match = src.match(/const INAPPROPRIATE_WORDS = \[([\s\S]*?)\]/);
    if (!match) return [];
    return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
};

const INAPPROPRIATE_WORDS = extractWords(edgeSource);
const LOW_EFFORT_COMMENTS = new Set([
    '와', '우와', '오', '오오', '우웅', '헉', '대박', '굿', 'good', 'nice', '멋져', '최고', '짱',
    'ㅋㅋ', 'ㅎㅎ', '^^', '👍', '👏', '❤️', '😆', '😍', '😊', '와!', '오!'
]);

const looksLikeGibberish = (text) => {
    const compact = text.trim().replace(/\s+/g, '');
    const runs = compact.match(/(.)\1*/gu) || [];
    let longestRun = 0;
    for (const run of runs) {
        if (run.length > longestRun) longestRun = run.length;
    }
    return longestRun >= 25;
};

const containsInappropriateWords = (text) => {
    const normalized = text.replace(/[\s.,!?~@#$%^&*()_+=\-[\]{}|\\;:'"<>/`]/g, '').toLowerCase();
    return INAPPROPRIATE_WORDS.some(word => normalized.includes(word));
};

const commentLocalRejectionReason = (content) => {
    const trimmed = content.trim();
    if (containsInappropriateWords(trimmed)) {
        return '친구에게 상처를 주는 말 대신 따뜻하고 고운 말을 써 주세요. [로컬 비속어 선제 차단: AI 비용 0원]';
    }
    const compact = trimmed.replace(/\s+/g, '');
    if (compact.length < 8) {
        return '감탄만 적기보다 친구 글의 좋은 점이나 느낀 점을 조금 더 자세히 써 볼까요? (최소 8자 미만)';
    }
    if (trimmed.length > 200) {
        return '댓글은 200자 이내로 간결하고 다정하게 적어 주세요. (200자 초과 차단)';
    }
    if (LOW_EFFORT_COMMENTS.has(compact.toLowerCase())) {
        return '감탄만 적기보다 친구 글의 좋은 점이나 느낀 점을 조금 더 자세히 써 볼까요? (단순 감탄사)';
    }
    if (/^(.)\1{7,}$/u.test(compact) || /(.{1,8})\1{3,}/u.test(compact) || looksLikeGibberish(content)) {
        return '같은 말이나 의미 없는 글자를 반복하지 말고 친구에게 전하고 싶은 내용을 문장으로 써 주세요. (반복 도배)';
    }
    return null; // 통과 (정상이거나 미묘한 맥락의 경우 AI 심층 검사로 이동)
};

// 2. 시뮬레이션 테스트 케이스 목록
const testCases = [
    // [그룹 1: 정상 댓글]
    { category: '정상 댓글', input: '오늘 쓴 일기 내용이 정말 감동적이야! 다음 편도 기대할게.', expectedPass: true },
    { category: '정상 댓글', input: '주인공의 용기 있는 행동이 너무 멋졌어. 나도 본받고 싶다.', expectedPass: true },
    { category: '글자수 경계', input: '정말최고야멋진글이야', expectedPass: true, note: '공백 없이 딱 10자 (8자 이상 충족)' },
    { category: '글자수 경계', input: '친구야 글이 정말 훌륭하고 멋져! 감동적인 이야기를 써 줘서 너무 고마워. 다음 편도 기대할게. '.repeat(4).slice(0, 200), expectedPass: true, note: '정확히 200자 장문 정상 댓글 (상한선 충족)' },

    // [그룹 2: 글자수 위반]
    { category: '글자수 미달', input: '좋아좋아', expectedPass: false, note: '4자 (8자 미만)' },
    { category: '글자수 초과', input: '가'.repeat(201), expectedPass: false, note: '201자 (200자 초과)' },
    { category: '단순 감탄사', input: 'ㅋㅋㅋㅋㅋㅋㅋㅋ', expectedPass: false },
    { category: '단순 감탄사', input: '최고!', expectedPass: false },
    { category: '반복 도배', input: '와우와우와우와우와우와우와우와우와우', expectedPass: false },

    // [그룹 3: 직설적인 욕설 및 비속어]
    { category: '직설 욕설', input: '너 글 진짜 시발 못쓴다', expectedPass: false },
    { category: '직설 욕설', input: '개새끼야 이게 글이냐', expectedPass: false },
    { category: '직설 비하', input: '완전 병신 같은 글이네 ㅋㅋㅋ', expectedPass: false },
    { category: '직설 비하', input: '진짜 찐따 같다 글 수준 봐라', expectedPass: false },
    { category: '패드립', input: '느금마한테 가서 자랑해라', expectedPass: false },

    // [그룹 4: 띄어쓰기 변형 우회 시도]
    { category: '띄어쓰기 우회', input: '너 정말 시 발 글 못쓴다', expectedPass: false },
    { category: '띄어쓰기 우회', input: '개 새 끼 야 글이 이상해', expectedPass: false },
    { category: '띄어쓰기 우회', input: '씨    발 진짜 어이없네', expectedPass: false },
    { category: '띄어쓰기 우회', input: '병   신 짓 하지 마라', expectedPass: false },

    // [그룹 5: 특수문자 변형 우회 시도]
    { category: '특수문자 우회', input: '시.발 이게 무슨 글이야', expectedPass: false },
    { category: '특수문자 우회', input: '개~새~끼 글 참 못쓰네', expectedPass: false },
    { category: '특수문자 우회', input: '존_나 유치해서 못보겠다', expectedPass: false },
    { category: '특수문자 우회', input: '지!랄 하지 마시고요', expectedPass: false },
    { category: '특수문자 우회', input: '너 ㅂ..ㅅ 이냐 진짜로?', expectedPass: false },

    // [그룹 6: 초성 욕설 및 초성 변형]
    { category: '초성 욕설', input: '이 글 보고 토나올뻔 ㅅㅂ', expectedPass: false },
    { category: '초성 욕설', input: '진짜 답도 없다 ㅂㅅ아', expectedPass: false },
    { category: '초성 우회', input: '글 수준 실화냐? ㅅ.ㅂ', expectedPass: false },
    { category: '초성 우회', input: '너 ㅈ  ㄹ 하지 마라', expectedPass: false },

    // [그룹 7: 초등학생 언어 변형]
    { category: '변형 비속어', input: '시뱔 이게 뭔 소리냐', expectedPass: false },
    { category: '변형 비속어', input: '개색기야 말도 안된다', expectedPass: false },
    { category: '공격/조롱', input: '미친놈아 글이 이게 뭐냐', expectedPass: false },
    { category: '공격/조롱', input: '시끄럽고 닥쳐라 그냥', expectedPass: false },
    { category: '공격/조롱', input: '꼴보기 싫으니까 꺼져라', expectedPass: false }
];

console.log('================================================================');
console.log('🧪 끄적끄적 아지트 댓글 작성 & 필터링 종합 시뮬레이션');
console.log('================================================================\n');

let passCount = 0;
let failCount = 0;

for (let i = 0; i < testCases.length; i++) {
    const tc = testCases[i];
    const rejectionReason = commentLocalRejectionReason(tc.input);
    const passed = (rejectionReason === null);

    const isSuccess = (passed === tc.expectedPass);
    if (isSuccess) passCount++;
    else failCount++;

    const statusSymbol = isSuccess ? '✅ [성공]' : '❌ [실패]';
    const resultText = passed ? '통과 (AI 심층 검사 또는 정상 승인)' : `차단 -> "${rejectionReason}"`;

    const displayInput = tc.input.length > 35 ? tc.input.slice(0, 32) + '...' : tc.input;

    console.log(`${statusSymbol} #${String(i + 1).padStart(2, ' ')} [${tc.category}] "${displayInput}"`);
    console.log(`    ↳ 판정 결과: ${resultText}`);
    if (tc.note) console.log(`    ↳ 참고: ${tc.note}`);
    console.log('');
}

console.log('================================================================');
console.log(`📊 시뮬레이션 결과: 총 ${testCases.length}건 중 성공 ${passCount}건, 실패 ${failCount}건`);
if (failCount === 0) {
    console.log('🎉 모든 정상 댓글, 욕설 직설 표현, 공백/특수문자 우회 변형이 완벽하게 필터링되었습니다!');
    console.log('💰 AI 호출 비용: 욕설/변형 댓글은 OpenAI를 호출하지 않고 로컬에서 0원으로 즉시 차단됩니다.');
} else {
    console.log('⚠️ 일부 테스트 케이스에서 예상과 다른 결과가 나왔습니다.');
    process.exit(1);
}
console.log('================================================================');

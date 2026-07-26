export const KOREAN_CURRICULUM_VERSION = '2022';

// 2022 개정 국어과 교육과정 중 글쓰기 미션으로 직접 관찰할 수 있는
// 쓰기 영역과 시 창작 관련 문학 영역 성취기준만 제공한다.
export const KOREAN_ACHIEVEMENT_STANDARDS = [
    {
        code: '4국03-01',
        gradeBand: '3-4',
        domain: '쓰기',
        description: '중심 문장과 뒷받침 문장을 갖추어 문단을 쓰고, 문장과 문단을 중심으로 고쳐 쓴다.'
    },
    {
        code: '4국03-02',
        gradeBand: '3-4',
        domain: '쓰기',
        description: '절차와 결과가 드러나게 정확한 표현으로 보고하는 글을 쓴다.'
    },
    {
        code: '4국03-03',
        gradeBand: '3-4',
        domain: '쓰기',
        description: '대상에 대한 자신의 의견과 그렇게 생각한 이유가 드러나게 글을 쓴다.'
    },
    {
        code: '4국03-04',
        gradeBand: '3-4',
        domain: '쓰기',
        description: '목적과 주제를 고려하여 독자에게 마음을 전하는 글을 쓴다.'
    },
    {
        code: '4국03-05',
        gradeBand: '3-4',
        domain: '쓰기',
        description: '자신의 쓰기 과정을 점검하며 쓰기에 자신감을 갖는다.'
    },
    {
        code: '4국05-04',
        gradeBand: '3-4',
        domain: '문학 표현',
        description: '감각적 표현에 유의하여 작품을 감상하고, 감각적 표현을 활용하여 자신의 생각이나 감정을 표현한다.'
    },
    {
        code: '6국03-01',
        gradeBand: '5-6',
        domain: '쓰기',
        description: '알맞은 내용을 선정하여 대상의 특성이 나타나게 설명하는 글을 쓴다.'
    },
    {
        code: '6국03-02',
        gradeBand: '5-6',
        domain: '쓰기',
        description: '적절한 근거를 사용하고 인용의 출처를 밝히며 주장하는 글을 쓴다.'
    },
    {
        code: '6국03-03',
        gradeBand: '5-6',
        domain: '쓰기',
        description: '체험한 일에 대한 감상을 나타내는 글을 쓴다.'
    },
    {
        code: '6국03-04',
        gradeBand: '5-6',
        domain: '쓰기',
        description: '독자와 매체를 고려하여 내용을 생성하고 표현하며 글을 쓴다.'
    },
    {
        code: '6국03-05',
        gradeBand: '5-6',
        domain: '쓰기',
        description: '쓰기 과정을 점검·조정하며 글을 쓰고, 글 전체를 대상으로 통일성 있게 고쳐 쓴다.'
    },
    {
        code: '6국03-06',
        gradeBand: '5-6',
        domain: '쓰기',
        description: '쓰기에 적극적으로 참여하며 자신의 글을 독자와 공유하는 태도를 지닌다.'
    },
    {
        code: '6국05-05',
        gradeBand: '5-6',
        domain: '문학 표현',
        description: '자신의 경험을 시, 소설, 극, 수필 등 적절한 갈래로 표현한다.'
    }
];

export const getGradeBand = (grade) => (
    Number(grade) >= 5 ? '5-6' : Number(grade) >= 3 ? '3-4' : null
);

export const getKoreanStandardsForGrade = (grade) => {
    const gradeBand = getGradeBand(grade);
    return gradeBand
        ? KOREAN_ACHIEVEMENT_STANDARDS.filter((standard) => standard.gradeBand === gradeBand)
        : [];
};

export const resolveKoreanStandards = (codes = []) => {
    const codeSet = new Set(Array.isArray(codes) ? codes : []);
    return KOREAN_ACHIEVEMENT_STANDARDS.filter((standard) => codeSet.has(standard.code));
};


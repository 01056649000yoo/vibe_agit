const DAY_MS = 24 * 60 * 60 * 1000;

const hashText = (value = '') => Array.from(String(value)).reduce(
    (hash, character) => ((hash * 31) + character.charCodeAt(0)) >>> 0,
    0
);

const koreaDayNumber = (now = new Date()) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Math.floor(Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)) / DAY_MS);
};

/**
 * 오늘 쓴 글이 없을 때만 보여 줄 추천. 활성 모듈의 선언만 읽으므로 홈 조회를 늘리지 않고,
 * 같은 학생에게 같은 날은 같은 추천을 주되 날짜가 바뀌면 다음 항목으로 순환한다.
 */
export const getDragonStoryRecommendation = (enabledModules = [], studentId = '', now = new Date()) => {
    const recommendations = enabledModules
        .map((module) => module?.studentRecommendation)
        .filter(Boolean)
        .sort((left, right) => (left.order ?? 100) - (right.order ?? 100));
    if (recommendations.length === 0) return null;
    const index = (hashText(studentId) + koreaDayNumber(now)) % recommendations.length;
    return recommendations.at(index);
};

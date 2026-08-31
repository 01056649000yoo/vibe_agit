/**
 * 글쓰기·소통·자율 활동 칭호.
 *
 * 칭호 공용 모듈과 친구 아지트가 같은 정의를 보도록 한 곳에 둔다.
 * 나의 아지트와 글쓰기 발자국은 `title-status` 모듈의 같은 훅·상태창을 그대로 쓴다.
 *
 * 첫 단계는 승인 글 1편 완성, 그 다음부터는 누적 글자 수로 오른다.
 * 2026-07-30 한 학기 안에 상위 칭호에 너무 빨리 도달한다는 운영 피드백에 따라
 * 글자 수 문턱은 최초 확정값에서 30% 높였다. 첫 완성 경험은 늦추지 않도록 Lv2=승인 글 1편을 유지한다.
 * 등수·포인트 보상과는 연결하지 않고 자기 성장 표시로만 쓴다.
 *
 * ⚠️ **이 파일이 칭호 기준의 원본이다.** 숫자를 고치면 DB 도 함께 맞춰야 한다 —
 * `dragon_*_level()` 함수들이 학기 마감 때 그 시점의 칭호를
 * 스냅샷에 얼려 두는 데 쓰인다(그래야 나중에 기준을 바꿔도 지난 학기 기록이 소급해서
 * 바뀌지 않는다). 손으로 두 번 적지 않는다:
 *
 *     npm run sync:title-levels   # 이 파일에서 마이그레이션을 만든다
 *     npm run migrate             # 적용
 *
 * `npm run check:title-levels` 가 두 곳이 어긋났는지 보고, 배포 워크플로가 이를 먼저 실행한다.
 */
export const WRITER_LEVELS = [
    { level: 1, name: '새싹 작가', emoji: '🌱', from: 0, criterion: 'chars' },
    { level: 2, name: '첫걸음 작가', emoji: '✏️', from: 1, criterion: 'posts' },
    { level: 3, name: '연필 작가', emoji: '📝', from: 390, criterion: 'chars' },
    { level: 4, name: '이야기 작가', emoji: '📖', from: 910, criterion: 'chars' },
    { level: 5, name: '초보 작가', emoji: '🪶', from: 1820, criterion: 'chars' },
    { level: 6, name: '꾸준한 작가', emoji: '🔥', from: 3250, criterion: 'chars' },
    { level: 7, name: '숙련 작가', emoji: '🌳', from: 5460, criterion: 'chars' },
    { level: 8, name: '대문호', emoji: '👑', from: 10920, criterion: 'chars' },
    { level: 9, name: '빛나는 작가', emoji: '💫', from: 15600, criterion: 'chars' },
    { level: 10, name: '전설의 작가', emoji: '✨', from: 26000, criterion: 'chars' }
];

/**
 * @param {number} totalChars 서버의 공용 완료 글 집계로 센 누적 글자 수
 * @param {number} completedPosts 승인 글 수 — 미션 수가 아니다. 자율글도 한 편으로 센다.
 * @returns {{level:number, name:string, emoji:string, from:number, next:number|null, nextUnit:string, progressValue:number, progressFrom:number}}
 */
export const getWriterLevel = (totalChars = 0, completedPosts = 0, overrideLevel = null) => {
    const requestedOverride = Number(overrideLevel);
    if (Number.isInteger(requestedOverride) && requestedOverride >= 1 && requestedOverride <= WRITER_LEVELS.length) {
        const overrideIndex = requestedOverride - 1;
        const current = WRITER_LEVELS.at(overrideIndex);
        const upcoming = WRITER_LEVELS.at(overrideIndex + 1);
        return {
            ...current,
            next: upcoming ? upcoming.from : null,
            nextUnit: upcoming?.criterion === 'posts' ? '편' : '자',
            progressValue: current.from,
            progressFrom: current.from,
            isTestOverride: true
        };
    }

    const chars = Math.max(0, Number(totalChars) || 0);
    // 기존 호출처가 글 수를 아직 넘기지 않아도 승인 글에서 나온
    // 누적 글자가 있다면 최소 1편을 쓴 것으로 하위 호환한다.
    const posts = Math.max(0, Number(completedPosts) || 0, chars > 0 ? 1 : 0);
    const index = WRITER_LEVELS.reduce(
        (found, item, i) => {
            const value = item.criterion === 'posts' ? posts : chars;
            return value >= item.from ? i : found;
        },
        0
    );
    const current = WRITER_LEVELS.at(index);
    const upcoming = WRITER_LEVELS.at(index + 1);
    const progressUsesPosts = upcoming?.criterion === 'posts';
    const progressValue = progressUsesPosts ? posts : chars;
    const progressFrom = upcoming
        ? (progressUsesPosts ? 0 : (current.criterion === 'chars' ? current.from : 0))
        : current.from;

    return {
        ...current,
        next: upcoming ? upcoming.from : null,
        nextUnit: progressUsesPosts ? '편' : '자',
        progressValue,
        progressFrom
    };
};

/**
 * 소통 칭호. 내부 필드명 `reader`는 이미 저장된 응답·스냅샷과의 호환을 위해 유지한다.
 * 친구 글을 여러 편 읽고 반응하거나 정성스러운 댓글을 남기는 행동을 인정한다.
 * 등수·포인트 보상과는 연결하지 않고 자기 성장 표시로만 사용한다.
 * 2026-07-30 운영 학급의 1학기 중앙값 60점을 기준으로, 같은 활동량이 2학기까지
 * 이어지면 학생 절반이 1년 안에 Lv5(120점)에 닿도록 중·상위 구간을 보정했다.
 * Lv2는 첫 읽기 행동을 바로 인정하도록 1점을 유지한다.
 */
export const READER_LEVELS = [
    { level: 1, name: '조용한 이웃', emoji: '👀', from: 0 },
    { level: 2, name: '첫 인사', emoji: '👋', from: 1 },
    { level: 3, name: '이야기 친구', emoji: '💬', from: 20 },
    { level: 4, name: '다정한 이웃', emoji: '🤝', from: 50 },
    { level: 5, name: '든든한 친구', emoji: '🌟', from: 120 },
    { level: 6, name: '소통 달인', emoji: '🏅', from: 200 },
    { level: 7, name: '아지트 지킴이', emoji: '💎', from: 300 }
];

export const getReaderLevel = (score = 0, overrideLevel = null) => {
    const requestedOverride = Number(overrideLevel);
    if (Number.isInteger(requestedOverride) && requestedOverride >= 1 && requestedOverride <= READER_LEVELS.length) {
        const overrideIndex = requestedOverride - 1;
        const current = READER_LEVELS.at(overrideIndex);
        const upcoming = READER_LEVELS.at(overrideIndex + 1);
        return {
            ...current,
            next: upcoming ? upcoming.from : null,
            isTestOverride: true
        };
    }

    const safeScore = Math.max(0, Number(score) || 0);
    const index = READER_LEVELS.reduce(
        (found, item, i) => (safeScore >= item.from ? i : found),
        0
    );
    const current = READER_LEVELS.at(index);
    const upcoming = READER_LEVELS.at(index + 1);
    return { ...current, next: upcoming ? upcoming.from : null };
};

/**
 * 자율 일기 칭호. 글자 수가 아니라 이번 학기에 일기를 완성하고 교사가 확인한 날짜 수로 오른다.
 * 같은 날짜의 일기는 한 번만 인정하며 연속 작성은 요구하지 않는다.
 */
export const DIARY_LEVELS = [
    { level: 1, name: '기록 새싹', emoji: '🌱', from: 0 },
    { level: 2, name: '하루 기록가', emoji: '📔', from: 3 },
    { level: 3, name: '꾸준한 기록가', emoji: '✍️', from: 7 },
    { level: 4, name: '생활 관찰자', emoji: '🔎', from: 14 },
    { level: 5, name: '마음 기록가', emoji: '💛', from: 21 },
    { level: 6, name: '시간 수집가', emoji: '⏳', from: 30 },
    { level: 7, name: '위대한 기록가', emoji: '🏆', from: 40 }
];

/**
 * 자율 독서록 칭호. 이번 학기에 완성하고 교사가 확인한 독서록 편수로만 오른다.
 * 같은 책이라도 독서록을 새로 완성해 확인받으면 각각 한 편으로 인정한다.
 */
export const READING_LEVELS = [
    { level: 1, name: '책씨앗', emoji: '🌱', logsFrom: 0 },
    { level: 2, name: '책친구', emoji: '📗', logsFrom: 3 },
    { level: 3, name: '이야기 탐험가', emoji: '🧭', logsFrom: 6 },
    { level: 4, name: '책길잡이', emoji: '🗺️', logsFrom: 10 },
    { level: 5, name: '생각 독서가', emoji: '💡', logsFrom: 15 },
    { level: 6, name: '책숲지기', emoji: '🌳', logsFrom: 22 },
    { level: 7, name: '깊은 독서가', emoji: '🏆', logsFrom: 30 }
];

const getSingleMetricLevel = (levels, value = 0) => {
    const safeValue = Math.max(0, Number(value) || 0);
    const index = levels.reduce(
        (found, item, itemIndex) => (safeValue >= item.from ? itemIndex : found),
        0
    );
    const current = levels.at(index);
    const upcoming = levels.at(index + 1);
    return {
        ...current,
        next: upcoming ? upcoming.from : null,
        progressValue: safeValue,
        progressFrom: current.from
    };
};

export const getDiaryLevel = (days = 0, overrideLevel = null) => {
    const requestedOverride = Number(overrideLevel);
    if (Number.isInteger(requestedOverride) && requestedOverride >= 1 && requestedOverride <= DIARY_LEVELS.length) {
        return { ...getSingleMetricLevel(DIARY_LEVELS, DIARY_LEVELS.at(requestedOverride - 1).from), isTestOverride: true };
    }
    return getSingleMetricLevel(DIARY_LEVELS, days);
};

export const getReadingLevel = (logs = 0, { minimumLevel = 1, overrideLevel = null } = {}) => {
    const requestedOverride = Number(overrideLevel);
    if (Number.isInteger(requestedOverride) && requestedOverride >= 1 && requestedOverride <= READING_LEVELS.length) {
        const current = READING_LEVELS.at(requestedOverride - 1);
        const upcoming = READING_LEVELS.at(requestedOverride);
        return {
            ...current,
            nextLogs: upcoming ? upcoming.logsFrom : null,
            progressLogs: current.logsFrom,
            isTestOverride: true
        };
    }
    const safeLogs = Math.max(0, Number(logs) || 0);
    const achievedIndex = READING_LEVELS.reduce(
        (found, item, itemIndex) => (safeLogs >= item.logsFrom ? itemIndex : found),
        0
    );
    const requestedMinimum = Number(minimumLevel);
    const minimumIndex = Number.isInteger(requestedMinimum)
        ? Math.min(READING_LEVELS.length - 1, Math.max(0, requestedMinimum - 1))
        : 0;
    const index = Math.max(achievedIndex, minimumIndex);
    const current = READING_LEVELS.at(index);
    const upcoming = READING_LEVELS.at(index + 1);
    return {
        ...current,
        nextLogs: upcoming ? upcoming.logsFrom : null,
        progressLogs: safeLogs,
        isTransitionProtected: minimumIndex > achievedIndex
    };
};

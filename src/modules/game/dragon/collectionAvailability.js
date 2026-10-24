/**
 * 아지트 공방: 상품·세트를 지금 살 수 있는지, 못 산다면 왜인지(레벨·포인트)를 한 곳에서 판단한다(2026-10-24).
 * 화면은 이 값을 그대로 보여 주기만 한다 — "잠김" 이라고만 하지 않고 무엇이 얼마나 모자란지 알려 준다.
 */

/** 상품 하나의 구입 상태. status: equipped·owned·reward·level·points·buyable */
export const getItemAvailability = (item, { writerLevel = 1, readerLevel = 1, points = 0, ownedIds = new Set(), equippedId = null } = {}) => {
    const needWriter = Number(item?.requiredWriterLevel || 1);
    const needReader = Number(item?.requiredReaderLevel || 1);
    const price = Number(item?.price || 0);
    if (equippedId === item?.id) return { status: 'equipped', text: '현재 장착 중' };
    if (ownedIds.has(item?.id)) return { status: 'owned', text: '보유 중' };
    if (item?.acquisitionType === 'achievement') return { status: 'reward', text: '작가 10 · 소통 7 달성 선물' };
    const missing = [];
    if (needWriter > writerLevel) missing.push(`작가 ${needWriter}단계`);
    if (needReader > readerLevel) missing.push(`소통 ${needReader}단계`);
    if (missing.length) {
        return {
            status: 'level', needWriter, needReader,
            text: `${missing.join('·')}부터 살 수 있어요 (지금 작가 ${writerLevel}·소통 ${readerLevel})`
        };
    }
    if (points < price) return { status: 'points', text: `${price.toLocaleString('ko-KR')}P · ${(price - points).toLocaleString('ko-KR')}P 더 필요해요` };
    return { status: 'buyable', text: `${price.toLocaleString('ko-KR')}P` };
};

/** 세트(상품 5개)의 구입 현황: 보유·지금 살 수 있음·레벨 부족·포인트 부족 개수와 필요한 가장 높은 단계. */
export const getCollectionAvailability = (items, context) => {
    const rows = items.map((item) => ({ item, ...getItemAvailability(item, context) }));
    const count = (status) => rows.filter((row) => row.status === status).length;
    const levelRows = rows.filter((row) => row.status === 'level');
    return {
        rows,
        owned: count('owned') + count('equipped'),
        buyable: count('buyable'),
        levelLocked: levelRows.length,
        pointsShort: count('points'),
        reward: count('reward'),
        maxWriter: Math.max(1, ...levelRows.map((row) => row.needWriter)),
        maxReader: Math.max(1, ...levelRows.map((row) => row.needReader)),
        // 아직 사지 못한 상품의 값 합계(보유한 것은 뺀다)
        remainingPrice: rows.filter((row) => !['owned', 'equipped', 'reward'].includes(row.status))
            .reduce((sum, row) => sum + Number(row.item?.price || 0), 0)
    };
};

/** 세트 한 줄 요약(선생님·학생 모두 읽는 짧은 문장). */
export const describeCollectionAvailability = (availability) => {
    const { owned, buyable, levelLocked, pointsShort, maxWriter, maxReader } = availability;
    const parts = [];
    if (owned) parts.push(`${owned}개 보유`);
    if (buyable) parts.push(`${buyable}개 지금 살 수 있어요`);
    if (pointsShort) parts.push(`${pointsShort}개는 포인트가 더 필요해요`);
    if (levelLocked) {
        const need = [maxWriter > 1 ? `작가 ${maxWriter}단계` : null, maxReader > 1 ? `소통 ${maxReader}단계` : null].filter(Boolean).join('·');
        parts.push(`${levelLocked}개는 ${need}가 되어야 살 수 있어요`);
    }
    return parts.join(' · ') || '모두 가지고 있어요';
};

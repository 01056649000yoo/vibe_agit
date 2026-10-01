/**
 * 인형뽑기 상품 확률표 — 기본안(2026-10-01, 1단계 시제품).
 *
 * ⚠️ 2단계에서는 **서버가 뽑는다**(코인을 쓰는 순간 서버가 상품을 정하고, 집게 놀이는 결과를 보여 줄 뿐).
 *    그때 이 표는 서버 함수로 옮기고, 이 파일은 화면의 `확률 보기` 와 검사가 같은 숫자를 읽는 원본으로 남긴다.
 *
 * 정한 원칙(선생님 결정):
 *   - 코인은 맞춤법 퀴즈로만 얻는다. 포인트로 코인을 사는 길은 만들지 않는다(뽑기 중독 구조 방지).
 *   - 꽝은 없다. 하루 기회를 다 쓰고도 하나도 못 뽑으면 교사가 정한 최소 포인트를 준다(문제를 풀었으니).
 *   - 수호룡 아이템은 **학생이 지금 단계에서 상점에서 살 수 있는 것**만. 전설(만렙 선물)·무료 기본 아이템·
 *     이미 가진 것은 빠진다. 예외는 두지 않는다.
 *   - 확률은 학생 화면에 그대로 공개한다.
 */

/** 1차: 무엇을 받을지. 교사 선물이 없거나 받을 수 있는 수호룡 아이템이 없으면 그 몫은 포인트로 간다. */
export const CLAW_PRIZE_KIND_WEIGHTS = Object.freeze([
    { kind: 'points', label: '랜덤 포인트', weight: 85 },
    { kind: 'gift', label: '선생님 선물', weight: 10 },
    { kind: 'decor', label: '수호룡 아이템', weight: 5 }
]);

/** 2차(포인트): 기댓값 24.5P. 게임 공용 상한(하루 80P·주 250P) 안에서 지급한다. */
export const CLAW_POINT_WEIGHTS = Object.freeze([
    { points: 10, weight: 40 },
    { points: 20, weight: 30 },
    { points: 30, weight: 15 },
    { points: 50, weight: 10 },
    { points: 100, weight: 5 }
]);

/**
 * 2차(수호룡 아이템): 등급을 먼저 고르고 그 등급에서 아직 없는 것 하나를 고른다.
 * 등급 이름은 `dragon/decorCatalog.js` 의 DRAGON_DECOR_RARITIES 와 같다. 학생 작가 단계가 모자라
 * 살 수 없는 등급은 후보에서 빠지고, 남은 등급의 비중만으로 다시 나눈다.
 */
export const CLAW_DECOR_RARITY_WEIGHTS = Object.freeze([
    { rarity: 'starter', label: '입문', weight: 60 },
    { rarity: 'common', label: '일반', weight: 30 },
    { rarity: 'rare', label: '희귀', weight: 9 },
    { rarity: 'hero', label: '영웅', weight: 1 }
]);

/** 등급이 비어 있는 옛 상점 아이템은 가격으로 등급을 정한다(입문 300·일반 700·희귀 1,500·영웅 3,000P 기준). */
export const decorTierOf = (item) => {
    if (item.rarity && item.rarity !== 'legendary') return item.rarity;
    const price = Number(item.price) || 0;
    if (price <= 300) return 'starter';
    if (price <= 700) return 'common';
    if (price <= 1500) return 'rare';
    return 'hero';
};

/** 학생이 지금 상점에서 살 수 있는 아이템만 — 전설·업적·무료 기본·이미 가진 것·단계 미달은 뺀다. */
export const eligibleClawDecor = (catalog, { writerLevel = 1, readerLevel = 1, owned = [] } = {}) => {
    const ownedSet = new Set(owned);
    return catalog.filter((item) => item.isActive !== false
        && (item.acquisitionType || 'shop') === 'shop'
        && item.rarity !== 'legendary'
        && Number(item.price) > 0
        && !item.isDefault
        && Number(item.requiredWriterLevel || 1) <= writerLevel
        && Number(item.requiredReaderLevel || 1) <= readerLevel
        && !ownedSet.has(item.id));
};

const pickWeighted = (rows, random) => {
    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    if (total <= 0) return null;
    let roll = random() * total;
    for (const row of rows) {
        roll -= row.weight;
        if (roll < 0) return row;
    }
    return rows[rows.length - 1];
};

/**
 * 상품 하나를 뽑는다. 선물·아이템을 줄 수 없으면 포인트로 바꾼다(꽝 없음).
 * @returns {{kind:'points', points:number} | {kind:'gift', gift:object} | {kind:'decor', item:object}}
 */
export const rollClawPrize = ({ gifts = [], eligibleDecor = [], random = Math.random } = {}) => {
    const kinds = CLAW_PRIZE_KIND_WEIGHTS.filter((row) => (
        row.kind === 'points' || (row.kind === 'gift' && gifts.length > 0) || (row.kind === 'decor' && eligibleDecor.length > 0)
    ));
    const kind = pickWeighted(kinds, random)?.kind || 'points';
    if (kind === 'gift') return { kind, gift: gifts[Math.floor(random() * gifts.length)] };
    if (kind === 'decor') {
        const tiers = CLAW_DECOR_RARITY_WEIGHTS.filter((row) => eligibleDecor.some((item) => decorTierOf(item) === row.rarity));
        const tier = pickWeighted(tiers, random)?.rarity;
        const pool = eligibleDecor.filter((item) => decorTierOf(item) === tier);
        if (pool.length) return { kind, item: pool[Math.floor(random() * pool.length)] };
    }
    return { kind: 'points', points: pickWeighted(CLAW_POINT_WEIGHTS, random).points };
};

/** 화면의 `확률 보기` 용: 지금 조건에서 각 상품이 나올 실제 확률(%)을 계산한다. */
export const describeClawOdds = ({ hasGifts, decorTiers = [] }) => {
    const kinds = CLAW_PRIZE_KIND_WEIGHTS.filter((row) => (
        row.kind === 'points' || (row.kind === 'gift' && hasGifts) || (row.kind === 'decor' && decorTiers.length > 0)
    ));
    const kindTotal = kinds.reduce((sum, row) => sum + row.weight, 0);
    const pointTotal = CLAW_POINT_WEIGHTS.reduce((sum, row) => sum + row.weight, 0);
    const pointShare = (kinds.find((row) => row.kind === 'points')?.weight || 0) / kindTotal;
    const tiers = CLAW_DECOR_RARITY_WEIGHTS.filter((row) => decorTiers.includes(row.rarity));
    const tierTotal = tiers.reduce((sum, row) => sum + row.weight, 0);
    const decorShare = (kinds.find((row) => row.kind === 'decor')?.weight || 0) / kindTotal;
    const round = (value) => Math.round(value * 1000) / 10;
    return {
        points: CLAW_POINT_WEIGHTS.map((row) => ({ label: `${row.points}P`, percent: round(pointShare * row.weight / pointTotal) })),
        gift: hasGifts ? round((kinds.find((row) => row.kind === 'gift')?.weight || 0) / kindTotal) : 0,
        decor: tiers.map((row) => ({ label: row.label, percent: round(decorShare * row.weight / tierTotal) }))
    };
};

/**
 * 인형뽑기 상품 설정 — 기본값·검증·추첨·확률 공개의 **하나뿐인 원본**(2026-10-01 기본안, 2026-10-02 교사 설정).
 *
 * 교사는 기본값에서 시작해 ① 상품 종류별 비중(포인트·선생님 선물·수호룡 아이템) ② 포인트 금액과 비중
 * ③ 선생님 선물 목록과 비중 ④ 수호룡 아이템 등급별 비중을 바꿀 수 있다. 어떤 값이 들어와도
 * `normalizeClawPrizeSettings` 를 거친 값만 쓴다(범위·개수 제한, 빈 값은 기본값으로).
 *
 * ⚠️ 2단계에서는 **서버가 뽑는다**(코인을 쓰는 순간 서버가 상품을 정하고, 집게 놀이는 결과를 보여 줄 뿐).
 *    그때 교사 설정은 학급 설정으로 DB 에 두고, 서버(Deno)도 이 파일의 검증·추첨을 그대로 쓴다(앱 전용 import 없음).
 *
 * 정한 원칙(선생님 결정) — 교사 설정으로도 바뀌지 않는다:
 *   - 코인은 맞춤법 퀴즈로만 얻는다. 포인트로 코인을 사는 길은 만들지 않는다(뽑기 중독 구조 방지).
 *   - 꽝은 없다. 줄 수 없는 몫(선물이 없음·받을 아이템이 없음·비중 0)은 포인트로 간다.
 *     하루 기회를 다 쓰고도 하나도 못 뽑으면 교사가 정한 최소 포인트를 준다(문제를 풀었으니).
 *   - 수호룡 아이템은 **학생이 지금 단계에서 상점에서 살 수 있는 것**만. 전설(만렙 선물)·무료 기본 아이템·
 *     이미 가진 것은 빠진다. 예외는 두지 않는다.
 *   - 확률은 학생 화면에 그대로 공개한다(`describeClawOdds` — 추첨과 같은 계산).
 */

export const CLAW_PRIZE_KINDS = Object.freeze([
    { kind: 'points', label: '랜덤 포인트' },
    { kind: 'gift', label: '선생님 선물' },
    { kind: 'decor', label: '수호룡 아이템' }
]);

/** 등급 이름은 `dragon/decorCatalog.js` 의 DRAGON_DECOR_RARITIES 와 같다. */
export const CLAW_DECOR_RARITIES = Object.freeze([
    { rarity: 'starter', label: '입문' },
    { rarity: 'common', label: '일반' },
    { rarity: 'rare', label: '희귀' },
    { rarity: 'hero', label: '영웅' }
]);

/** 교사가 바꿀 수 있는 범위. 한 번에 주는 포인트는 게임 공용 상한(하루 80P·주 250P) 안에서 지급한다. */
export const CLAW_PRIZE_LIMITS = Object.freeze({
    weightMax: 1000,
    pointMin: 1,
    pointMax: 100,
    pointRows: 8,
    gifts: 20,
    giftName: 30
});

/** 기본값. 포인트 기댓값 24.5P. */
export const CLAW_DEFAULT_PRIZE_SETTINGS = Object.freeze({
    kinds: Object.freeze({ points: 85, gift: 10, decor: 5 }),
    points: Object.freeze([
        { id: 'p10', points: 10, weight: 40 },
        { id: 'p20', points: 20, weight: 30 },
        { id: 'p30', points: 30, weight: 15 },
        { id: 'p50', points: 50, weight: 10 },
        { id: 'p100', points: 100, weight: 5 }
    ].map(Object.freeze)),
    gifts: Object.freeze([
        { id: 'seat', name: '자리 고르기권', weight: 1 },
        { id: 'lunch', name: '급식 먼저 먹기권', weight: 1 }
    ].map(Object.freeze)),
    decorRarities: Object.freeze({ starter: 60, common: 30, rare: 9, hero: 1 })
});

const toInt = (value, min, max, fallback) => {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(number, min), max);
};
const toWeight = (value) => toInt(value, 0, CLAW_PRIZE_LIMITS.weightMax, 0);
const toId = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : fallback);
const pickField = (object, key) => (object && typeof object === 'object' ? Reflect.get(object, key) : undefined);

/**
 * 어떤 값이 와도 쓸 수 있는 설정으로 고친다. 빠진 칸은 기본값, 범위 밖은 끝값, 이름 없는 선물은 뺀다.
 * 포인트 표는 비중이 0보다 큰 줄이 하나는 있어야 한다(꽝 없음의 마지막 자리) — 없으면 기본 포인트 표.
 */
export const normalizeClawPrizeSettings = (raw) => {
    const base = CLAW_DEFAULT_PRIZE_SETTINGS;
    const kindsRaw = pickField(raw, 'kinds');
    const kinds = Object.fromEntries(CLAW_PRIZE_KINDS.map(({ kind }) => {
        const value = pickField(kindsRaw, kind);
        return [kind, value === undefined ? Reflect.get(base.kinds, kind) : toWeight(value)];
    }));

    const pointsRaw = pickField(raw, 'points');
    let points = Array.isArray(pointsRaw)
        ? pointsRaw.slice(0, CLAW_PRIZE_LIMITS.pointRows)
            .map((row, index) => ({
                id: toId(pickField(row, 'id'), `p-${index}`),
                points: toInt(pickField(row, 'points'), 0, CLAW_PRIZE_LIMITS.pointMax, 0),
                weight: toWeight(pickField(row, 'weight'))
            }))
            // 금액을 지우는 중이거나 0인 줄은 빠진다(0P 상품은 꽝과 같다).
            .filter((row) => row.points >= CLAW_PRIZE_LIMITS.pointMin)
        : base.points.map((row) => ({ ...row }));
    if (!points.some((row) => row.weight > 0)) points = base.points.map((row) => ({ ...row }));

    const giftsRaw = pickField(raw, 'gifts');
    const gifts = Array.isArray(giftsRaw)
        ? giftsRaw.slice(0, CLAW_PRIZE_LIMITS.gifts)
            .map((row, index) => ({
                id: toId(pickField(row, 'id'), `g-${index}`),
                name: String(pickField(row, 'name') ?? '').trim().slice(0, CLAW_PRIZE_LIMITS.giftName),
                weight: toWeight(pickField(row, 'weight') ?? 1)
            }))
            .filter((row) => row.name)
        : base.gifts.map((row) => ({ ...row }));

    const raritiesRaw = pickField(raw, 'decorRarities');
    const decorRarities = Object.fromEntries(CLAW_DECOR_RARITIES.map(({ rarity }) => {
        const value = pickField(raritiesRaw, rarity);
        return [rarity, value === undefined ? Reflect.get(base.decorRarities, rarity) : toWeight(value)];
    }));

    return { kinds, points, gifts, decorRarities };
};

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

/*
 * 추첨과 확률 공개가 함께 쓰는 "지금 실제로 나올 수 있는 줄". 둘이 따로 거르면 화면의 확률과
 * 실제 추첨이 어긋난다 — 이 세 함수만 쓴다.
 */
const liveGifts = (settings) => settings.gifts.filter((row) => row.weight > 0);
const livePoints = (settings) => settings.points.filter((row) => row.weight > 0);
const liveDecorTiers = (settings, decorTiers) => CLAW_DECOR_RARITIES
    .map(({ rarity, label }) => ({ rarity, label, weight: Reflect.get(settings.decorRarities, rarity) }))
    .filter((row) => row.weight > 0 && decorTiers.includes(row.rarity));
const liveKinds = (settings, decorTiers) => {
    const kinds = CLAW_PRIZE_KINDS
        .map(({ kind }) => ({ kind, weight: Reflect.get(settings.kinds, kind) }))
        .filter((row) => row.weight > 0 && (row.kind === 'points'
            || (row.kind === 'gift' && liveGifts(settings).length > 0)
            || (row.kind === 'decor' && liveDecorTiers(settings, decorTiers).length > 0)));
    // 모든 종류의 비중이 0이거나 줄 수 있는 것이 없으면 포인트만(꽝 없음).
    return kinds.length ? kinds : [{ kind: 'points', weight: 1 }];
};

/**
 * 상품 하나를 뽑는다. 선물·아이템을 줄 수 없으면 포인트로 바꾼다(꽝 없음).
 * @returns {{kind:'points', points:number} | {kind:'gift', gift:object} | {kind:'decor', item:object}}
 */
export const rollClawPrize = ({ settings = CLAW_DEFAULT_PRIZE_SETTINGS, eligibleDecor = [], random = Math.random } = {}) => {
    const safe = normalizeClawPrizeSettings(settings);
    const decorTiers = [...new Set(eligibleDecor.map(decorTierOf))];
    const kind = pickWeighted(liveKinds(safe, decorTiers), random).kind;
    if (kind === 'gift') return { kind, gift: pickWeighted(liveGifts(safe), random) };
    if (kind === 'decor') {
        const tier = pickWeighted(liveDecorTiers(safe, decorTiers), random).rarity;
        const pool = eligibleDecor.filter((item) => decorTierOf(item) === tier);
        return { kind, item: pool[Math.floor(random() * pool.length)] };
    }
    return { kind: 'points', points: pickWeighted(livePoints(safe), random).points };
};

/**
 * 화면의 `확률 보기`·교사 설정 판용: 지금 조건에서 각 상품이 나올 실제 확률(%).
 * `points`·`gifts` 줄은 `id` 를 달고 오며, 확률 0인 줄은 빠진다. `gift` 는 선물 전체 합.
 * `kinds` 는 종류별 몫(반올림 전 값으로 계산 — 줄마다 반올림한 값을 더하면 85.1% 처럼 어긋난다).
 */
export const describeClawOdds = ({ settings = CLAW_DEFAULT_PRIZE_SETTINGS, decorTiers = [] } = {}) => {
    const safe = normalizeClawPrizeSettings(settings);
    const kinds = liveKinds(safe, decorTiers);
    const kindTotal = kinds.reduce((sum, row) => sum + row.weight, 0);
    const shareOf = (kind) => (kinds.find((row) => row.kind === kind)?.weight || 0) / kindTotal;
    const spread = (rows, share) => {
        if (share <= 0) return [];
        const total = rows.reduce((sum, row) => sum + row.weight, 0);
        return rows.map((row) => ({ row, percent: Math.round(share * row.weight / total * 1000) / 10 }));
    };
    const gifts = spread(liveGifts(safe), shareOf('gift')).map(({ row, percent }) => ({ id: row.id, label: row.name, percent }));
    return {
        points: spread(livePoints(safe), shareOf('points')).map(({ row, percent }) => ({ id: row.id, label: `${row.points}P`, percent })),
        gifts,
        gift: Math.round(shareOf('gift') * 1000) / 10,
        kinds: Object.fromEntries(CLAW_PRIZE_KINDS.map(({ kind }) => [kind, Math.round(shareOf(kind) * 1000) / 10])),
        decor: spread(liveDecorTiers(safe, decorTiers), shareOf('decor')).map(({ row, percent }) => ({ id: row.rarity, label: row.label, percent }))
    };
};

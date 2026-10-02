/**
 * 인형뽑기 상품 설정 — 기본값·검증·추첨·확률 공개의 **하나뿐인 원본**(2026-10-01 기본안, 2026-10-02 교사 설정).
 *
 * 교사는 **상품마다 확률(%)** 을 정한다: 포인트 금액별·선생님 선물별·수호룡 아이템 등급별. 모두 더하면 100% 다
 * (인형 하나를 뽑았을 때 그 상품이 나올 확률). 상품 종류(포인트·선물·아이템)의 몫은 따로 정하지 않고 묶음의 합이다.
 * 어떤 값이 들어와도 `normalizeClawPrizeSettings` 를 거친 값만 쓴다(0~100%, 0.1% 단위, 개수 제한, 빈 값은 기본값).
 * 합이 100% 가 아니면 화면이 경고하고, 추첨은 넣은 값의 비율대로 한다(2단계 서버는 100% 일 때만 저장한다).
 *
 * 학생에게 열린 뒤(2026-10-02 2단계)에는 **서버가 뽑는다** — 한 판이 끝나 잡은 인형을 알리면 Edge 함수 `spelling-claw` 가
 *    이 파일로 상품을 정하고 DB 가 같은 트랜잭션에서 지급한다. 교사 설정은 학급 설정(DB)에 두고 쓸 때마다 이 파일로 검증한다.
 *    이 파일은 Edge 함수 폴더에 있다(운영에 올라가는 곳). 앱은 `src/modules/game/spelling-claw/prizeTable.js` 로 다시 내보낸다.
 *
 * 정한 원칙(선생님 결정) — 교사 설정으로도 바뀌지 않는다:
 *   - 코인은 맞춤법 퀴즈로만 얻는다. 포인트로 코인을 사는 길은 만들지 않는다(뽑기 중독 구조 방지).
 *   - 꽝은 없다. 줄 수 없는 몫(선물이 없음·그 학생이 받을 등급의 아이템이 없음)은 **포인트로** 간다 —
 *     교사가 정한 다른 상품의 확률은 그대로 둔다. 하루 기회를 다 쓰고도 하나도 못 뽑으면 교사가 정한 최소 포인트를 준다.
 *   - 수호룡 아이템은 **학생이 지금 단계에서 상점에서 살 수 있는 것**만. 전설(만렙 선물)·무료 기본 아이템·
 *     이미 가진 것은 빠진다. 예외는 두지 않는다.
 *   - 확률은 학생 화면에 그대로 공개한다(`describeClawOdds` — 추첨과 같은 계산).
 */

export const CLAW_PRIZE_KINDS = Object.freeze([
    { kind: 'points', label: '포인트' },
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

/** 교사가 바꿀 수 있는 범위. 포인트는 뽑은 그대로 준다(2026-10-02 선생님 결정 — 금액 유지, 하루 기회 수가 상한). */
export const CLAW_PRIZE_LIMITS = Object.freeze({
    pointMin: 1,
    pointMax: 100,
    pointRows: 8,
    gifts: 20,
    giftName: 30
});

/** 기본값(합 100%): 포인트 94%(평균 약 24P) · 수호룡 상점 아이템 5% · 선생님 선물 1%(2026-10-02 선생님 결정 — 선물·아이템은 드물게, 글쓰기 가치를 지킨다). */
export const CLAW_DEFAULT_PRIZE_SETTINGS = Object.freeze({
    points: Object.freeze([
        { id: 'p10', points: 10, percent: 37.6 },
        { id: 'p20', points: 20, percent: 28.2 },
        { id: 'p30', points: 30, percent: 14.6 },
        { id: 'p50', points: 50, percent: 9.4 },
        { id: 'p100', points: 100, percent: 4.2 }
    ].map(Object.freeze)),
    gifts: Object.freeze([
        { id: 'seat', name: '자리 고르기권', percent: 0.6 },
        { id: 'lunch', name: '급식 먼저 먹기권', percent: 0.4 }
    ].map(Object.freeze)),
    decor: Object.freeze({ starter: 3, common: 1.5, rare: 0.4, hero: 0.1 })
});

const toInt = (value, min, max, fallback) => {
    const number = Math.floor(Number(value));
    if (!Number.isFinite(number)) return fallback;
    return Math.min(Math.max(number, min), max);
};
/** 0~100%, 0.1% 단위. 숫자가 아니면 0. */
const toPercent = (value) => {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.round(Math.min(Math.max(number, 0), 100) * 10) / 10;
};
const toId = (value, fallback) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, 40) : fallback);
const pickField = (object, key) => (object && typeof object === 'object' ? Reflect.get(object, key) : undefined);
const round1 = (value) => Math.round(value * 10) / 10;
const sumPercent = (rows) => rows.reduce((sum, row) => sum + row.percent, 0);
const sumWeight = (rows) => rows.reduce((sum, row) => sum + row.weight, 0);

/** 어떤 값이 와도 쓸 수 있는 설정으로 고친다. 빠진 묶음은 기본값, 범위 밖은 끝값, 금액·이름이 없는 줄은 뺀다. */
export const normalizeClawPrizeSettings = (raw) => {
    const base = CLAW_DEFAULT_PRIZE_SETTINGS;
    const pointsRaw = pickField(raw, 'points');
    const points = Array.isArray(pointsRaw)
        ? pointsRaw.slice(0, CLAW_PRIZE_LIMITS.pointRows)
            .map((row, index) => ({
                id: toId(pickField(row, 'id'), `p-${index}`),
                points: toInt(pickField(row, 'points'), 0, CLAW_PRIZE_LIMITS.pointMax, 0),
                percent: toPercent(pickField(row, 'percent'))
            }))
            // 금액을 지우는 중이거나 0인 줄은 빠진다(0P 상품은 꽝과 같다).
            .filter((row) => row.points >= CLAW_PRIZE_LIMITS.pointMin)
        : base.points.map((row) => ({ ...row }));

    const giftsRaw = pickField(raw, 'gifts');
    const gifts = Array.isArray(giftsRaw)
        ? giftsRaw.slice(0, CLAW_PRIZE_LIMITS.gifts)
            .map((row, index) => ({
                id: toId(pickField(row, 'id'), `g-${index}`),
                name: String(pickField(row, 'name') ?? '').trim().slice(0, CLAW_PRIZE_LIMITS.giftName),
                percent: toPercent(pickField(row, 'percent'))
            }))
            .filter((row) => row.name)
        : base.gifts.map((row) => ({ ...row }));

    const decorRaw = pickField(raw, 'decor');
    const decor = Object.fromEntries(CLAW_DECOR_RARITIES.map(({ rarity }) => {
        const value = pickField(decorRaw, rarity);
        return [rarity, value === undefined ? Reflect.get(base.decor, rarity) : toPercent(value)];
    }));

    return { points, gifts, decor };
};

/** 교사가 넣은 확률의 합과 묶음별 합(%) — 화면의 `합계`·한눈에 보기 막대용. 학생마다 달라지지 않는 값이다. */
export const sumClawPrizeSettings = (settings) => {
    const safe = normalizeClawPrizeSettings(settings);
    const kinds = {
        points: round1(sumPercent(safe.points)),
        gift: round1(sumPercent(safe.gifts)),
        decor: round1(CLAW_DECOR_RARITIES.reduce((sum, { rarity }) => sum + Reflect.get(safe.decor, rarity), 0))
    };
    return { total: round1(kinds.points + kinds.gift + kinds.decor), kinds };
};

/**
 * 묶음 전체를 target% 로(교사 화면의 묶음 `전체` 칸): 안의 줄을 원래 비율대로 늘리거나 줄인다.
 * 0.1% 단위로 반올림하고 끝수는 가장 큰 줄에 더해 합이 정확히 target 이 되게 한다. 줄이 모두 0이면 똑같이 나눈다.
 */
export const scaleClawGroup = (values, target) => {
    const goal = toPercent(target);
    const numbers = values.map((value) => toPercent(value));
    const sum = numbers.reduce((total, value) => total + value, 0);
    const base = sum > 0 ? numbers : numbers.map(() => 1);
    const baseSum = sum > 0 ? sum : numbers.length;
    const out = base.map((value) => round1(value * goal / baseSum));
    const diff = round1(goal - out.reduce((total, value) => total + value, 0));
    if (!diff || !out.length) return out;
    const at = out.indexOf(Math.max(...out));
    return out.map((value, index) => (index === at ? Math.max(0, round1(value + diff)) : value));
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
 * 추첨과 확률 공개가 함께 쓰는 "이 학생에게 실제로 나올 수 있는 줄". 둘이 따로 계산하면 화면의 확률과
 * 실제 추첨이 어긋난다 — `planOf` 하나만 쓴다.
 *   - 확률 0 인 줄은 빠진다.
 *   - 그 학생이 받을 아이템이 없는 등급의 몫은 포인트 묶음으로 옮긴다(교사가 정한 다른 상품 확률은 그대로).
 *   - 포인트 줄이 하나도 없으면 옮겨 온 몫은 기본 포인트 표로 나눈다(꽝 없음의 마지막 자리).
 *   - 모든 확률이 0 이면 포인트만 나온다.
 */
const planOf = (settings, decorTiers) => {
    const safe = normalizeClawPrizeSettings(settings);
    const asRows = (rows) => rows.filter((row) => row.percent > 0).map((row) => ({ ...row, weight: row.percent }));
    const pointRows = asRows(safe.points);
    const giftRows = asRows(safe.gifts);
    const decorRows = CLAW_DECOR_RARITIES
        .map(({ rarity, label }) => ({ rarity, label, weight: Reflect.get(safe.decor, rarity) }))
        .filter((row) => row.weight > 0);
    const liveDecor = decorRows.filter((row) => decorTiers.includes(row.rarity));
    let pointsWeight = sumWeight(pointRows) + sumWeight(decorRows) - sumWeight(liveDecor);
    if (pointsWeight + sumWeight(giftRows) + sumWeight(liveDecor) <= 0) pointsWeight = 1;
    const kinds = [
        { kind: 'points', weight: pointsWeight },
        { kind: 'gift', weight: sumWeight(giftRows) },
        { kind: 'decor', weight: sumWeight(liveDecor) }
    ].filter((row) => row.weight > 0);
    const pointBase = pointRows.length ? pointRows : asRows(CLAW_DEFAULT_PRIZE_SETTINGS.points);
    return { kinds, pointRows: pointBase, giftRows, decorRows: liveDecor };
};

/**
 * 상품 하나를 뽑는다. 줄 수 없는 몫은 포인트로 간다(꽝 없음).
 * @returns {{kind:'points', points:number} | {kind:'gift', gift:object} | {kind:'decor', item:object}}
 */
export const rollClawPrize = ({ settings = CLAW_DEFAULT_PRIZE_SETTINGS, eligibleDecor = [], random = Math.random } = {}) => {
    const plan = planOf(settings, [...new Set(eligibleDecor.map(decorTierOf))]);
    const kind = pickWeighted(plan.kinds, random).kind;
    if (kind === 'gift') return { kind, gift: pickWeighted(plan.giftRows, random) };
    if (kind === 'decor') {
        const tier = pickWeighted(plan.decorRows, random).rarity;
        const pool = eligibleDecor.filter((item) => decorTierOf(item) === tier);
        return { kind, item: pool[Math.floor(random() * pool.length)] };
    }
    return { kind: 'points', points: pickWeighted(plan.pointRows, random).points };
};

/**
 * 학생 화면의 `상품이 나올 확률 보기` 용: **이 학생에게** 각 상품이 나올 실제 확률(%).
 * `points`·`gifts`·`decor` 줄은 `id` 를 달고 오며, 확률 0인 줄은 빠진다. `gift` 는 선물 전체 합,
 * `kinds` 는 종류별 몫(반올림 전 값으로 계산 — 줄마다 반올림한 값을 더하면 85.1% 처럼 어긋난다).
 */
export const describeClawOdds = ({ settings = CLAW_DEFAULT_PRIZE_SETTINGS, decorTiers = [] } = {}) => {
    const plan = planOf(settings, decorTiers);
    const kindTotal = sumWeight(plan.kinds);
    const shareOf = (kind) => (plan.kinds.find((row) => row.kind === kind)?.weight || 0) / kindTotal;
    const spread = (rows, share) => {
        if (share <= 0) return [];
        const total = sumWeight(rows);
        return rows.map((row) => ({ row, percent: round1(share * row.weight / total * 100) }));
    };
    return {
        points: spread(plan.pointRows, shareOf('points')).map(({ row, percent }) => ({ id: row.id, label: `${row.points}P`, percent })),
        gifts: spread(plan.giftRows, shareOf('gift')).map(({ row, percent }) => ({ id: row.id, label: row.name, percent })),
        gift: round1(shareOf('gift') * 100),
        kinds: Object.fromEntries(CLAW_PRIZE_KINDS.map(({ kind }) => [kind, round1(shareOf(kind) * 100)])),
        decor: spread(plan.decorRows, shareOf('decor')).map(({ row, percent }) => ({ id: row.rarity, label: row.label, percent }))
    };
};

/*
 * 학급 설정(목표·하루 기회·난이도·최소 포인트·집게 힘·선물 알림) — 기본값과 검증의 하나뿐인 원본.
 * DB 는 교사가 저장한 값을 그대로 두고(모양만 본다), 서버·화면이 쓸 때마다 이 함수를 거친다.
 */
export const CLAW_CLASS_SETTING_OPTIONS = Object.freeze({
    passCount: Object.freeze([5, 6, 7, 8, 9, 10]),
    dailyPlays: Object.freeze([1, 2, 3, 5]),
    quizLevel: Object.freeze(['easy', 'normal', 'hard']),
    minPoints: Object.freeze([10, 20, 30, 50]),
    grip: Object.freeze(['easy', 'normal', 'hard'])
});
export const CLAW_DEFAULT_CLASS_SETTINGS = Object.freeze({
    passCount: 7, dailyPlays: 3, quizLevel: 'normal', minPoints: 20, grip: 'easy', announceGifts: true
});
/** 한 판에 상품을 주는 인형 수 상한. 한 번에 둘을 집는 일은 드물고, 화면이 보낸 값만 믿는 곳이라 묶어 둔다. */
export const CLAW_MAX_PRIZES_PER_PLAY = 2;

export const normalizeClawClassSettings = (raw) => {
    const pick = (key) => {
        const value = pickField(raw, key);
        const options = Reflect.get(CLAW_CLASS_SETTING_OPTIONS, key);
        const cast = typeof Reflect.get(CLAW_DEFAULT_CLASS_SETTINGS, key) === 'number' ? Number(value) : value;
        return options.includes(cast) ? cast : Reflect.get(CLAW_DEFAULT_CLASS_SETTINGS, key);
    };
    const announce = pickField(raw, 'announceGifts');
    return {
        passCount: pick('passCount'),
        dailyPlays: pick('dailyPlays'),
        quizLevel: pick('quizLevel'),
        minPoints: pick('minPoints'),
        grip: pick('grip'),
        announceGifts: typeof announce === 'boolean' ? announce : CLAW_DEFAULT_CLASS_SETTINGS.announceGifts
    };
};

/** DB `dragon_decor_catalog` 행(snake_case) → `eligibleClawDecor` 가 읽는 모양. 서버·화면이 같은 변환을 쓴다. */
export const clawDecorFromCatalogRows = (rows) => (Array.isArray(rows) ? rows : []).map((row) => ({
    id: row.id,
    name: row.name,
    slot: row.slot,
    price: Number(row.price) || 0,
    rarity: row.rarity || null,
    requiredWriterLevel: Number(row.required_writer_level) || 1,
    requiredReaderLevel: Number(row.required_reader_level) || 1,
    acquisitionType: row.acquisition_type || 'shop',
    isDefault: Boolean(row.is_default),
    isActive: row.is_active !== false
}));

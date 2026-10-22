import { CLAW_DECOR_RARITIES, scaleClawGroup } from './prizeTable.js';

/**
 * 상품 확률 자동 맞추기(2026-10-22, 선생님 제안): 선생님 선물이나 수호룡 아이템 확률을 바꾸면 **포인트 확률이 그 차이만큼 늘거나 줄어**
 * 합계가 늘 100% 로 유지된다. 포인트는 "나머지"를 받는 쪽이라, 선물을 1% 늘리면 포인트가 1% 줄고 그 안의 금액별 비율은 그대로다.
 *
 * 포인트 줄끼리의 비율은 **직전 손질 때의 비율**(`memo.base`)로 계산해 다시 나눈다 — 입력하는 동안 키를 칠 때마다 현재 값에서 다시 나누면 끝수가 쌓여
 * 비율이 조금씩 틀어지고, 선물을 0% 로 되돌려도 처음 숫자로 돌아오지 않는다. 선생님이 포인트 줄을 직접 고치면(= 마지막 결과와 달라지면) 그 값이 새 기준이다.
 * 선물·아이템 확률의 합이 100% 를 넘을 수는 없다(넘으면 방금 바꾼 쪽을 줄인다).
 * 화면(.jsx)과 떨어진 순수 함수라 `node --test` 가 바로 부른다.
 */
const round1 = (value) => Math.round(value * 10) / 10;
const asPercent = (value) => { const number = Number(value); return Number.isFinite(number) ? Math.min(Math.max(number, 0), 100) : 0; };
const sum = (values) => round1(values.reduce((total, value) => total + asPercent(value), 0));

export const giftTotal = (draft) => sum(draft.gifts.map((row) => row.percent));
export const decorTotal = (draft) => sum(CLAW_DECOR_RARITIES.map(({ rarity }) => Reflect.get(draft.decor, rarity)));
export const othersTotal = (draft) => round1(giftTotal(draft) + decorTotal(draft));

const signature = (rows) => rows.map((row) => `${row.id}:${asPercent(row.percent)}`).join('|');

/** 선물·아이템 합이 100% 를 넘으면 방금 바꾼 쪽을 줄여 정확히 100% 로 맞춘다. `edited`: { group: 'gifts'|'decor', id?, rarity? }(없으면 줄이지 않음). */
const limitOthers = (draft, edited) => {
    const excess = round1(othersTotal(draft) - 100);
    if (excess <= 0 || !edited) return { draft, clamped: false };
    if (edited.group === 'gifts') {
        if (edited.id) {
            return { clamped: true, draft: { ...draft, gifts: draft.gifts.map((row) => (row.id === edited.id ? { ...row, percent: Math.max(0, round1(asPercent(row.percent) - excess)) } : row)) } };
        }
        const scaled = scaleClawGroup(draft.gifts.map((row) => row.percent), Math.max(0, round1(giftTotal(draft) - excess)));
        return { clamped: true, draft: { ...draft, gifts: draft.gifts.map((row, index) => ({ ...row, percent: scaled.at(index) })) } };
    }
    if (edited.rarity) {
        return { clamped: true, draft: { ...draft, decor: { ...draft.decor, [edited.rarity]: Math.max(0, round1(asPercent(Reflect.get(draft.decor, edited.rarity)) - excess)) } } };
    }
    const scaled = scaleClawGroup(CLAW_DECOR_RARITIES.map(({ rarity }) => Reflect.get(draft.decor, rarity)), Math.max(0, round1(decorTotal(draft) - excess)));
    return { clamped: true, draft: { ...draft, decor: Object.fromEntries(CLAW_DECOR_RARITIES.map(({ rarity }, index) => [rarity, scaled.at(index)])) } };
};

/** 방금 고친 칸이 0~100 을 벗어난 숫자(`150`·`-10`)면 칸 값 자체를 0 또는 100 으로 바로잡는다 — 합계만 맞고 칸에는 `150` 이 남던 것(2026-10-22 점검). 빈 칸·입력 중(`1.`)은 그대로 둔다. */
const outOfRange = (value) => {
    if (value === '' || value === null || value === undefined) return null;
    const number = Number(value);
    return Number.isFinite(number) && (number > 100 || number < 0) ? round1(asPercent(number)) : null;
};
const boundEdited = (draft, edited) => {
    if (edited?.group === 'gifts' && edited.id) {
        const row = draft.gifts.find((item) => item.id === edited.id);
        const fixed = row ? outOfRange(row.percent) : null;
        if (fixed !== null) return { clamped: true, draft: { ...draft, gifts: draft.gifts.map((item) => (item.id === edited.id ? { ...item, percent: fixed } : item)) } };
    }
    if (edited?.group === 'decor' && edited.rarity) {
        const fixed = outOfRange(Reflect.get(draft.decor, edited.rarity));
        if (fixed !== null) return { clamped: true, draft: { ...draft, decor: { ...draft.decor, [edited.rarity]: fixed } } };
    }
    return { clamped: false, draft };
};

/**
 * 선물·아이템이 바뀐 뒤의 `draft` 를 받아 포인트를 나머지(100 − 선물 − 아이템)로 다시 나눈다.
 * @returns {{ draft: object, memo: object|null, clamped: boolean }} `memo` 는 다음 호출에 그대로 넘긴다(처음엔 null).
 *   포인트 줄이 하나도 없으면 받을 곳이 없어 합계를 맞추지 않는다(화면의 `100%로 맞추기`·경고가 그대로 있다).
 */
export const rebalancePoints = (draft, memo, edited = null) => {
    const bounded = boundEdited(draft, edited);
    const limited = limitOthers(bounded.draft, edited);
    const next = limited.draft;
    const rows = next.points;
    if (!rows.length) return { draft: next, memo, clamped: limited.clamped || bounded.clamped };
    const target = Math.max(0, round1(100 - othersTotal(next)));
    const base = memo && memo.signature === signature(rows) ? memo.base : rows.map((row) => asPercent(row.percent));
    const scaled = scaleClawGroup(base, target);
    const points = rows.map((row, index) => ({ ...row, percent: scaled.at(index) }));
    return { draft: { ...next, points }, memo: { signature: signature(points), base }, clamped: limited.clamped || bounded.clamped };
};

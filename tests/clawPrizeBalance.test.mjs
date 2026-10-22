import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { CLAW_DEFAULT_PRIZE_SETTINGS, sumClawPrizeSettings } from '../src/modules/game/spelling-claw/prizeTable.js';
import { rebalancePoints } from '../src/modules/game/spelling-claw/clawPrizeBalance.js';

/*
 * 수호룡의 인형뽑기 상품 확률 자동 맞추기(2026-10-22, 선생님 제안): 선물·아이템 확률을 바꾸면 포인트가 나머지를 받아 합계가 늘 100%.
 */
const fresh = () => structuredClone(CLAW_DEFAULT_PRIZE_SETTINGS);
const pointPercents = (draft) => draft.points.map((row) => row.percent);
const withGift = (draft, percent, id = 'g1') => ({
    ...draft,
    gifts: draft.gifts.some((row) => row.id === id)
        ? draft.gifts.map((row) => (row.id === id ? { ...row, percent } : row))
        : [...draft.gifts, { id, name: '자리 고르기권', percent }]
});

test('선물 확률을 넣으면 포인트가 그만큼 줄어 합계가 100%로 유지되고, 포인트 금액별 비율은 그대로다', () => {
    const base = fresh();
    const result = rebalancePoints(withGift(base, 2), null, { group: 'gifts', id: 'g1' });
    assert.equal(sumClawPrizeSettings(result.draft).total, 100);
    assert.equal(sumClawPrizeSettings(result.draft).kinds.points, 93);
    // 비율 유지: 10P 줄 / 20P 줄 ≈ 38 / 28.5 (0.1% 반올림 오차 안)
    const [a, b] = pointPercents(result.draft);
    assert.ok(Math.abs(a / b - 38 / 28.5) < 0.02, `비율이 틀어졌습니다: ${a}/${b}`);
    assert.equal(result.clamped, false);
});

test('선물을 입력하는 동안(키를 칠 때마다) 끝수가 쌓이지 않고, 0%로 되돌리면 처음 숫자가 정확히 돌아온다', () => {
    let draft = fresh();
    let memo = null;
    for (const typed of [1, 12, 1.5, 7, 3, 20, 0.5, 0]) {
        const result = rebalancePoints(withGift(draft, typed), memo, { group: 'gifts', id: 'g1' });
        assert.equal(sumClawPrizeSettings(result.draft).total, 100, `선물 ${typed}% 일 때 합계`);
        draft = result.draft; memo = result.memo;
    }
    assert.deepEqual(pointPercents(draft), pointPercents(fresh()), '선물을 0%로 되돌리면 포인트가 처음 값이어야 합니다.');
});

test('수호룡 아이템 확률을 바꿔도 포인트가 나머지를 받는다', () => {
    const base = fresh();
    const result = rebalancePoints({ ...base, decor: { ...base.decor, hero: 3.1 } }, null, { group: 'decor', rarity: 'hero' });
    assert.equal(sumClawPrizeSettings(result.draft).total, 100);
    assert.equal(sumClawPrizeSettings(result.draft).kinds.decor, 8);
    assert.equal(sumClawPrizeSettings(result.draft).kinds.points, 92);
});

test('선물을 지우면 그 확률이 포인트로 돌아간다', () => {
    const withTwo = rebalancePoints(withGift(fresh(), 4), null, { group: 'gifts', id: 'g1' });
    const removed = rebalancePoints({ ...withTwo.draft, gifts: [] }, withTwo.memo, null);
    assert.equal(sumClawPrizeSettings(removed.draft).total, 100);
    assert.deepEqual(pointPercents(removed.draft), pointPercents(fresh()));
});

test('선물과 아이템의 합이 100%를 넘을 수 없다 — 방금 바꾼 선물을 줄이고 포인트는 0%가 된다', () => {
    const result = rebalancePoints(withGift(fresh(), 98), null, { group: 'gifts', id: 'g1' });
    assert.equal(result.clamped, true);
    const sums = sumClawPrizeSettings(result.draft);
    assert.equal(sums.total, 100);
    assert.equal(sums.kinds.points, 0);
    assert.equal(sums.kinds.gift, 95); // 100 − 아이템 5%
});

test('선생님이 포인트 줄을 직접 고치면 그 값이 새 기준이 된다', () => {
    const first = rebalancePoints(withGift(fresh(), 5), null, { group: 'gifts', id: 'g1' });
    // 직접 고침: 10P 줄을 크게
    const edited = { ...first.draft, points: first.draft.points.map((row) => (row.id === 'p10' ? { ...row, percent: 60 } : row)) };
    const second = rebalancePoints(withGift(edited, 10), first.memo, { group: 'gifts', id: 'g1' });
    assert.equal(sumClawPrizeSettings(second.draft).total, 100);
    // 직접 고친 값이 반영된 비율(10P 가 가장 큼)로 나뉜다
    const percents = pointPercents(second.draft);
    assert.equal(percents[0], Math.max(...percents));
});

test('포인트 줄이 하나도 없으면 받을 곳이 없어 맞추지 않는다(합계 경고가 그대로 남는다)', () => {
    const noPoints = { ...fresh(), points: [] };
    const result = rebalancePoints(withGift(noPoints, 3), null, { group: 'gifts', id: 'g1' });
    assert.notEqual(sumClawPrizeSettings(result.draft).total, 100);
    assert.deepEqual(result.draft.points, []);
});

test('화면은 선물·아이템·선물 삭제만 자동 맞추기를 거치고, 포인트 직접 입력은 그대로 둔다', async () => {
    const source = await readFile(new URL('../src/modules/game/spelling-claw/ClawPrizeSettings.jsx', import.meta.url), 'utf8');
    assert.match(source, /import \{ rebalancePoints \} from '\.\/clawPrizeBalance'/);
    assert.match(source, /setBalanced\(\{ gifts: draft\.gifts\.map/);
    assert.match(source, /setBalanced\(\{ decor: \{ \.\.\.draft\.decor, \[rarity\]: value \} \}/);
    assert.match(source, /if \(key === 'gifts'\) setBalanced\(patch, \{ group: 'gifts' \}\); else set\(patch\)/);
    // 포인트 줄 입력은 자동으로 맞추지 않는다
    assert.match(source, /updateRow\('points', row\.id, \{ percent: value \}\)/);
    assert.match(source, /claw-prize-settings__notice/);
});

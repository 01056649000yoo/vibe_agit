import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
    describeCollectionAvailability, getCollectionAvailability, getItemAvailability
} from '../src/modules/game/dragon/collectionAvailability.js';

// 아지트 공방(2026-10-24): 못 사는 까닭을 알려 주고, 세트를 한 번에(또는 가진 것 빼고 나머지만) 살 수 있다.
const item = (id, price, writer = 1, reader = 1, extra = {}) => ({ id, slot: 'wallpaper', name: id, price, requiredWriterLevel: writer, requiredReaderLevel: reader, ...extra });
const context = (extra = {}) => ({ writerLevel: 3, readerLevel: 2, points: 1000, ownedIds: new Set(), ...extra });

test('상품: 작가·소통 단계가 모자라면 어느 쪽이 얼마나인지, 포인트가 모자라면 얼마나인지 말한다', () => {
    assert.equal(getItemAvailability(item('a', 500), context()).status, 'buyable');
    const writer = getItemAvailability(item('b', 500, 5), context());
    assert.equal(writer.status, 'level');
    assert.match(writer.text, /작가 5단계부터 살 수 있어요 \(지금 작가 3·소통 2\)/);
    const reader = getItemAvailability(item('c', 500, 1, 4), context());
    assert.match(reader.text, /소통 4단계/);
    assert.doesNotMatch(reader.text, /작가 4단계/, '소통이 모자라는데 작가 단계로 안내하면 안 된다');
    const both = getItemAvailability(item('d', 500, 5, 4), context());
    assert.match(both.text, /작가 5단계·소통 4단계/);
    const points = getItemAvailability(item('e', 1500), context());
    assert.equal(points.status, 'points');
    assert.match(points.text, /500P 더 필요해요/);
    assert.equal(getItemAvailability(item('f', 500), context({ ownedIds: new Set(['f']) })).status, 'owned');
    assert.equal(getItemAvailability(item('g', 0, 10, 7, { acquisitionType: 'achievement' }), context()).status, 'reward');
});

test('세트: 가진 것·살 수 있는 것·레벨 부족·남은 값을 세고 요약 문장을 만든다', () => {
    const items = [item('a', 300), item('b', 300), item('c', 400, 5), item('d', 400, 5), item('e', 300)];
    const availability = getCollectionAvailability(items, context({ ownedIds: new Set(['a']) }));
    assert.equal(availability.owned, 1);
    assert.equal(availability.buyable, 2);
    assert.equal(availability.levelLocked, 2);
    assert.equal(availability.maxWriter, 5);
    assert.equal(availability.remainingPrice, 1400, '가진 상품은 값에서 뺀다');
    assert.equal(describeCollectionAvailability(availability), '1개 보유 · 2개 지금 살 수 있어요 · 2개는 작가 5단계가 되어야 살 수 있어요');
    const all = getCollectionAvailability(items.slice(0, 2), context({ ownedIds: new Set(['a', 'b']) }));
    assert.equal(describeCollectionAvailability(all), '2개 보유');
});

test('서버 함수는 기존 단품 구입 함수를 한 거래로 묶고, 화면은 사기 전에 한 번 더 묻는다', async () => {
    const migration = await readFile('supabase/migrations/20261412_dragon_decor_set_purchase.sql', 'utf8');
    assert.match(migration, /v_result := public\.buy_my_dragon_decor\(v_id\)/);
    assert.match(migration, /BETWEEN 1 AND 8/);
    assert.doesNotMatch(migration, /required_writer_level/, '레벨 기준을 이 함수에 다시 두지 않는다');
    const [modal, hook] = await Promise.all([
        readFile('src/modules/game/dragon/BackgroundShopModal.jsx', 'utf8'),
        readFile('src/modules/game/dragon/useDragonPet.js', 'utf8')
    ]);
    assert.match(modal, /이미 가진 \$\{owned\}개는 빼고, 나머지 \$\{remaining\}개를/);
    assert.match(modal, /네, 구입해요/);
    assert.match(modal, /나머지 \$\{remaining\}개 구입/);
    assert.match(hook, /rpc\('buy_my_dragon_decor_set_v1'/);
});

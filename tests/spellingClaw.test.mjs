import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
    CLAW_POINT_WEIGHTS, describeClawOdds, eligibleClawDecor, rollClawPrize
} from '../src/modules/game/spelling-claw/prizeTable.js';

/*
 * 맞춤법 인형뽑기 1단계 시제품(2026-10-01). 선생님이 정한 원칙을 지키는지 본다.
 *   - 수호룡 아이템은 학생이 지금 살 수 있는 상점 물건만(전설·업적·무료·가진 것·단계 미달 제외, 예외 없음)
 *   - 꽝 없음, 확률 공개(표의 합이 100%)
 *   - 포켓몬 모델·외부 CDN 을 쓰지 않고, 3D 엔진은 게임을 열 때만 받는다
 */
const seeded = (seed) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const CATALOG = [
    { id: 'starter', rarity: 'starter', price: 300, requiredWriterLevel: 1 },
    { id: 'common', rarity: 'common', price: 700, requiredWriterLevel: 3 },
    { id: 'rare', rarity: 'rare', price: 1500, requiredWriterLevel: 5 },
    { id: 'hero', rarity: 'hero', price: 3000, requiredWriterLevel: 7 },
    { id: 'legend', rarity: 'legendary', price: 0, requiredWriterLevel: 10, acquisitionType: 'achievement' },
    { id: 'free', price: 0, isDefault: true, requiredWriterLevel: 1 },
    { id: 'old-frame', price: 500, requiredWriterLevel: 1 },
    { id: 'reader-gated', rarity: 'common', price: 700, requiredWriterLevel: 1, requiredReaderLevel: 5 }
];

test('수호룡 아이템은 지금 단계에서 살 수 있는 상점 물건만, 예외 없이', () => {
    const ids = (list) => list.map((item) => item.id).sort();
    assert.deepEqual(ids(eligibleClawDecor(CATALOG, { writerLevel: 3, readerLevel: 1 })), ['common', 'old-frame', 'starter']);
    assert.deepEqual(ids(eligibleClawDecor(CATALOG, { writerLevel: 10, readerLevel: 7, owned: ['hero'] })),
        ['common', 'old-frame', 'rare', 'reader-gated', 'starter'], '전설(만렙 선물)·이미 가진 것이 섞였습니다.');
    const eligible = eligibleClawDecor(CATALOG, { writerLevel: 3 });
    const random = seeded(7);
    for (let i = 0; i < 5000; i += 1) {
        const prize = rollClawPrize({ gifts: [], eligibleDecor: eligible, random });
        if (prize.kind === 'decor') assert.ok(eligible.includes(prize.item));
        assert.notEqual(prize.kind, 'gift', '선물이 없는데 선물이 나왔습니다.');
    }
});

test('꽝이 없고, 공개하는 확률의 합이 100%이며 줄 수 없는 몫은 포인트로 간다', () => {
    const random = seeded(11);
    for (let i = 0; i < 2000; i += 1) {
        const prize = rollClawPrize({ random });
        assert.equal(prize.kind, 'points');
        assert.ok(CLAW_POINT_WEIGHTS.some((row) => row.points === prize.points));
    }
    for (const odds of [
        describeClawOdds({ hasGifts: true, decorTiers: ['starter', 'common', 'rare', 'hero'] }),
        describeClawOdds({ hasGifts: false, decorTiers: [] })
    ]) {
        const total = [...odds.points, ...odds.decor].reduce((sum, row) => sum + row.percent, 0) + odds.gift;
        assert.ok(Math.abs(total - 100) < 0.5, `확률 합이 ${total}% 입니다.`);
    }
});

test('포켓몬 모델·외부 CDN 을 쓰지 않고, 3D 엔진은 게임을 열 때만 받는다', async () => {
    const [engine, stage, catalog, assets] = await Promise.all([
        readFile('src/modules/game/spelling-claw/engine/clawEngine.js', 'utf8'),
        readFile('src/modules/game/spelling-claw/ClawMachineStage.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/plushCatalog.js', 'utf8'),
        readdir('public/assets/claw/plush')
    ]);
    assert.doesNotMatch(engine, /(from|import\(|fetch\(|loadAsync\()\s*['"`]https?:/, '엔진이 외부 주소에서 받아 옵니다.');
    assert.match(engine, /from '@dimforge\/rapier3d-compat'/);
    assert.match(stage, /import\('\.\/engine\/clawEngine\.js'\)/, '엔진을 미리 묶으면 첫 화면이 무거워집니다.');
    assert.doesNotMatch(stage, /^import .*clawEngine/m);
    const pokemon = /pikachu|gengar|ditto|snorlax|eevee|pinsir|koffing|meowth|피카츄|팬텀|메타몽|잠만보|이브이|쁘사이저|또가스|나옹/;
    assert.doesNotMatch(catalog, pokemon);
    assert.ok(assets.every((file) => !pokemon.test(file)), '포켓몬 모델이 공개 폴더에 있습니다.');
    assert.equal(assets.filter((file) => file.endsWith('.glb')).length, 8);
    // 코인을 넣은 판에서 떨어진 인형만 상품이 된다.
    assert.match(engine, /if \(roundActive\) \{\s*roundWins\.push/);
});

test('교사 놀이터에서 관리자만 시험한다 — 학생에게는 어떤 설정으로도 안 보인다', async () => {
    // 관리자 화면 탭은 놀이터 메뉴로 옮기며 뺐다(2026-10-01) — 들어가는 곳을 하나로.
    const dashboard = await readFile('src/components/admin/AdminDashboard.jsx', 'utf8');
    assert.doesNotMatch(dashboard, /ClawTestBench|claw-test/);
    // 놀이터에는 관리자만 — adminOnly 모듈은 학생 활성 목록에 어떤 설정으로도 안 들어간다.
    const [registry, cards, manifest] = await Promise.all([
        readFile('src/modules/registry.js', 'utf8'),
        readFile('src/modules/game/teacher/RegisteredGameModuleCards.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/manifest.js', 'utf8')
    ]);
    assert.match(manifest, /adminOnly: true/);
    assert.match(manifest, /audience: 'teacher'/);
    assert.match(registry, /if \(m\.adminOnly\) return false;/);
    assert.match(cards, /!module\.adminOnly \|\| isAdmin/);
    const { getEnabledModules } = await import('../src/modules/registry.js').catch(() => ({}));
    if (getEnabledModules) {
        for (const audience of ['student', 'teacher']) {
            assert.ok(!getEnabledModules(['__configured__', 'spelling-claw'], audience).some((m) => m.id === 'spelling-claw'));
        }
    }
});

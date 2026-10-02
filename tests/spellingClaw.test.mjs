import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
    CLAW_DEFAULT_PRIZE_SETTINGS, CLAW_PRIZE_LIMITS, describeClawOdds, eligibleClawDecor, normalizeClawPrizeSettings, rollClawPrize
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
        const prize = rollClawPrize({ settings: { gifts: [] }, eligibleDecor: eligible, random });
        if (prize.kind === 'decor') assert.ok(eligible.includes(prize.item));
        assert.notEqual(prize.kind, 'gift', '선물이 없는데 선물이 나왔습니다.');
    }
});

test('꽝이 없고, 공개하는 확률의 합이 100%이며 줄 수 없는 몫은 포인트로 간다', () => {
    const random = seeded(11);
    for (let i = 0; i < 2000; i += 1) {
        const prize = rollClawPrize({ settings: { gifts: [] }, random });
        assert.equal(prize.kind, 'points');
        assert.ok(CLAW_DEFAULT_PRIZE_SETTINGS.points.some((row) => row.points === prize.points));
    }
    for (const odds of [
        describeClawOdds({ decorTiers: ['starter', 'common', 'rare', 'hero'] }),
        describeClawOdds({ settings: { gifts: [] }, decorTiers: [] })
    ]) {
        const total = [...odds.points, ...odds.gifts, ...odds.decor].reduce((sum, row) => sum + row.percent, 0);
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

test('수호룡이 문제를 내고, 수호룡이 자라면 함께 자라며, 처음 안내와 도움말에 상품 확률을 알린다', async () => {
    const [bench, quizDragon, intro, guides, manifest] = await Promise.all([
        readFile('src/modules/game/spelling-claw/ClawTestBench.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/QuizDragon.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/ClawIntroDialog.jsx', 'utf8'),
        readFile('src/constants/teacherGuides.js', 'utf8'),
        readFile('src/modules/game/spelling-claw/manifest.js', 'utf8')
    ]);
    assert.match(manifest, /name: '수호룡의 인형뽑기'/);
    // 학생이 키운 수호룡(종류·작가 단계)을 수호룡 모듈 한 곳의 그림 규칙으로 그린다.
    assert.match(quizDragon, /getDragonStage\(writerLevel, speciesId\)/);
    // 2026-10-02: 교사가 수호룡을 고르지 않는다 — 대상 학생이 지금 키우는 수호룡(학생 아지트 화면과 같은 RPC)이 문제를 낸다.
    assert.match(bench, /<QuizDragon speciesId=\{student\.speciesId\} writerLevel=\{student\.writerLevel\}/);
    assert.match(bench, /rpc\('get_teacher_dragon_growth_dashboard', \{ p_class_id: classId \}\)/);
    assert.doesNotMatch(bench, /DRAGON_SPECIES/, '교사가 수호룡 종류를 고르는 칸이 남아 있습니다.');
    // 문제가 위, 목표를 달성하면(코인이 있거나 한 판 중) 아래에 뽑기 창이 열린다. 확률·기록 칸은 화면에 두지 않는다.
    assert.match(bench, /const clawOpen = coins > 0 \|\| roundActive;/);
    assert.ok(bench.indexOf('claw-bench__quiz') < bench.indexOf('claw-bench__claw'), '문제가 뽑기 창보다 위에 있어야 합니다.');
    assert.doesNotMatch(bench, /상품 확률<\/b>|claw-preview__log/);
    // 처음 들어오면 한 번, 그리고 다시 보기로 언제든 — 포인트부터 수호룡 상점 아이템까지 무작위·확률 공개.
    assert.match(bench, /useState\(\(\) => !readIntroSeen\(\)\)/);
    assert.match(bench, /처음 안내 다시 보기/);
    assert.match(intro, /포인트<\/b>부터 <b>선생님 선물<\/b>, <b>수호룡 상점 아이템<\/b>까지/);
    assert.match(intro, /상품이 나올 확률 보기/);
    assert.match(guides, /'spelling-claw': \{/);
    assert.match(guides, /수호룡 상점 아이템 5%/);
    // 교사 관리·학생 화면 두 탭 — 상품 설정은 교사 관리 탭에 펼친 채로(단추 뒤에 숨기지 않는다).
    assert.match(guides, /`🛠️ 교사 관리` 탭의 상품 설정/);
    assert.match(bench, /role="tablist"/);
    assert.match(bench, /id="claw-bench-panel-manage"[\s\S]*<ClawPrizeSettings[\s\S]*id="claw-bench-panel-student"/);
    assert.doesNotMatch(bench, /prizeEditing/);
    // 학생 화면 탭 안에는 학생에게 보이는 것만 — 대상 학생·화질·시험용 코인은 탭 줄(위)에 둔다.
    const studentPanel = bench.slice(bench.indexOf('id="claw-bench-panel-student"'));
    assert.doesNotMatch(studentPanel, /대상 학생|코인 \+1 \(시험용\)|하루 새로 시작|setQuality/);
    assert.match(bench.slice(0, bench.indexOf('id="claw-bench-panel-manage"')), /claw-bench__preview-tools[\s\S]*코인 \+1 \(시험용\)/);
});

test('교사가 바꾼 상품 설정도 꽝이 없고, 화면의 확률과 실제 추첨이 같다', () => {
    // 이상한 값이 와도 범위 안으로 고친다.
    const safe = normalizeClawPrizeSettings({
        kinds: { points: -5, gift: '30', decor: 99999 },
        points: [{ points: 500, weight: 3 }, { points: 0, weight: 9 }, { points: '20', weight: 1.7 }],
        gifts: [{ name: '  ', weight: 5 }, { name: '숙제 면제권'.repeat(10), weight: 2 }],
        decorRarities: { hero: -1 }
    });
    assert.deepEqual(safe.kinds, { points: 0, gift: 30, decor: CLAW_PRIZE_LIMITS.weightMax });
    assert.deepEqual(safe.points.map((row) => [row.points, row.weight]), [[CLAW_PRIZE_LIMITS.pointMax, 3], [20, 1]]);
    assert.equal(safe.gifts.length, 1, '이름 없는 선물이 남았습니다.');
    assert.equal(safe.gifts[0].name.length, CLAW_PRIZE_LIMITS.giftName);
    assert.equal(safe.decorRarities.hero, 0);
    assert.equal(safe.decorRarities.starter, CLAW_DEFAULT_PRIZE_SETTINGS.decorRarities.starter, '빠진 칸은 기본값이어야 합니다.');
    // 포인트 표가 모두 0이면 기본 포인트 표 — 꽝 없음의 마지막 자리.
    assert.deepEqual(normalizeClawPrizeSettings({ points: [{ points: 10, weight: 0 }] }).points, CLAW_DEFAULT_PRIZE_SETTINGS.points);

    // 모든 종류를 0으로 두어도 포인트가 나온다.
    const allOff = { kinds: { points: 0, gift: 0, decor: 0 } };
    assert.equal(rollClawPrize({ settings: allOff, random: seeded(3) }).kind, 'points');
    assert.equal(describeClawOdds({ settings: allOff }).points.reduce((sum, row) => sum + row.percent, 0), 100);

    // 교사 설정(선물 비중 2:1, 포인트 0, 아이템 영웅만)에서 화면의 확률과 실제 추첨 비율이 맞는다.
    const settings = {
        kinds: { points: 0, gift: 50, decor: 50 },
        gifts: [{ id: 'a', name: '자리 고르기권', weight: 2 }, { id: 'b', name: '급식 먼저 먹기권', weight: 1 }],
        decorRarities: { starter: 0, common: 0, rare: 0, hero: 1 }
    };
    const eligible = eligibleClawDecor(CATALOG, { writerLevel: 10, readerLevel: 7 });
    const odds = describeClawOdds({ settings, decorTiers: ['starter', 'common', 'rare', 'hero'] });
    assert.deepEqual(odds.gifts.map((row) => [row.id, row.percent]), [['a', 33.3], ['b', 16.7]]);
    assert.deepEqual(odds.decor.map((row) => [row.id, row.percent]), [['hero', 50]]);
    assert.deepEqual(odds.points, []);
    const counts = {};
    const random = seeded(19);
    const rolls = 20000;
    for (let i = 0; i < rolls; i += 1) {
        const prize = rollClawPrize({ settings, eligibleDecor: eligible, random });
        const key = prize.kind === 'gift' ? prize.gift.id : prize.kind === 'decor' ? prize.item.rarity : 'points';
        counts[key] = (counts[key] || 0) + 1;
    }
    assert.equal(counts.points, undefined, '포인트 비중 0인데 포인트가 나왔습니다.');
    for (const [key, percent] of [['a', 33.3], ['b', 16.7], ['hero', 50]]) {
        assert.ok(Math.abs(counts[key] / rolls * 100 - percent) < 1.5, `${key}: 화면 ${percent}% · 실제 ${counts[key] / rolls * 100}%`);
    }
    // 아이템 영웅 등급만 켰는데 받을 영웅 아이템이 없으면 그 몫은 다른 상품으로 간다.
    const lowLevel = describeClawOdds({ settings, decorTiers: ['starter'] });
    assert.deepEqual(lowLevel.decor, []);
    assert.equal(lowLevel.gift, 100);
});

test('인형 모델은 브라우저가 묶어 두어 반 전체가 열어도 서버에서 다시 받지 않는다', async () => {
    const caddy = await readFile('Caddyfile.container', 'utf8');
    assert.match(caddy, /@clawModels \{\s*path \/assets\/claw\/\*\s*file\s*\}/);
    assert.match(caddy, /header @clawModels Cache-Control "public, max-age=2592000"/);
});

test('하루 기회를 다 쓰고 최소 포인트를 받으면 학생 홈 알림 계약이 있다', async () => {
    const { spellingClawManifest } = await import('../src/modules/game/spelling-claw/manifest.js');
    const notice = spellingClawManifest.notifications.find((item) => item.eventType === 'spelling-claw.consolation_awarded');
    assert.ok(notice, '최소 포인트 알림 정의가 없습니다.');
    assert.equal(notice.message({ points: 20, plays: 3 }), '오늘 인형뽑기 기회 3번을 다 썼어요. 맞춤법 문제를 푼 상으로 20P를 받았어요.');
    const readme = await readFile('src/modules/game/spelling-claw/README.md', 'utf8');
    assert.match(readme, /같은 트랜잭션에서 `notification_emit_v1`/);
});

test('종류별 몫은 줄마다 반올림한 값을 더하지 않고 바로 낸다(85.1% 같은 어긋남 없음)', () => {
    const odds = describeClawOdds({ decorTiers: ['starter', 'common'] });
    assert.deepEqual(odds.kinds, { points: 85, gift: 10, decor: 5 });
    assert.deepEqual(describeClawOdds({ settings: { gifts: [] } }).kinds, { points: 100, gift: 0, decor: 0 });
});

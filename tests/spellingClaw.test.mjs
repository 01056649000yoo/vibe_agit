import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import {
    CLAW_DEFAULT_PRIZE_SETTINGS, CLAW_PRIZE_LIMITS, describeClawOdds, eligibleClawDecor, normalizeClawPrizeSettings, rollClawPrize,
    sumClawPrizeSettings
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

test('교사가 넣은 확률(%)도 꽝이 없고, 화면의 확률과 실제 추첨이 같다', () => {
    // 이상한 값이 와도 범위 안으로 고친다(0~100%, 0.1% 단위).
    const safe = normalizeClawPrizeSettings({
        points: [{ points: 500, percent: 3 }, { points: 0, percent: 9 }, { points: '20', percent: 1.77 }],
        gifts: [{ name: '  ', percent: 5 }, { name: '숙제 면제권'.repeat(10), percent: 250 }],
        decor: { hero: -1 }
    });
    assert.deepEqual(safe.points.map((row) => [row.points, row.percent]), [[CLAW_PRIZE_LIMITS.pointMax, 3], [20, 1.8]]);
    assert.equal(safe.gifts.length, 1, '이름 없는 선물이 남았습니다.');
    assert.equal(safe.gifts[0].name.length, CLAW_PRIZE_LIMITS.giftName);
    assert.equal(safe.gifts[0].percent, 100);
    assert.equal(safe.decor.hero, 0);
    assert.equal(safe.decor.starter, CLAW_DEFAULT_PRIZE_SETTINGS.decor.starter, '빠진 칸은 기본값이어야 합니다.');

    // 기본값은 합 100%, 선물은 5%(선생님 요청 — 너무 잦지 않게).
    assert.deepEqual(sumClawPrizeSettings(CLAW_DEFAULT_PRIZE_SETTINGS), { total: 100, kinds: { points: 90, gift: 5, decor: 5 } });

    // 모든 확률을 0으로 두어도 포인트가 나온다(기본 포인트 표로).
    const allOff = { points: [{ id: 'x', points: 10, percent: 0 }], gifts: [], decor: { starter: 0, common: 0, rare: 0, hero: 0 } };
    assert.equal(rollClawPrize({ settings: allOff, random: seeded(3) }).kind, 'points');
    assert.equal(describeClawOdds({ settings: allOff }).kinds.points, 100);

    // 교사 설정(선물 20%·10%, 포인트 0, 아이템 영웅 70%)에서 화면의 확률과 실제 추첨 비율이 맞는다.
    const settings = {
        points: [{ id: 'p', points: 10, percent: 0 }],
        gifts: [{ id: 'a', name: '자리 고르기권', percent: 20 }, { id: 'b', name: '급식 먼저 먹기권', percent: 10 }],
        decor: { starter: 0, common: 0, rare: 0, hero: 70 }
    };
    const eligible = eligibleClawDecor(CATALOG, { writerLevel: 10, readerLevel: 7 });
    const odds = describeClawOdds({ settings, decorTiers: ['starter', 'common', 'rare', 'hero'] });
    assert.deepEqual(odds.gifts.map((row) => [row.id, row.percent]), [['a', 20], ['b', 10]]);
    assert.deepEqual(odds.decor.map((row) => [row.id, row.percent]), [['hero', 70]]);
    assert.deepEqual(odds.points, []);
    const counts = {};
    const random = seeded(19);
    const rolls = 20000;
    for (let i = 0; i < rolls; i += 1) {
        const prize = rollClawPrize({ settings, eligibleDecor: eligible, random });
        const key = prize.kind === 'gift' ? prize.gift.id : prize.kind === 'decor' ? prize.item.rarity : 'points';
        counts[key] = (counts[key] || 0) + 1;
    }
    assert.equal(counts.points, undefined, '포인트 0%인데 포인트가 나왔습니다.');
    for (const [key, percent] of [['a', 20], ['b', 10], ['hero', 70]]) {
        assert.ok(Math.abs(counts[key] / rolls * 100 - percent) < 1.5, `${key}: 화면 ${percent}% · 실제 ${counts[key] / rolls * 100}%`);
    }
    // 그 학생이 받을 영웅 아이템이 없으면 영웅 몫(70%)은 포인트로 가고, 선생님 선물 확률은 그대로다.
    const lowLevel = describeClawOdds({ settings, decorTiers: ['starter'] });
    assert.deepEqual(lowLevel.decor, []);
    assert.deepEqual(lowLevel.kinds, { points: 70, gift: 30, decor: 0 });
    assert.deepEqual(lowLevel.gifts.map((row) => row.percent), [20, 10]);
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

test('종류별 몫은 줄마다 반올림한 값을 더하지 않고 바로 낸다 — 기본값은 이 학생 조건에서 그대로 공개된다', () => {
    const odds = describeClawOdds({ decorTiers: ['starter', 'common', 'rare', 'hero'] });
    assert.deepEqual(odds.kinds, { points: 90, gift: 5, decor: 5 });
    assert.deepEqual(odds.points.map((row) => row.percent), [36, 27, 14, 9, 4]);
    // 입문 등급만 받을 수 있는 학생: 나머지 등급 몫(2%)은 포인트로, 선물 5%는 그대로.
    assert.deepEqual(describeClawOdds({ decorTiers: ['starter'] }).kinds, { points: 92, gift: 5, decor: 3 });
    assert.deepEqual(describeClawOdds({ settings: { gifts: [] } }).kinds, { points: 100, gift: 0, decor: 0 });
});

test('상품 설정 판은 비중이 아니라 확률(%)을 받고, 합계 100%를 늘 보여 준다', async () => {
    const panel = await readFile('src/modules/game/spelling-claw/ClawPrizeSettings.jsx', 'utf8');
    assert.match(panel, /합계 \{total\}%/);
    assert.match(panel, /100%로 맞추기/);
    assert.match(panel, /sumClawPrizeSettings\(draft\)/);
    assert.doesNotMatch(panel, /비중|weight/, '비중 입력이 남아 있습니다 — 선생님은 확률(%)을 넣습니다.');
});

test('묶음 전체 %를 바꾸면 안의 상품이 원래 비율대로 바뀌고 합이 정확히 맞는다', async () => {
    const { scaleClawGroup } = await import('../src/modules/game/spelling-claw/prizeTable.js');
    // 선생님 선물 5%(3:2) → 1%: 0.6·0.4
    assert.deepEqual(scaleClawGroup([3, 2], 1), [0.6, 0.4]);
    // 아이템 5%(3·1.5·0.4·0.1) → 2%: 끝수까지 합이 2.0
    const decor = scaleClawGroup([3, 1.5, 0.4, 0.1], 2);
    assert.equal(Math.round(decor.reduce((a, b) => a + b, 0) * 10) / 10, 2);
    assert.ok(decor.every((value) => value >= 0));
    // 모두 0이면 똑같이 나눈다, 범위 밖은 0~100 으로
    assert.deepEqual(scaleClawGroup([0, 0], 3), [1.5, 1.5]);
    assert.deepEqual(scaleClawGroup([1, 1], 250), [50, 50]);
    assert.deepEqual(scaleClawGroup([4, 6], 0), [0, 0]);
    const panel = await readFile('src/modules/game/spelling-claw/ClawPrizeSettings.jsx', 'utf8');
    assert.match(panel, /<GroupInput label=\{kindLabel\('gift'\)\}/);
});

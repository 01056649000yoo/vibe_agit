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

test('학급별 켜기로 학생에게 연다 — 기본 꺼짐, 켜야만 학생 놀이터에 보인다', async () => {
    const { spellingClawManifest } = await import('../src/modules/game/spelling-claw/manifest.js');
    assert.equal(spellingClawManifest.adminOnly, undefined, '관리자 전용 표시가 남아 있습니다.');
    assert.equal(spellingClawManifest.audience, 'both');
    assert.equal(spellingClawManifest.defaultEnabled, false);
    assert.equal(typeof spellingClawManifest.studentEntry, 'function');
    assert.equal(spellingClawManifest.performance.realtime, 'none');
    // 학생 목록은 enabled_modules 로만 거른다(getEnabledModules) — 관리자 시험 표시가 없으니 켜면 보이고, 기본은 꺼짐.
    const cards = await readFile('src/modules/game/teacher/RegisteredGameModuleCards.jsx', 'utf8');
    assert.match(cards, /<FeatureAvailabilitySwitch/);
    // 관리자 화면 탭은 놀이터 메뉴로 옮기며 뺐다(2026-10-01) — 들어가는 곳을 하나로.
    const dashboard = await readFile('src/components/admin/AdminDashboard.jsx', 'utf8');
    assert.doesNotMatch(dashboard, /ClawTestBench|claw-test/);
});

test('학생 화면은 정답·상품을 스스로 정하지 않는다 — 서버가 문제를 내고 채점하고 상품을 뽑는다', async () => {
    const [screen, entry, server, edge, migration] = await Promise.all([
        readFile('src/modules/game/spelling-claw/ClawPlayScreen.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/StudentEntry.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/clawServerSession.js', 'utf8'),
        readFile('supabase/functions/spelling-claw/index.ts', 'utf8'),
        readFile('supabase/migrations/20261363_spelling_claw_server.sql', 'utf8')
    ]);
    assert.doesNotMatch(screen, /rollClawPrize|gradeSpellingAnswer|createSpellingQuiz/, '화면이 상품·채점을 직접 합니다.');
    assert.match(entry, /createServerClawSession/);
    assert.match(server, /functions\.invoke\('spelling-claw'/);
    assert.match(server, /rpc\('start_my_spelling_claw_play_v1'\)/);
    // Edge 함수는 자기 폴더 파일만 부른다(폴더째 배포된다).
    for (const [, from] of edge.matchAll(/from '([^']+)'/g)) {
        assert.ok(from.startsWith('./') || from.startsWith('jsr:'), `Edge 함수가 폴더 밖을 부릅니다: ${from}`);
    }
    // 학생에게는 정답 없는 문제만 보낸다.
    assert.match(edge, /questions: quiz\.map\(publicQuizQuestion\)/);
    const { publicQuizQuestion } = await import('../supabase/functions/spelling-claw/spellingQuizBuilder.js');
    const shown = publicQuizQuestion({ id: 'x', answer: '정답', accepted: ['정답'], solution: '풀이', explanation: '설명', prompt: '문제' });
    assert.ok(!('answer' in shown) && !('accepted' in shown) && !('solution' in shown));
    // 서버 전용 함수는 service_role 만, 지급은 포인트 엔진·같은 트랜잭션 알림으로.
    for (const name of ['spelling_claw_issue_quiz_v1', 'spelling_claw_answer_v1', 'spelling_claw_finish_play_v1']) {
        assert.match(migration, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
        assert.match(migration, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${name}\\([^)]*\\) TO service_role;`));
    }
    assert.match(migration, /point_engine_apply\(\s*p_student_id, v_points,[\s\S]*?'spelling_claw'/);
    assert.match(migration, /'spelling-claw\.prize_awarded'/);
    assert.match(migration, /'spelling-claw\.class_gift_won'/);
    assert.match(migration, /'spelling-claw\.consolation_awarded'/);
    // 수호룡 아이템은 지급 직전에 상점 구매와 같은 조건을 다시 본다.
    assert.match(migration, /v_item\.acquisition_type <> 'shop' OR v_item\.is_default[\s\S]*?rarity IS NOT DISTINCT FROM 'legendary'[\s\S]*?required_writer_level > COALESCE\(p_writer_level, 1\)/);
});

test('교사 설정은 저장 단추로 저장하고, 뽑기 내역은 보이는 동안만 12초마다 읽는다', async () => {
    const manager = await readFile('src/modules/game/spelling-claw/TeacherManager.jsx', 'utf8');
    assert.match(manager, /rpc\('save_teacher_spelling_claw_settings_v1'/);
    assert.match(manager, /p_expected_updated_at: saved\.updatedAt/);
    assert.match(manager, /저장 안 된 변경이 있어요/);
    assert.doesNotMatch(manager, /localStorage\.setItem\(PRIZE/, '상품 설정을 브라우저에 자동 저장합니다.');
    assert.match(manager, /HISTORY_POLL_MS = 12000/);
    assert.match(manager, /document\.visibilityState !== 'visible'/);
    assert.match(manager, /if \(!classId \|\| tab !== 'history'\) return undefined;/);
    assert.doesNotMatch(manager, /setInterval/);
});

test('미리보기 세션도 서버와 같은 규칙: 목표를 넘으면 코인 1개·하루 기회까지·한 판 상품 2개·못 뽑으면 최소 포인트', async () => {
    const { createLocalClawSession } = await import('../src/modules/game/spelling-claw/clawSession.js');
    const pool = Array.from({ length: 30 }, (_, n) => ({
        id: `q${n}`, entryKey: `e${n}`, kind: n % 3 ? 'choice' : 'write', type: 'choose', prompt: '문제', answer: '정답',
        choices: ['정답', '오답'], strictSpacing: true
    }));
    const session = createLocalClawSession({
        student: { name: '견본', writerLevel: 1, readerLevel: 1, owned: [] },
        classSettings: { passCount: 7, dailyPlays: 1, minPoints: 30 },
        prizeSettings: { points: [{ id: 'p', points: 10, percent: 100 }], gifts: [], decor: { starter: 0, common: 0, rare: 0, hero: 0 } },
        catalog: [], quizPool: pool
    });
    const solve = async (rightCount) => {
        const { attemptId, questions } = await session.startQuiz();
        let last = null;
        for (let index = 0; index < questions.length; index += 1) {
            last = await session.answer(attemptId, index, index < rightCount ? '정답' : '틀림');
        }
        return last;
    };
    assert.equal((await solve(6)).coinGranted, false);
    assert.equal((await solve(7)).coinGranted, true);
    assert.equal((await solve(10)).coinGranted, false, '하루 기회(1번)를 넘겨 코인을 줬습니다.');
    const { playId } = await session.startPlay();
    const done = await session.finishPlay(playId, []);
    assert.equal(done.consolationPoints, 30);
    // 한 판에 셋을 잡아도 상품은 둘까지.
    session.addCoin();
    const second = await session.startPlay();
    const many = await session.finishPlay(second.playId, ['shiba', 'cat', 'panda']);
    assert.equal(many.prizes.length, 2);
});

test('수호룡이 문제를 내고, 수호룡이 자라면 함께 자라며, 처음 안내와 도움말에 상품 확률을 알린다', async () => {
    const [screen, manager, quizDragon, intro, guides, manifest] = await Promise.all([
        readFile('src/modules/game/spelling-claw/ClawPlayScreen.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/TeacherManager.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/QuizDragon.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/ClawIntroDialog.jsx', 'utf8'),
        readFile('src/constants/teacherGuides.js', 'utf8'),
        readFile('src/modules/game/spelling-claw/manifest.js', 'utf8')
    ]);
    assert.match(manifest, /name: '수호룡의 인형뽑기'/);
    // 학생이 키운 수호룡(종류·작가 단계)을 수호룡 모듈 한 곳의 그림 규칙으로 그린다.
    assert.match(quizDragon, /getDragonStage\(writerLevel, speciesId\)/);
    assert.match(screen, /<QuizDragon speciesId=\{student\.speciesId\} writerLevel=\{student\.writerLevel\}/);
    // 교사 미리보기는 대상 학생이 지금 키우는 수호룡(학생 아지트 화면과 같은 RPC)으로.
    assert.match(manager, /rpc\('get_teacher_dragon_growth_dashboard', \{ p_class_id: classId \}\)/);
    assert.doesNotMatch(manager, /DRAGON_SPECIES/, '교사가 수호룡 종류를 고르는 칸이 남아 있습니다.');
    // 문제가 위, 목표를 달성하면(코인이 있거나 한 판 중) 아래에 뽑기 창이 열린다.
    assert.match(screen, /const clawOpen = coins > 0 \|\| roundActive/);
    assert.ok(screen.indexOf('claw-bench__quiz') < screen.indexOf('claw-bench__claw'), '문제가 뽑기 창보다 위에 있어야 합니다.');
    // 처음 들어오면 한 번, 그리고 다시 보기로 언제든 — 포인트부터 수호룡 상점 아이템까지 무작위·확률 공개.
    assert.match(screen, /useState\(\(\) => !readIntroSeen\(\)\)/);
    assert.match(screen, /처음 안내 다시 보기/);
    assert.match(intro, /포인트<\/b>부터 <b>선생님 선물<\/b>, <b>수호룡 상점 아이템<\/b>까지/);
    assert.match(intro, /상품이 나올 확률 보기/);
    assert.match(guides, /'spelling-claw': \{/);
    assert.match(guides, /수호룡 상점 아이템 5%/);
    // 교사 관리 탭에 상품 설정을 펼친 채로, 미리보기 도구는 탭 줄(학생 화면 밖)에.
    assert.match(manager, /role="tablist"/);
    assert.match(manager, /id="claw-bench-panel-manage"[\s\S]*<ClawPrizeSettings[\s\S]*id="claw-bench-panel-preview"/);
    assert.doesNotMatch(screen, /대상 학생|코인 \+1|하루 새로 시작|setQuality/);
    assert.match(manager.slice(0, manager.indexOf('id="claw-bench-panel-manage"')), /claw-bench__preview-tools[\s\S]*코인 \+1 \(미리보기\)/);
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

    // 기본값은 합 100%: 포인트 94 · 아이템 5 · 선물 1(2026-10-02 선생님 결정 — 선물은 드물게).
    assert.deepEqual(sumClawPrizeSettings(CLAW_DEFAULT_PRIZE_SETTINGS), { total: 100, kinds: { points: 94, gift: 1, decor: 5 } });

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
    assert.deepEqual(odds.kinds, { points: 94, gift: 1, decor: 5 });
    assert.deepEqual(odds.points.map((row) => row.percent), [37.6, 28.2, 14.6, 9.4, 4.2]);
    // 입문 등급만 받을 수 있는 학생: 나머지 등급 몫(2%)은 포인트로, 선물 1%는 그대로.
    assert.deepEqual(describeClawOdds({ decorTiers: ['starter'] }).kinds, { points: 96, gift: 1, decor: 3 });
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

test('큰 상품(선물·수호룡 아이템)만 화면 가득 축하하고, 교사에게 뽑기 내역 탭이 있다', async () => {
    const [screen, manager, celebrate, readme] = await Promise.all([
        readFile('src/modules/game/spelling-claw/ClawPlayScreen.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/TeacherManager.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/ClawCelebration.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/README.md', 'utf8')
    ]);
    assert.match(screen, /prize\.kind === 'gift' \|\| prize\.kind === 'decor'\);\s*if \(big\) setCelebration/);
    assert.match(celebrate, /setTimeout\(onClose, 4500\)/);
    assert.match(await readFile('src/modules/game/spelling-claw/clawCelebration.css', 'utf8'), /prefers-reduced-motion: reduce/);
    assert.match(manager, /\{ id: 'history', icon: '📜', label: '뽑기 내역' \}/);
    assert.match(readme, /탭이 보이는 동안만 12초마다/);
});

test('상품 알림: 뽑은 본인과, 선생님 선물이면 반 전체에게 간다', async () => {
    const { spellingClawManifest } = await import('../src/modules/game/spelling-claw/manifest.js');
    const byType = new Map(spellingClawManifest.notifications.map((item) => [item.eventType, item]));
    const own = byType.get('spelling-claw.prize_awarded');
    assert.equal(own.message({ kind: 'points', points: 30, plush_name: '시바견' }), '시바견 인형을 뽑아 30P를 받았어요.');
    assert.match(own.message({ kind: 'gift', gift_name: '자리 고르기권' }), /선생님 선물 ‘자리 고르기권’에 당첨/);
    const classWide = byType.get('spelling-claw.class_gift_won');
    assert.equal(classWide.message({ winner_name: '김하늘', gift_name: '자리 고르기권' }), '김하늘이 수호룡의 인형뽑기에서 ‘자리 고르기권’에 당첨됐어요! 축하해 주세요.');
    assert.match(classWide.message({ winner_name: '이서아', gift_name: '급식 먼저 먹기권' }), /^이서아가 /);
    const readme = await readFile('src/modules/game/spelling-claw/README.md', 'utf8');
    assert.match(readme, /같은 반 다른 학생마다 한 건/);
});

test('집으로 돌아온 집게는 흔들림을 빨리 가라앉힌다(기다릴 때만 감쇠를 높인다)', async () => {
    const engine = await readFile('src/modules/game/spelling-claw/engine/clawEngine.js', 'utf8');
    assert.match(engine, /hubBody\.setLinearDamping\(calm \? 4 : 0\.4\)/);
    assert.match(engine, /roundActive = true;\s*setClawCalm\(false\);/);
    assert.match(engine, /claw\.mode = 'ready'; claw\.weak = false; setClawCalm\(true\);/);
});

test('선생님 선물 줬어요: 교사가 표시하면 학생에게 알리고, 아직 안 준 선물은 따로 모은다(OI-024)', async () => {
    const [migration, manager, screen] = await Promise.all([
        readFile('supabase/migrations/20261364_spelling_claw_gift_handover.sql', 'utf8'),
        readFile('src/modules/game/spelling-claw/TeacherManager.jsx', 'utf8'),
        readFile('src/modules/game/spelling-claw/ClawPlayScreen.jsx', 'utf8')
    ]);
    assert.match(migration, /PERFORM public\.spelling_claw_assert_teacher_v1\(p_class_id\)/);
    assert.match(migration, /'spelling-claw\.gift_given'/);
    assert.match(migration, /'pending_gifts', v_pending/);
    assert.match(manager, /rpc\('set_teacher_spelling_claw_gift_given_v1'/);
    assert.match(manager, /아직 안 준 선생님 선물/);
    assert.match(screen, /선생님이 줬어요/);
    const { spellingClawManifest } = await import('../src/modules/game/spelling-claw/manifest.js');
    const given = spellingClawManifest.notifications.find((item) => item.eventType === 'spelling-claw.gift_given');
    assert.match(given.message({ gift_name: '자리 고르기권' }), /‘자리 고르기권’을 선생님이 챙겨 주셨어요/);
});

test('인형 도감은 8종을 늘 보여 주고, 그림은 엔진 없이도 보이는 파일이다', async () => {
    const [{ CLAW_PLUSHES }, thumbs, screen] = await Promise.all([
        import('../supabase/functions/spelling-claw/plushCatalog.js'),
        readdir('public/assets/claw/thumbs'),
        readFile('src/modules/game/spelling-claw/ClawPlayScreen.jsx', 'utf8')
    ]);
    for (const plush of CLAW_PLUSHES) {
        assert.equal(plush.thumb, `/assets/claw/thumbs/${plush.id}.png`);
        assert.ok(thumbs.includes(`${plush.id}.png`), `${plush.id} 도감 그림이 없습니다.`);
    }
    assert.match(screen, /className="claw-bench__dex"[\s\S]*CLAW_PLUSHES\.map/);
    assert.match(screen, /is-caught' : 'is-missing'/);
});

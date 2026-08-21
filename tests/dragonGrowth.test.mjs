import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    DRAGON_SPECIES,
    HIDEOUT_BACKGROUNDS,
    canReselectDragonSpecies,
    getDragonGrowthFromWriterLevel,
    getPendingDragonGrowth,
    getDragonStage,
    getReaderDragonEffect,
    getReaderSceneTheme,
    shouldOpenDragonSpeciesReselectionAfterGrowth
} from '../src/modules/game/dragon/presentation.js';
import { getReaderLevel, getWriterLevel } from '../src/constants/writerLevels.js';
import {
    DEFAULT_EQUIPPED_DECOR,
    DRAGON_DECOR_ITEMS,
    DRAGON_DECOR_SLOTS,
    getDragonDecorItemsForSlot,
    normalizeDragonDecor
} from '../src/modules/game/dragon/decorCatalog.js';

test('작가 칭호 10단계를 드래곤 10단계로 그대로 연결한다', () => {
    for (let level = 1; level <= 10; level += 1) {
        const growth = getDragonGrowthFromWriterLevel({ level, next: level < 10 ? 100 : null });
        assert.equal(growth.level, level);
        assert.equal(getDragonStage(growth.level).level, level);
    }
});

test('테스트 칭호 오버라이드는 실제 글 통계를 바꾸지 않고 지정 단계만 표시한다', () => {
    const overridden = getWriterLevel(0, 0, 8);
    assert.equal(overridden.level, 8);
    assert.equal(overridden.isTestOverride, true);
    assert.equal(getDragonGrowthFromWriterLevel(overridden).level, 8);
    assert.equal(getWriterLevel(0, 0, 999).level, 1);

    const reader = getReaderLevel(0, 6);
    assert.equal(reader.level, 6);
    assert.equal(reader.name, '열혈 독자');
    assert.equal(reader.isTestOverride, true);
    assert.equal(getReaderLevel(0, 999).level, 1);
});

test('실제 성장과 테스트 성장은 서로 다른 확인 기록을 사용한다', () => {
    const pet = {
        species: 'star',
        lastCelebratedWriterLevel: 4,
        lastCelebratedTestWriterLevel: 7
    };
    assert.deepEqual(getPendingDragonGrowth({ level: 6 }, pet), {
        fromLevel: 4,
        toLevel: 6,
        isTestOverride: false
    });
    assert.deepEqual(getPendingDragonGrowth({ level: 9, isTestOverride: true }, pet), {
        fromLevel: 7,
        toLevel: 9,
        isTestOverride: true
    });
    assert.equal(getPendingDragonGrowth({ level: 4 }, pet), null);
    assert.equal(getPendingDragonGrowth({ level: 10 }, { species: null }), null);
});

test('4종 드래곤이 작가 10단계마다 서로 다른 개별 이미지를 쓴다', () => {
    assert.equal(DRAGON_SPECIES.length, 4);
    for (const species of DRAGON_SPECIES) {
        const images = new Set();
        for (let level = 1; level <= 10; level += 1) {
            const dragon = getDragonStage(level, species.id);
            assert.equal(dragon.speciesId, species.id);
            assert.equal(dragon.image, `/assets/dragons/v2/${species.id}/level-${level}.webp`);
            images.add(dragon.image);
        }
        assert.equal(images.size, 10);
    }
});

test('독자 칭호 7단계를 독립적인 드래곤 효과로 제한한다', () => {
    assert.equal(getReaderDragonEffect(0).level, 1);
    assert.equal(getReaderDragonEffect({ level: 5 }).name, '별무리 서가');
    assert.equal(getReaderDragonEffect(999).level, 7);
});

test('모든 아지트 프레임이 예전 화면용 독자 효과 대비 계약도 유지한다', () => {
    const allowedTones = new Set(['light', 'dark', 'vivid']);
    Object.values(HIDEOUT_BACKGROUNDS).forEach((background) => {
        assert.equal(allowedTones.has(background.readerTone), true);
    });
    assert.notDeepEqual(getReaderSceneTheme('storm'), getReaderSceneTheme('default'));
    assert.deepEqual(getReaderSceneTheme('missing-background'), getReaderSceneTheme('default'));
});

test('작가 3단계부터 종류를 한 번만 다시 고를 수 있다', () => {
    assert.equal(canReselectDragonSpecies({ species: 'star' }, 2), false);
    assert.equal(canReselectDragonSpecies({ species: 'star' }, 3), true);
    assert.equal(canReselectDragonSpecies({ species: 'star', speciesReselectedAt: 'done' }, 10), false);
    assert.equal(canReselectDragonSpecies({}, 10), false);
});

test('교사 단계 미리보기는 공용 4종·10단계·7효과를 조합하고 학생 기록을 쓰지 않는다', async () => {
    const [managerSource, previewSource] = await Promise.all([
        readFile('src/modules/game/dragon/TeacherManager.jsx', 'utf8'),
        readFile('src/modules/game/dragon/TeacherStagePreview.jsx', 'utf8')
    ]);

    assert.match(managerSource, /\['preview', '단계 미리보기'\]/);
    assert.match(previewSource, /DRAGON_SPECIES\.map/);
    assert.match(previewSource, /WRITER_LEVELS\.map/);
    assert.match(previewSource, /READER_LEVELS\.map/);
    assert.match(previewSource, /getDragonStage\(writerLevel, speciesId\)/);
    assert.match(previewSource, /getReaderDragonEffect\(readerLevel\)/);
    assert.match(previewSource, /lazy\(\(\) => import\('\.\/DragonGrowthCelebrationModal'\)\)/);
    assert.doesNotMatch(previewSource, /supabase|\.rpc\(|\.from\(/);
});

test('교사 공방 미리보기는 학생 상점의 실제 5개 슬롯과 가격을 읽기 전용으로 보여 준다', async () => {
    const [managerSource, workshopSource] = await Promise.all([
        readFile('src/modules/game/dragon/TeacherManager.jsx', 'utf8'),
        readFile('src/modules/game/dragon/TeacherWorkshopPreview.jsx', 'utf8')
    ]);

    assert.match(managerSource, /\['workshop', '공방 미리보기'\]/);
    assert.match(workshopSource, /DRAGON_DECOR_SLOTS\.map/);
    assert.match(workshopSource, /getDragonDecorItemsForSlot/);
    assert.match(workshopSource, /DRAGON_DECOR_RARITIES/);
    assert.match(workshopSource, /DragonHideoutScene/);
    assert.match(workshopSource, /Number\(item\.price/);
    assert.doesNotMatch(workshopSource, /supabase|\.rpc\(|\.from\(|buy_my_dragon_decor|equip_my_dragon_decor/);
});

test('교사 놀이터와 수호룡 현황은 핵심 정보를 먼저 보이도록 세로 공간을 압축한다', async () => {
    const [shellSource, managerSource, managerStyles] = await Promise.all([
        readFile('src/modules/game/teacher/RegisteredGameModuleCards.jsx', 'utf8'),
        readFile('src/modules/game/dragon/TeacherManager.jsx', 'utf8'),
        readFile('src/modules/game/dragon/TeacherManager.css', 'utf8')
    ]);

    assert.match(shellSource, /학생 화면 미리보기 · 필요할 때 펼치기/);
    assert.match(shellSource, /<details/);
    assert.match(shellSource, /compact/);
    assert.match(managerSource, /학기 동안 글과 함께 성장하고/);
    assert.match(managerStyles, /\.dragon-season-hero\s*\{[\s\S]*?padding:\s*15px;/);
    assert.match(managerStyles, /\.dragon-teacher-tabs\s*\{[\s\S]*?margin:\s*9px 0;/);
    assert.match(managerStyles, /\.dragon-teacher-summary\s*\{[\s\S]*?padding:\s*9px;/);
});

test('작가 3단계를 처음 넘어선 성장 확인 뒤에만 재선택 화면을 자동으로 연다', () => {
    const selectedPet = { species: 'star' };
    assert.equal(shouldOpenDragonSpeciesReselectionAfterGrowth({ fromLevel: 2, toLevel: 3 }, selectedPet), true);
    assert.equal(shouldOpenDragonSpeciesReselectionAfterGrowth({ fromLevel: 1, toLevel: 4 }, selectedPet), true);
    assert.equal(shouldOpenDragonSpeciesReselectionAfterGrowth({ fromLevel: 3, toLevel: 4 }, selectedPet), false);
    assert.equal(shouldOpenDragonSpeciesReselectionAfterGrowth(
        { fromLevel: 2, toLevel: 3 },
        { species: 'star', speciesReselectedAt: 'done' }
    ), false);
    assert.equal(shouldOpenDragonSpeciesReselectionAfterGrowth({ fromLevel: 2, toLevel: 3 }, {}), false);
    // 화면의 예상 단계보다 서버가 확정한 단계가 낮으면 자동 진입하지 않는다.
    assert.equal(shouldOpenDragonSpeciesReselectionAfterGrowth({ fromLevel: 2, toLevel: 2 }, selectedPet), false);
});

test('현재 작가 칭호 구간 안의 진행도를 0~100으로 계산한다', () => {
    assert.deepEqual(getDragonGrowthFromWriterLevel({ level: 4, progressFrom: 390, progressValue: 650, next: 910 }), {
        level: 4,
        progress: 50
    });
    assert.deepEqual(getDragonGrowthFromWriterLevel({ level: 10, progressFrom: 26000, progressValue: 40000, next: null }), {
        level: 10,
        progress: 100
    });
});

test('잘못된 단계와 진행도는 안전한 범위로 제한한다', () => {
    assert.equal(getDragonStage(0).level, 1);
    assert.equal(getDragonStage(999).level, 10);
    assert.equal(getDragonGrowthFromWriterLevel({ level: 3, progressFrom: 390, progressValue: 10, next: 910 }).progress, 0);
});

test('아지트 공방은 관리 가능한 5개 고정 슬롯만 사용한다', () => {
    assert.deepEqual(DRAGON_DECOR_SLOTS.map((slot) => slot.id), [
        'wallpaper', 'pedestal', 'leftProp', 'rightProp', 'nameplate'
    ]);
    DRAGON_DECOR_SLOTS.forEach((slot) => {
        const items = getDragonDecorItemsForSlot(slot.id);
        assert.equal(items.length >= 4, true);
        assert.equal(items.some((item) => item.isDefault), true);
        assert.equal(Reflect.get(DEFAULT_EQUIPPED_DECOR, slot.id) != null, true);
    });
    assert.equal(DRAGON_DECOR_SLOTS[0].name, '프레임');
    assert.equal(getDragonDecorItemsForSlot('wallpaper').length, 10);
    assert.equal(getDragonDecorItemsForSlot('pedestal').length, 9);
    assert.equal(getDragonDecorItemsForSlot('leftProp').length, 9);
    assert.equal(getDragonDecorItemsForSlot('rightProp').length, 9);
    assert.equal(getDragonDecorItemsForSlot('nameplate').length, 9);
});

test('유료 장식 40종은 슬롯별 8개와 등급 피라미드로 고르게 배치된다', () => {
    const paidItems = DRAGON_DECOR_ITEMS.filter((item) => item.price > 0);
    assert.equal(paidItems.length, 40);
    DRAGON_DECOR_SLOTS.forEach((slot) => {
        assert.equal(paidItems.filter((item) => item.slot === slot.id).length, 8);
    });
    assert.deepEqual(
        Object.fromEntries(['starter', 'common', 'rare', 'hero', 'legendary'].map((rarity) => [
            rarity,
            paidItems.filter((item) => item.rarity === rarity).length
        ])),
        { starter: 8, common: 12, rare: 10, hero: 7, legendary: 3 }
    );
    assert.equal(paidItems.reduce((sum, item) => sum + item.price, 0), 143600);
});

test('기존에 산 배경은 새 프레임 소유·장착 상태로 그대로 이어진다', () => {
    const normalized = normalizeDragonDecor({
        background: 'storm',
        ownedItems: ['volcano', 'storm']
    });
    assert.equal(normalized.equipped.wallpaper, 'storm');
    assert.equal(normalized.owned.has('volcano'), true);
    assert.equal(normalized.owned.has('storm'), true);
    assert.equal(normalized.equipped.pedestal, 'pedestal-stone');
});

test('프레임은 모서리 테마 이름을 쓰고 좌우 소품은 최적화된 수호룡 에셋을 쓴다', () => {
    assert.equal(getDragonDecorItemsForSlot('wallpaper').every((item) => item.name.includes('프레임')), true);
    assert.deepEqual(
        getDragonDecorItemsForSlot('pedestal').map((item) => item.preview),
        ['stone', 'oak', 'cloud', 'root', 'ember', 'crystal', 'moonstone', 'rune', 'celestial']
    );
    const props = [
        ...getDragonDecorItemsForSlot('leftProp'),
        ...getDragonDecorItemsForSlot('rightProp')
    ].filter((item) => !item.isDefault);
    assert.equal(props.length, 16);
    assert.deepEqual(props.map((item) => item.image), [
        '/assets/dragons/decor/left-dragonheart-crystals.webp',
        '/assets/dragons/decor/left-cloud-harp.webp',
        '/assets/dragons/decor/left-chronicle-lectern.webp',
        '/assets/dragons/decor/left-guardian-brazier.webp',
        '/assets/dragons/decor/left-ancestor-runestone.webp',
        '/assets/dragons/decor/left-moonwell.webp',
        '/assets/dragons/decor/left-storm-spire.webp',
        '/assets/dragons/decor/left-royal-banner.webp',
        '/assets/dragons/decor/right-hatchling-nest.webp',
        '/assets/dragons/decor/right-bond-shrine.webp',
        '/assets/dragons/decor/right-forest-spring.webp',
        '/assets/dragons/decor/right-treasure-vault.webp',
        '/assets/dragons/decor/right-crystal-egg.webp',
        '/assets/dragons/decor/right-celestial-orrery.webp',
        '/assets/dragons/decor/right-ember-anvil.webp',
        '/assets/dragons/decor/right-golden-relic.webp'
    ]);
});

test('장착한 5개 슬롯은 하나의 pet_data 계약으로 복원된다', () => {
    const petData = {
        background: 'default',
        ownedDecorItems: ['pedestal-cloud', 'left-bookshelf', 'right-telescope', 'nameplate-brass'],
        equippedDecor: {
            wallpaper: 'sky',
            pedestal: 'pedestal-cloud',
            leftProp: 'left-bookshelf',
            rightProp: 'right-telescope',
            nameplate: 'nameplate-brass'
        }
    };
    const normalized = normalizeDragonDecor(petData);
    assert.deepEqual(normalized.equipped, petData.equippedDecor);
    assert.equal(DRAGON_DECOR_ITEMS.every((item) => item.slot && item.id), true);
});

test('문패 9종은 단계적으로 화려해지는 개별 WebP와 전설 잠금 조건을 쓴다', () => {
    const nameplates = getDragonDecorItemsForSlot('nameplate');
    assert.deepEqual(nameplates.map((item) => item.image), [
        '/assets/dragons/nameplates/nameplate-simple.webp',
        '/assets/dragons/nameplates/nameplate-oak.webp',
        '/assets/dragons/nameplates/nameplate-brass.webp',
        '/assets/dragons/nameplates/nameplate-crystal.webp',
        '/assets/dragons/nameplates/nameplate-rune.webp',
        '/assets/dragons/nameplates/nameplate-celestial.webp',
        '/assets/dragons/nameplates/nameplate-ember.webp',
        '/assets/dragons/nameplates/nameplate-storm.webp',
        '/assets/dragons/nameplates/nameplate-legend.webp'
    ]);
    assert.deepEqual(nameplates.map((item) => item.price), [0, 500, 1200, 1400, 1600, 2000, 3500, 4200, 10000]);
    assert.equal(nameplates.at(-1).requiredWriterLevel, 10);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
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
    DRAGON_DECOR_COLLECTIONS,
    DRAGON_DECOR_ITEMS,
    DRAGON_DECOR_RARITIES,
    DRAGON_DECOR_SLOTS,
    DRAGON_LEGENDARY_REWARD,
    DRAGON_NAMEPLATE_TEXT_PROFILES,
    getDragonDecorCollectionForItem,
    getDragonDecorCollectionItems,
    getDragonDecorItemsForSlot,
    getDragonNameplateTextLayout,
    getDragonLegendaryRewardItems,
    hasDragonLegendaryReward,
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
    assert.match(workshopSource, /DRAGON_DECOR_COLLECTIONS\.map/);
    assert.match(workshopSource, /previewCollection/);
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
    assert.equal(getDragonDecorItemsForSlot('wallpaper').length, 13);
    assert.equal(getDragonDecorItemsForSlot('pedestal').length, 13);
    assert.equal(getDragonDecorItemsForSlot('leftProp').length, 12);
    assert.equal(getDragonDecorItemsForSlot('rightProp').length, 12);
    assert.equal(getDragonDecorItemsForSlot('nameplate').length, 12);
});

test('유료 장식 52종은 성장 상품과 자유 구매 상품의 가격·단계 계약을 함께 지킨다', () => {
    const paidItems = DRAGON_DECOR_ITEMS.filter((item) => item.price > 0);
    assert.equal(paidItems.length, 52);
    assert.deepEqual(
        Object.fromEntries(['starter', 'common', 'rare', 'hero'].map((rarity) => [
            rarity,
            paidItems.filter((item) => item.rarity === rarity).length
        ])),
        { starter: 8, common: 12, rare: 10, hero: 7 }
    );
    assert.equal(paidItems.reduce((sum, item) => sum + item.price, 0), 61800);
    Object.values(DRAGON_DECOR_RARITIES).forEach((rarity) => {
        const items = DRAGON_DECOR_ITEMS.filter((item) => item.rarity === rarity.id);
        assert.equal(items.every((item) => item.price === rarity.price), true);
        assert.equal(items.every((item) => item.requiredWriterLevel === rarity.requiredWriterLevel), true);
    });
    const levelFreeItems = paidItems.filter((item) => item.isLevelFree);
    assert.equal(levelFreeItems.length, 15);
    assert.equal(levelFreeItems.every((item) => item.requiredWriterLevel === 1 && item.requiredReaderLevel === 1), true);
    assert.deepEqual(
        Object.fromEntries(['sunny-garden', 'wave-harbor', 'dreamlight-library'].map((theme) => [
            theme,
            [...new Set(levelFreeItems.filter((item) => item.theme === theme).map((item) => item.price))]
        ])),
        { 'sunny-garden': [800], 'wave-harbor': [1000], 'dreamlight-library': [1200] }
    );
});

test('8개 구매 세트와 전설 달성 세트는 모두 슬롯별 1개씩 구성된다', () => {
    assert.equal(DRAGON_DECOR_COLLECTIONS.length, 9);
    const collectionItemIds = new Set();

    DRAGON_DECOR_COLLECTIONS.forEach((collection) => {
        assert.deepEqual(Object.keys(collection.items), DRAGON_DECOR_SLOTS.map((slot) => slot.id));
        const collectionItems = getDragonDecorCollectionItems(collection.id);
        assert.equal(collectionItems.length, 5);
        assert.deepEqual(collectionItems.map((item) => item.slot), DRAGON_DECOR_SLOTS.map((slot) => slot.id));
        collectionItems.forEach((item) => {
            assert.equal(collectionItemIds.has(item.id), false);
            assert.equal(item.collectionId, collection.id);
            assert.equal(item.collectionName, collection.name);
            assert.equal(getDragonDecorCollectionForItem(item.id)?.id, collection.id);
            collectionItemIds.add(item.id);
        });
    });

    assert.equal(collectionItemIds.size, 45);
    const levelFreeCollections = DRAGON_DECOR_COLLECTIONS.filter((collection) => collection.levelFree);
    assert.equal(levelFreeCollections.length, 3);
    assert.equal(levelFreeCollections.every((collection) => (
        getDragonDecorCollectionItems(collection.id).every((item) => item.isLevelFree)
    )), true);
    const legendaryItems = getDragonLegendaryRewardItems();
    assert.equal(legendaryItems.length, 5);
    assert.equal(legendaryItems.every((item) => item.acquisitionType === 'achievement'), true);
    assert.equal(legendaryItems.every((item) => item.requiredWriterLevel === 10 && item.requiredReaderLevel === 7), true);
    assert.equal(hasDragonLegendaryReward({ ownedDecorItems: legendaryItems.map((item) => item.id) }), true);
    assert.equal(hasDragonLegendaryReward({ ownedDecorItems: legendaryItems.slice(1).map((item) => item.id) }), false);
    assert.equal(DRAGON_LEGENDARY_REWARD.name, '전설의 황금 성소');
});

test('학생 공방은 세트 전체 미리보기와 상품별 구매를 분리한다', async () => {
    const [shopSource, shopCss] = await Promise.all([
        readFile('src/modules/game/dragon/BackgroundShopModal.jsx', 'utf8'),
        readFile('src/modules/game/dragon/BackgroundShopModal.css', 'utf8')
    ]);
    assert.match(shopSource, /DRAGON_DECOR_COLLECTIONS\.map/);
    assert.match(shopSource, /setPreviewEquipped\(\{ \.\.\.collection\.items \}\)/);
    assert.match(shopSource, /상품은 하나씩 구입하고 장착할 수 있어요/);
    assert.match(shopSource, /buyDecorItem\(item\)/);
    assert.match(shopSource, /claimLegendaryReward\(\)/);
    assert.match(shopSource, /작가 10 · 독자 7/);
    assert.doesNotMatch(shopSource, /buyDecorCollection|buy_my_dragon_decor_collection/);
    assert.match(shopCss, /grid-template-areas: 'copy preview' 'action preview'/);
    assert.match(shopCss, /\.agit-workshop__item-preview \{ grid-area: preview; justify-self: end;/);
    assert.match(shopCss, /\.agit-workshop__item-copy \{ grid-area: copy;/);
    assert.match(shopCss, /\.agit-workshop__item-badges \{ display: flex; flex-wrap: wrap;/);
    assert.doesNotMatch(shopCss, /\.agit-workshop__collection-badge \{ overflow: hidden;/);
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
        ['stone', 'oak', 'cloud', 'root', 'ember', 'crystal', 'moonstone', 'rune', 'celestial', 'legend', 'sunny-garden', 'wave-harbor', 'dreamlight-library']
    );
    const props = [
        ...getDragonDecorItemsForSlot('leftProp'),
        ...getDragonDecorItemsForSlot('rightProp')
    ].filter((item) => !item.isDefault);
    assert.equal(props.length, 22);
    assert.deepEqual(props.map((item) => item.image), [
        '/assets/dragons/decor/left-dragonheart-crystals.webp',
        '/assets/dragons/decor/left-cloud-harp.webp',
        '/assets/dragons/decor/left-chronicle-lectern.webp',
        '/assets/dragons/decor/left-guardian-brazier.webp',
        '/assets/dragons/decor/left-ancestor-runestone.webp',
        '/assets/dragons/decor/left-moonwell.webp',
        '/assets/dragons/decor/left-storm-spire.webp',
        '/assets/dragons/decor/left-royal-banner.webp',
        '/assets/dragons/decor/left-sunny-garden-journal.webp',
        '/assets/dragons/decor/left-wave-harbor-map.webp',
        '/assets/dragons/decor/left-dreamlight-books.webp',
        '/assets/dragons/decor/right-hatchling-nest.webp',
        '/assets/dragons/decor/right-bond-shrine.webp',
        '/assets/dragons/decor/right-forest-spring.webp',
        '/assets/dragons/decor/right-treasure-vault.webp',
        '/assets/dragons/decor/right-crystal-egg.webp',
        '/assets/dragons/decor/right-celestial-orrery.webp',
        '/assets/dragons/decor/right-ember-anvil.webp',
        '/assets/dragons/decor/right-golden-relic.webp',
        '/assets/dragons/decor/right-sunny-garden-nest.webp',
        '/assets/dragons/decor/right-wave-harbor-observatory.webp',
        '/assets/dragons/decor/right-dreamlight-cushion.webp'
    ]);
});

test('실제 아지트와 상품 카드의 프레임은 얇은 레일과 작은 모서리 장식을 함께 쓴다', async () => {
    const [sceneCss, shopCss] = await Promise.all([
        readFile('src/modules/game/dragon/DragonHideoutScene.css', 'utf8'),
        readFile('src/modules/game/dragon/BackgroundShopModal.css', 'utf8')
    ]);

    assert.match(sceneCss, /--frame-rail: max\(2px,\.62cqi\)/);
    assert.match(sceneCss, /width: 10\.5%;\s*height: 15\.5%/);
    assert.doesNotMatch(sceneCss, /width: 15%;\s*height: 24%/);
    assert.match(shopCss, /inset 0 3px 0 -1px var\(--workshop-frame-color\)/);
    assert.match(shopCss, /width: 14px;\s*height: 17px/);
    assert.doesNotMatch(shopCss, /inset 0 0 0 4px var\(--workshop-frame-color\)/);
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

test('문패 12종은 개별 WebP·자유 구매 가격·전설 달성 조건을 쓴다', async () => {
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
        '/assets/dragons/nameplates/nameplate-legend.webp',
        '/assets/dragons/nameplates/nameplate-sunny-garden.webp',
        '/assets/dragons/nameplates/nameplate-wave-harbor.webp',
        '/assets/dragons/nameplates/nameplate-dreamlight-library.webp'
    ]);
    assert.deepEqual(nameplates.map((item) => item.price), [0, 300, 700, 700, 700, 700, 1500, 1500, 0, 800, 1000, 1200]);
    const legendaryNameplate = nameplates.find((item) => item.id === 'nameplate-legend');
    assert.equal(legendaryNameplate.requiredWriterLevel, 10);
    assert.equal(legendaryNameplate.requiredReaderLevel, 7);
    assert.equal(legendaryNameplate.acquisitionType, 'achievement');
    assert.deepEqual(Object.keys(DRAGON_NAMEPLATE_TEXT_PROFILES), nameplates.map((item) => item.preview));

    assert.equal(DRAGON_DECOR_ITEMS.filter((item) => item.isLevelFree && item.image).length, 9);
    const generatedAssetStats = await Promise.all([
        stat('public/assets/dragons/decor/left-sunny-garden-journal.webp'),
        stat('public/assets/dragons/decor/right-sunny-garden-nest.webp'),
        stat('public/assets/dragons/nameplates/nameplate-sunny-garden.webp'),
        stat('public/assets/dragons/decor/left-wave-harbor-map.webp'),
        stat('public/assets/dragons/decor/right-wave-harbor-observatory.webp'),
        stat('public/assets/dragons/nameplates/nameplate-wave-harbor.webp'),
        stat('public/assets/dragons/decor/left-dreamlight-books.webp'),
        stat('public/assets/dragons/decor/right-dreamlight-cushion.webp'),
        stat('public/assets/dragons/nameplates/nameplate-dreamlight-library.webp')
    ]);
    assert.equal(generatedAssetStats.every((assetStat) => assetStat.size <= 100 * 1024), true);

    const shortLegend = getDragonNameplateTextLayout('legend', '나의 아지트', '황금이');
    const longLegend = getDragonNameplateTextLayout('legend', '김승현의 아지트', '황금빛 수호룡');
    const longStorm = getDragonNameplateTextLayout('storm', '김승현의 아지트', '폭풍이');
    const shopLegend = getDragonNameplateTextLayout('legend', '나의 아지트', '', { thumbnail: true });
    assert.equal(Number.parseFloat(longLegend['--nameplate-height']) > Number.parseFloat(shortLegend['--nameplate-height']), true);
    assert.equal(Number.parseFloat(longLegend['--nameplate-title-size']) <= Number.parseFloat(shortLegend['--nameplate-title-size']), true);
    assert.equal(Number.parseFloat(longStorm['--nameplate-copy-width']) < 40, true);
    assert.equal(Number.parseFloat(shopLegend['--nameplate-copy-width']) < 40, true);
    assert.equal(shopLegend['--nameplate-copy-top'], '55.0%');
    assert.equal(getDragonNameplateTextLayout('celestial')['--nameplate-copy-top'], '57.0%');
    assert.equal(getDragonNameplateTextLayout('storm')['--nameplate-copy-top'], '54.0%');
});

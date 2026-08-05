import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DRAGON_SPECIES,
    HIDEOUT_BACKGROUNDS,
    canReselectDragonSpecies,
    getDragonGrowthFromWriterLevel,
    getPendingDragonGrowth,
    getDragonStage,
    getReaderDragonEffect,
    getReaderSceneTheme
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
    assert.equal(getDragonDecorItemsForSlot('pedestal').length, 8);
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
        ['stone', 'oak', 'cloud', 'crystal', 'rune', 'moonstone', 'ember', 'root']
    );
    const props = [
        ...getDragonDecorItemsForSlot('leftProp'),
        ...getDragonDecorItemsForSlot('rightProp')
    ].filter((item) => !item.isDefault);
    assert.equal(props.length, 8);
    assert.deepEqual(props.map((item) => item.image), [
        '/assets/dragons/decor/left-chronicle-lectern.webp',
        '/assets/dragons/decor/left-dragonheart-crystals.webp',
        '/assets/dragons/decor/left-guardian-brazier.webp',
        '/assets/dragons/decor/left-ancestor-runestone.webp',
        '/assets/dragons/decor/right-bond-shrine.webp',
        '/assets/dragons/decor/right-celestial-orrery.webp',
        '/assets/dragons/decor/right-treasure-vault.webp',
        '/assets/dragons/decor/right-hatchling-nest.webp'
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

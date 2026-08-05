import test from 'node:test';
import assert from 'node:assert/strict';
import {
    DRAGON_SPECIES,
    canReselectDragonSpecies,
    getDragonGrowthFromWriterLevel,
    getDragonStage,
    getReaderDragonEffect
} from '../src/modules/game/dragon/presentation.js';

test('작가 칭호 10단계를 드래곤 10단계로 그대로 연결한다', () => {
    for (let level = 1; level <= 10; level += 1) {
        const growth = getDragonGrowthFromWriterLevel({ level, next: level < 10 ? 100 : null });
        assert.equal(growth.level, level);
        assert.equal(getDragonStage(growth.level).level, level);
    }
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

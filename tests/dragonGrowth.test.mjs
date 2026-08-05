import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDragonGrowthFromWriterLevel,
    getDragonStage
} from '../src/modules/game/dragon/presentation.js';

test('작가 칭호 10단계를 드래곤 10단계로 그대로 연결한다', () => {
    for (let level = 1; level <= 10; level += 1) {
        const growth = getDragonGrowthFromWriterLevel({ level, next: level < 10 ? 100 : null });
        assert.equal(growth.level, level);
        assert.equal(getDragonStage(growth.level).level, level);
    }
});

test('기존 다섯 이미지를 기본·각성 변형으로 두 단계씩 사용한다', () => {
    for (let level = 1; level <= 10; level += 2) {
        const base = getDragonStage(level);
        const awakened = getDragonStage(level + 1);
        assert.equal(base.image, awakened.image);
        assert.equal(base.formLevel, awakened.formLevel);
        assert.equal(base.variant, 'base');
        assert.equal(awakened.variant, 'awakened');
        assert.notEqual(base.imageFilter, awakened.imageFilter);
    }
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

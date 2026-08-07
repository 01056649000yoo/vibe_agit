import test from 'node:test';
import assert from 'node:assert/strict';
import {
    clampProgress,
    formatMarathonDistance,
    getCoursePosition,
    getProgressPercent,
    normalizeMarathonSnapshot
} from '../src/modules/writing/reading-log/marathon/readingMarathon.js';

test('공동 목표 진행률은 0~100% 범위를 넘지 않는다', () => {
    assert.equal(getProgressPercent(5000, 10000), 50);
    assert.equal(getProgressPercent(12000, 10000), 100);
    assert.equal(getProgressPercent(-100, 10000), 0);
    assert.equal(clampProgress(Number.NaN), 0);
});

test('거리는 학생이 읽기 쉬운 m와 km로 표시한다', () => {
    assert.equal(formatMarathonDistance(950), '950m');
    assert.equal(formatMarathonDistance(2000), '2km');
    assert.equal(formatMarathonDistance(42195), '42.2km');
});

test('코스 주자는 출발점과 결승점 사이에서만 움직인다', () => {
    assert.deepEqual(getCoursePosition(0), { x: 44, y: 186 });
    assert.deepEqual(getCoursePosition(100), { x: 856, y: 108 });
    assert.deepEqual(getCoursePosition(200), { x: 856, y: 108 });
});

test('개인 순위와 학급 공동 집계의 숫자를 안전하게 정규화한다', () => {
    const snapshot = normalizeMarathonSnapshot({
        campaign: { target_distance_m: 10000 },
        summary: { total_pages: '250', total_distance_m: '2500', contributors: '3', book_count: '4' },
        leaderboard: [{ student_id: 'a', rank: '1', distance_m: '1200', total_pages: '120', book_count: '1' }],
        my: { rank: '2', distance_m: '900', total_pages: '90', book_count: '1' }
    });
    assert.equal(snapshot.summary.progressPercent, 25);
    assert.equal(snapshot.summary.contributors, 3);
    assert.equal(snapshot.leaderboard[0].rank, 1);
    assert.equal(snapshot.my.distance_m, 900);
});

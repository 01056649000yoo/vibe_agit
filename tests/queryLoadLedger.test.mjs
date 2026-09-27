import assert from 'node:assert/strict';
import test from 'node:test';
import { computeDailyLoad, functionNameOf, summarizeLedger } from '../scripts/queryLoadLedger.mjs';

/* 하루 DB 부하 장부(2026-09-27): 누적값의 차이로 하루치를 구하고, DB 재시작(통계 초기화)을 가린다. */
const snapshot = (statsReset, rows) => ({ statsReset, rows });

test('어제 누적과 이어지면 차이가 하루치다', () => {
    const day1 = computeDailyLoad(null, snapshot('R1', [
        { queryid: '1', calls: 100, totalMs: 500, name: 'poll_a', query: '' },
        { queryid: '2', calls: 10, totalMs: 1000, name: 'heavy_b', query: '' }
    ]));
    assert.equal(day1.entry.baseline, 'stats-reset', '첫 기록은 하루치가 아니라 누적이다');
    const day2 = computeDailyLoad(day1.state, snapshot('R1', [
        { queryid: '1', calls: 160, totalMs: 800, name: 'poll_a', query: '' },
        { queryid: '2', calls: 10, totalMs: 1000, name: 'heavy_b', query: '' }
    ]));
    assert.equal(day2.entry.baseline, 'previous-snapshot');
    assert.equal(day2.entry.calls, 60);
    assert.equal(day2.entry.totalMs, 300);
    assert.deepEqual(day2.entry.top, [{ name: 'poll_a', calls: 60, totalMs: 300, meanMs: 5 }], '변화 없는 쿼리는 빼야 한다');
});

test('DB 가 재시작돼 통계가 초기화되면 어제와 빼지 않는다', () => {
    const before = computeDailyLoad(null, snapshot('R1', [{ queryid: '1', calls: 500, totalMs: 5000, name: 'poll_a', query: '' }]));
    const after = computeDailyLoad(before.state, snapshot('R2', [{ queryid: '1', calls: 20, totalMs: 100, name: 'poll_a', query: '' }]));
    assert.equal(after.entry.baseline, 'stats-reset');
    assert.equal(after.entry.calls, 20, '초기화 뒤 누적을 그대로 써야 한다(음수가 되면 안 된다)');
});

test('함수 이름은 PostgREST·예약 작업 두 모양에서 꺼내고, 같은 함수는 합친다', () => {
    assert.equal(functionNameOf('WITH x AS (SELECT "public"."get_student_home_bootstrap_v1"())'), 'get_student_home_bootstrap_v1');
    assert.equal(functionNameOf('SELECT public.open_due_scheduled_missions_v1()'), 'open_due_scheduled_missions_v1');
    const merged = computeDailyLoad(null, snapshot('R1', [
        { queryid: '1', calls: 3, totalMs: 30, query: 'SELECT public.same_fn($1)' },
        { queryid: '2', calls: 2, totalMs: 20, query: 'SELECT public.same_fn($1, $2)' }
    ]));
    assert.deepEqual(merged.entry.top.map((item) => [item.name, item.calls]), [['same_fn', 5]]);
});

test('요약은 평일 하루치만 평균 내고 가장 바쁜 날을 고른다', () => {
    const summary = summarizeLedger([
        { date: '2026-09-28', calls: 100, totalMs: 2000, baseline: 'previous-snapshot', top: [] }, // 월
        { date: '2026-09-29', calls: 300, totalMs: 6000, baseline: 'previous-snapshot', top: [] }, // 화
        { date: '2026-10-03', calls: 50, totalMs: 500, baseline: 'previous-snapshot', top: [] },   // 토
        { date: '2026-10-05', calls: 999, totalMs: 9000, baseline: 'stats-reset', top: [] }        // 월, 재시작 뒤 누적
    ]);
    assert.deepEqual(summary.weekdayAverage, { calls: 200, totalMs: 4000, count: 2 });
    assert.equal(summary.peak.date, '2026-10-05');
});

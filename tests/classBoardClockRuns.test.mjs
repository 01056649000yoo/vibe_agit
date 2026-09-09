import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** localStorage 는 브라우저 것이라 검사에서 최소한으로 흉내 낸다(`window.localStorage` 를 본다). */
const store = new Map();
globalThis.window = {
    localStorage: {
        getItem: (key) => (store.has(key) ? store.get(key) : null),
        setItem: (key, value) => store.set(key, String(value)),
        removeItem: (key) => store.delete(key),
    },
};

const {
    CLOCK_RUN_MAX_AGE_MS, clearClockRun, readClockRun, resumeStopwatch, resumeTimer, writeClockRun,
} = await import('../src/modules/tool/class-board/widgets/time/clockRuns.js');

const timer = readFileSync('src/modules/tool/class-board/widgets/timer/TimerWidget.jsx', 'utf8');
const stopwatch = readFileSync('src/modules/tool/class-board/widgets/stopwatch/StopwatchWidget.jsx', 'utf8');
const host = readFileSync('src/modules/tool/class-board/host/WidgetHost.jsx', 'utf8');

test('타이머는 화면이 사라진 동안에도 시간이 흐른다', () => {
    store.clear();
    const now = 1_000_000;
    const durationMs = 300_000;
    // 5분짜리를 시작한다 → 끝나는 **시각**을 적는다.
    writeClockRun('w1', { kind: 'timer', durationMs, endAt: now + durationMs, remainingMs: null }, now);

    // 2분 뒤 다른 화면에서 다시 그리면 3분이 남아 있어야 한다.
    const later = now + 120_000;
    const saved = readClockRun('w1', { kind: 'timer', durationMs }, later);
    const resumed = resumeTimer(saved, durationMs, later);
    assert.equal(resumed.endAt - later, 180_000, '남은 시간이 이어지지 않습니다.');

    // 화면이 없는 동안 끝났으면 0 으로 멈춰 있어야 한다.
    const after = now + durationMs + 60_000;
    const finished = resumeTimer(readClockRun('w1', { kind: 'timer', durationMs }, after), durationMs, after);
    assert.deepEqual(finished, { endAt: null, remainingMs: 0 });
});

test('잠시 멈춘 타이머는 남은 시간 그대로 이어진다', () => {
    store.clear();
    const now = 2_000_000;
    const durationMs = 600_000;
    writeClockRun('w2', { kind: 'timer', durationMs, endAt: null, remainingMs: 250_000 }, now);

    // 멈춰 있는 동안에는 시간이 줄지 않는다.
    const later = now + 3_600_000 - 1;
    const resumed = resumeTimer(readClockRun('w2', { kind: 'timer', durationMs }, later), durationMs, later);
    assert.deepEqual(resumed, { endAt: null, remainingMs: 250_000 });
});

test('스톱워치는 멈춘 시간과 도는 시간을 나눠 이어 간다', () => {
    store.clear();
    const now = 3_000_000;
    // 30초를 재고 멈춘 상태
    writeClockRun('w3', { kind: 'stopwatch', startedAt: null, elapsedMs: 30_000 }, now);
    assert.deepEqual(resumeStopwatch(readClockRun('w3', { kind: 'stopwatch' }, now + 60_000)),
        { startedAt: null, elapsedMs: 30_000 });

    // 다시 시작하면 시작 **시각**을 적어 화면이 없어도 흐른다.
    writeClockRun('w3', { kind: 'stopwatch', startedAt: now, elapsedMs: 30_000 }, now);
    const resumed = resumeStopwatch(readClockRun('w3', { kind: 'stopwatch' }, now + 45_000));
    assert.equal(resumed.startedAt, now);
    assert.equal(resumed.elapsedMs, 30_000);
});

test('위젯마다 따로 적어 한 스크린의 타이머 둘이 섞이지 않는다', () => {
    store.clear();
    const now = 4_000_000;
    writeClockRun('left', { kind: 'timer', durationMs: 60_000, endAt: now + 10_000, remainingMs: null }, now);
    writeClockRun('right', { kind: 'timer', durationMs: 60_000, endAt: now + 50_000, remainingMs: null }, now);
    assert.equal(readClockRun('left', { kind: 'timer', durationMs: 60_000 }, now).endAt, now + 10_000);
    assert.equal(readClockRun('right', { kind: 'timer', durationMs: 60_000 }, now).endAt, now + 50_000);
});

test('어제 켜 둔 기록은 오늘 되살아나지 않는다', () => {
    store.clear();
    const now = 5_000_000;
    writeClockRun('w4', { kind: 'timer', durationMs: 60_000, endAt: now + 60_000, remainingMs: null }, now);
    const tomorrow = now + CLOCK_RUN_MAX_AGE_MS + 1;
    assert.equal(readClockRun('w4', { kind: 'timer', durationMs: 60_000 }, tomorrow), null);
});

test('설정을 바꾸거나 종류가 다르면 옛 진행을 버린다', () => {
    store.clear();
    const now = 6_000_000;
    writeClockRun('w5', { kind: 'timer', durationMs: 300_000, endAt: now + 100_000, remainingMs: null }, now);
    // 교사가 타이머를 5분 → 3분으로 바꿨다. 3분짜리에 5분이 남아 있으면 안 된다.
    assert.equal(readClockRun('w5', { kind: 'timer', durationMs: 180_000 }, now), null);
    // 같은 자리에 스톱워치를 놓아도 타이머 기록을 읽지 않는다.
    assert.equal(readClockRun('w5', { kind: 'stopwatch' }, now), null);
    // 설정이 그대로면 이어진다.
    assert.ok(readClockRun('w5', { kind: 'timer', durationMs: 300_000 }, now));
});

test('초기화를 누르면 기록이 남지 않는다', () => {
    store.clear();
    const now = 7_000_000;
    writeClockRun('w6', { kind: 'stopwatch', startedAt: now, elapsedMs: 0 }, now);
    clearClockRun('w6');
    assert.equal(readClockRun('w6', { kind: 'stopwatch' }, now), null);
});

test('위젯은 자기 자리를 알고, 시각을 적고, 초기화에서 지운다', () => {
    // instanceId 가 없으면 여러 타이머가 같은 칸을 덮어쓴다.
    assert.match(host, /instanceId=\{instance\.instanceId\}/);
    for (const [name, source] of [['타이머', timer], ['스톱워치', stopwatch]]) {
        assert.match(source, /instanceId = ''/, `${name}가 instanceId 를 받지 않습니다.`);
        assert.match(source, /clearClockRun\(instanceId\)/, `${name}가 초기화에서 지우지 않습니다.`);
        // 되살리기는 처음 그릴 때 한 번이어야 한다(매 렌더마다 읽으면 조작이 씹힌다).
        assert.match(source, /useState\(\(\) => resume/, `${name}가 처음 그릴 때 되살리지 않습니다.`);
    }

    /*
     * **시작을 누르는 순간**에 시각을 적어야 한다. 여기가 빠지면 멈춤·초기화만 기록되어,
     * 도는 중에 화면을 옮기면 그대로 사라진다 — 제보받은 바로 그 증상이다.
     */
    const timerStart = timer.split('prepareClassBoardAudio();')[1].split('};')[0];
    assert.match(timerStart, /writeClockRun\(instanceId, \{ kind: 'timer'[^}]*endAt: nextEndAt/,
        '타이머가 시작할 때 끝나는 시각을 적지 않습니다.');
    const stopwatchStart = stopwatch.split('const current = Date.now();')[1].split('};')[0];
    assert.match(stopwatchStart, /writeClockRun\(instanceId, \{ kind: 'stopwatch', startedAt: current/,
        '스톱워치가 시작할 때 시작 시각을 적지 않습니다.');
    // 멈춘 뒤 버튼이 `시작` 이면 처음부터 도는 것처럼 보인다.
    assert.match(timer, /'이어서'/);
    assert.match(stopwatch, /'이어서'/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DEFAULT_MIN_REMAINING, describeWindows, evaluateUsage } from '../scripts/codex-usage-guard.mjs';

// 선생님 결정(2026-10-11): Codex 남은 사용량이 10% 미만이면 쓰지 않는다. 읽지 못해도 쓰지 않는다.
const snapshot = (primary, secondary, extra = {}) => ({
    ordinaryUsageAllowed: true,
    rateLimits: { limitId: 'codex', primary: { usedPercent: primary, windowDurationMins: 300, resetsAt: 1 }, secondary: { usedPercent: secondary, windowDurationMins: 10080, resetsAt: 2 }, ...extra },
    rateLimitsByLimitId: { codex: { limitId: 'codex', primary: { usedPercent: primary }, secondary: { usedPercent: secondary } } }
});

test('기준은 남은 10%', () => {
    assert.equal(DEFAULT_MIN_REMAINING, 10);
});

test('남은 사용량이 10% 이상이면 허용, 같은 창을 두 번 세지 않는다', () => {
    const verdict = evaluateUsage(snapshot(16, 2));
    assert.equal(verdict.ok, true);
    assert.equal(verdict.windows.length, 2);
    assert.deepEqual(verdict.windows.map((w) => w.remaining), [84, 98]);
});

test('정확히 10% 남았으면 허용, 9% 남았으면 중지(5시간 창이든 주간 창이든)', () => {
    assert.equal(evaluateUsage(snapshot(90, 0)).ok, true);
    assert.equal(evaluateUsage(snapshot(91, 0)).code, 3);
    assert.equal(evaluateUsage(snapshot(0, 91)).code, 3);
    assert.match(evaluateUsage(snapshot(0, 95)).reason, /주간 창 남은 사용량 5%/);
});

test('사용 불가·지출 한도·한도 도달 표시가 있으면 퍼센트가 남아 있어도 중지', () => {
    assert.equal(evaluateUsage({ ...snapshot(10, 10), ordinaryUsageAllowed: false }).code, 3);
    assert.equal(evaluateUsage(snapshot(10, 10, { spendControlReached: true })).code, 3);
    assert.equal(evaluateUsage(snapshot(10, 10, { rateLimitReachedType: 'primary' })).code, 3);
});

test('읽지 못하면 쓰지 않는다(종료 코드 2)', () => {
    assert.equal(evaluateUsage(null).code, 2);
    assert.equal(evaluateUsage({}).code, 2);
    assert.equal(evaluateUsage({ rateLimits: { primary: null, secondary: null } }).ok, false);
});

test('보여 주는 글에 초기화 시각이 들어가고, 호출은 지킴이 안에서만 하며 저장소 폴더에서는 돌리지 않는다', async () => {
    assert.match(describeWindows(evaluateUsage(snapshot(16, 2)).windows), /5시간 창 남은 84% \(초기화 .*\) · 주간 창 남은 98%/);
    const source = await readFile('scripts/codex-usage-guard.mjs', 'utf8');
    assert.match(source, /const before = await check\(minRemaining\);\s*if \(!before\.ok\) process\.exit\(before\.code\);/);
    assert.match(source, /'-s', 'read-only'/);
    assert.match(source, /\.env\.local[\s\S]{0,80}\.git/);
    assert.doesNotMatch(source, /OPENAI_API_KEY|api[_-]?key/i, '유료 열쇠를 쓰지 않는다');
    assert.doesNotMatch(source, /gpt-\d/i, '모델 이름은 코드에 적지 않고 부르는 쪽이 --model 로 지정한다(모델 이름 한 곳 규칙)');
    assert.match(source, /!option\(args, '--model'\)/, '--model 이 없으면 쓰지 않는다');
});

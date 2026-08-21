import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [uptime, maintenance, guide, healthPlist, metricsPlist] = await Promise.all([
    readFile('.github/workflows/uptime.yml', 'utf8'),
    readFile('ops/caddy/maintenance.html', 'utf8'),
    readFile('docs/OUTAGE_PLAN.md', 'utf8'),
    readFile('ops/launchd/com.agit.service-health.plist', 'utf8'),
    readFile('ops/launchd/com.agit.system-metrics.plist', 'utf8')
]);

test('외부 uptime 점검은 15분마다 세 번 재시도하고 수동 실행도 허용한다', () => {
    assert.match(uptime, /cron: "\*\/15 \* \* \* \*"/);
    assert.match(uptime, /workflow_dispatch:/);
    assert.match(uptime, /for attempt in 1 2 3/);
    assert.match(uptime, /--max-time 15/);
    assert.match(uptime, /xn--vz0ba242ncqcba79xhwx\.site/);
});

test('앱 장애 때 보여 줄 정적 안내와 Caddy 오류 처리 계약을 함께 보관한다', () => {
    assert.match(maintenance, /잠시 점검 중이에요/);
    assert.match(maintenance, /이미 저장된 글은 그대로 보관/);
    assert.match(guide, /handle_errors/);
    assert.match(guide, /\/etc\/caddy\/static\/maintenance\.html/);
});

test('맥미니 감시는 launchd로 5분 및 매일 04:50에 실행한다', () => {
    assert.match(healthPlist, /<key>StartInterval<\/key>\s*<integer>300<\/integer>/);
    assert.match(healthPlist, /check-service-health\.sh/);
    assert.match(metricsPlist, /<key>Hour<\/key>\s*<integer>4<\/integer>/);
    assert.match(metricsPlist, /<key>Minute<\/key>\s*<integer>50<\/integer>/);
    assert.match(metricsPlist, /record-system-metrics\.sh/);
});

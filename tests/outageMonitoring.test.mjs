import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

const [maintenance, guide, healthScript, healthPlist, metricsPlist] = await Promise.all([
    readFile('ops/caddy/maintenance.html', 'utf8'),
    readFile('docs/OUTAGE_PLAN.md', 'utf8'),
    readFile('scripts/check-service-health.sh', 'utf8'),
    readFile('ops/launchd/com.agit.service-health.plist', 'utf8'),
    readFile('ops/launchd/com.agit.system-metrics.plist', 'utf8')
]);

test('장애 안내 정책은 외부 실패 메일 없이 Caddy와 로컬 상태 기록만 사용한다', async () => {
    await assert.rejects(access('.github/workflows/uptime.yml'), { code: 'ENOENT' });
    assert.doesNotMatch(healthScript, /RESEND_API_KEY|api\.resend\.com|ALERT_TO|send_mail/);
    assert.match(healthScript, /record_system_alert_v1/);
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

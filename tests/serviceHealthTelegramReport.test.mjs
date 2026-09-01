/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const reportScript = readFileSync('scripts/report-service-health.sh', 'utf8');
const installScript = readFileSync('ops/openclaw/install-agit-daytime-health-report.sh', 'utf8');

const shellPath = process.platform === 'win32'
    ? 'C:\\Program Files\\Git\\usr\\bin\\sh.exe'
    : '/bin/sh';

const shellFilePath = (path) => {
    if (process.platform !== 'win32') return path;
    return path.replace(/^([A-Za-z]):/, '/$1').replaceAll('\\', '/');
};

const writeExecutable = (path, body) => {
    writeFileSync(path, body, 'utf8');
    chmodSync(path, 0o755);
};

const runReport = ({ appCode = '200', openAlerts = '0', dbOk = '1', healthExit = '0' } = {}) => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'agit-health-report-'));
    const healthCheck = join(fixtureDir, 'health-check.sh');
    const fakeCurl = join(fixtureDir, 'curl.sh');
    const fakeDocker = join(fixtureDir, 'docker.sh');

    writeExecutable(healthCheck, `#!/bin/sh\nexit ${healthExit}\n`);
    writeExecutable(fakeCurl, `#!/bin/sh\nprintf '%s' '${appCode}'\n`);
    writeExecutable(fakeDocker, `#!/bin/sh\ncase \"$*\" in\n  *\"SELECT 1;\"*) printf '%s' '${dbOk}' ;;\n  *\"system_alert_events\"*) printf '%s' '${openAlerts}' ;;\n  *) exit 1 ;;\nesac\n`);

    return execFileSync(shellPath, [shellFilePath(resolve('scripts/report-service-health.sh'))], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            HEALTH_CHECK_SCRIPT: shellFilePath(healthCheck),
            CURL: shellFilePath(fakeCurl),
            DOCKER: shellFilePath(fakeDocker),
        },
        encoding: 'utf8',
    }).trim();
};

test('상태 보고는 정상 또는 문제 있음 한 줄만 출력한다', () => {
    assert.equal(runReport(), '🟢 끄적끄적 아지트 정상');
    assert.equal(runReport({ appCode: '503' }), '🔴 끄적끄적 아지트 문제 있음');
    assert.equal(runReport({ dbOk: '' }), '🔴 끄적끄적 아지트 문제 있음');
    assert.equal(runReport({ openAlerts: '1' }), '🔴 끄적끄적 아지트 문제 있음');
    assert.equal(runReport({ healthExit: '1' }), '🔴 끄적끄적 아지트 문제 있음');
});

test('상태 보고는 기존 건강검진을 재사용하고 비밀이나 상세 내용을 보내지 않는다', () => {
    assert.match(reportScript, /HEALTH_CHECK_SCRIPT/);
    assert.match(reportScript, /system_alert_events/);
    assert.match(reportScript, /HEALTH_CHECK_SCRIPT\" >\/dev\/null 2>&1/);
    assert.doesNotMatch(reportScript, /BOT_TOKEN|TELEGRAM_TOKEN|api\.telegram|openclaw\.json/);
    assert.equal((reportScript.match(/printf '%s\\n'/g) || []).length, 2);
});

test('오픈클로 일정은 낮 8시부터 18시까지 2시간 간격이고 모델을 부르지 않는다', () => {
    assert.match(installScript, /--cron "0 8-18\/2 \* \* \*"/);
    assert.match(installScript, /--tz "Asia\/Seoul"/);
    assert.match(installScript, /--command "\$REPORT_SCRIPT"/);
    assert.match(installScript, /--announce/);
    assert.match(installScript, /--channel last/);
    assert.match(installScript, /--declaration-key "agit-daytime-health-report-v1"/);
    assert.doesNotMatch(installScript, /--message|--prompt|--model/);
});

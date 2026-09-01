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

const runReport = ({
    appCode = '200', dbOk = '1', resourceRisks = '0', notices = '0',
    healthExit = '0', diskFreeGb = '64', failedCore = '',
} = {}) => {
    const fixtureDir = mkdtempSync(join(tmpdir(), 'agit-health-report-'));
    const healthCheck = join(fixtureDir, 'health-check.sh');
    const fakeCurl = join(fixtureDir, 'curl.sh');
    const fakeDocker = join(fixtureDir, 'docker.sh');
    const fakeDf = join(fixtureDir, 'df.sh');

    writeExecutable(healthCheck, `#!/bin/sh\nexit ${healthExit}\n`);
    writeExecutable(fakeCurl, `#!/bin/sh\nprintf '%s' '${appCode}'\n`);
    const inspectResult = failedCore
        ? `case \"$*\" in *\"${failedCore}\"*) printf '%s' 'exited|unhealthy' ;; *) printf '%s' 'running|healthy' ;; esac`
        : `printf '%s' 'running|healthy'`;
    writeExecutable(fakeDocker, `#!/bin/sh\ncase \"$*\" in\n  *\"inspect -f\"*) ${inspectResult} ;;\n  *\"SELECT 1;\"*) printf '%s' '${dbOk}' ;;\n  *\"system_alert_events\"*) printf '%s' '${resourceRisks}|${notices}' ;;\n  *) exit 1 ;;\nesac\n`);
    writeExecutable(fakeDf, `#!/bin/sh\nprintf '%s\\n' 'Filesystem 1G-blocks Used Available Capacity Mounted on' 'disk 100 36 ${diskFreeGb} 36% /'\n`);

    return execFileSync(shellPath, [shellFilePath(resolve('scripts/report-service-health.sh'))], {
        cwd: process.cwd(),
        env: {
            ...process.env,
            ...(process.platform === 'win32' ? { PATH: '/usr/bin:/bin' } : {}),
            HEALTH_CHECK_SCRIPT: shellFilePath(healthCheck),
            CURL: shellFilePath(fakeCurl),
            DOCKER: shellFilePath(fakeDocker),
            DF: shellFilePath(fakeDf),
        },
        encoding: 'utf8',
    }).trim();
};

test('상태 보고는 요약·핵심 상태·관리자 상세 화면을 함께 출력한다', () => {
    assert.equal(runReport(), [
        '🟢 끄적끄적 아지트 정상',
        '앱 정상 · DB 정상 · 핵심 9/9 · 디스크 64GB',
        '세부 보기: https://끄적끄적아지트.site (관리자 → 서버 상태)',
    ].join('\n'));
});

test('빨간 판정은 실제 중단이나 임박한 중단 위험으로 제한한다', () => {
    for (const input of [
        { appCode: '503' },
        { dbOk: '' },
        { failedCore: 'agit-rest' },
        { diskFreeGb: '9' },
        { resourceRisks: '1' },
    ]) {
        assert.match(runReport(input), /^🔴 끄적끄적 아지트 문제 있음\n/);
    }

    assert.match(runReport({ notices: '1' }), /^🟢 끄적끄적 아지트 정상\n.*운영 참고 1건/m);
    assert.match(runReport({ healthExit: '1' }), /^🟢 끄적끄적 아지트 정상\n.*운영 참고 1건/m);
});

test('상태 보고는 기존 건강검진을 재사용하고 비밀이나 원문 로그를 보내지 않는다', () => {
    assert.match(reportScript, /HEALTH_CHECK_SCRIPT/);
    assert.match(reportScript, /system_alert_events/);
    assert.match(reportScript, /HEALTH_CHECK_SCRIPT\" >\/dev\/null 2>&1/);
    assert.match(reportScript, /CORE_CONTAINERS/);
    assert.match(reportScript, /관리자 → 서버 상태/);
    assert.doesNotMatch(reportScript, /BOT_TOKEN|TELEGRAM_TOKEN|api\.telegram|openclaw\.json/);
    assert.doesNotMatch(reportScript, /detail FROM public\.system_alert_events/);
});

test('오픈클로 일정은 낮 8시부터 18시까지 2시간 간격이고 모델을 부르지 않는다', () => {
    assert.match(installScript, /--cron "0 8-18\/2 \* \* \*"/);
    assert.match(installScript, /--tz "Asia\/Seoul"/);
    assert.match(installScript, /--command "\$REPORT_SCRIPT"/);
    assert.match(installScript, /--announce/);
    assert.match(installScript, /--channel last/);
    assert.match(installScript, /--declaration-key "agit-daytime-health-report-v1"/);
    assert.match(installScript, /--output-max-bytes 512/);
    assert.doesNotMatch(installScript, /--message|--prompt|--model/);
});

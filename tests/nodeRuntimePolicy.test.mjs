import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
    brewVersions, compareVersions, eolWarnings, majorOf, pickPatchTarget, satisfiesRange
} from '../scripts/lib/nodeRuntimePolicy.mjs';

test('Node 범위 판정: 오픈클로 engines(>=24.16.0 <25 || >=26.1.0) 와 흔한 모양', () => {
    const range = '>=24.16.0 <25 || >=26.1.0';
    assert.equal(satisfiesRange('22.23.2', range), false);
    assert.equal(satisfiesRange('24.15.9', range), false);
    assert.equal(satisfiesRange('24.19.0', range), true);
    assert.equal(satisfiesRange('25.6.1', range), false);
    assert.equal(satisfiesRange('26.1.0', range), true);
    assert.equal(satisfiesRange('22.13.0', '^22.12.0'), true);
    assert.equal(satisfiesRange('23.0.0', '^22.12.0'), false);
    assert.equal(satisfiesRange('20.1.0', '>=20'), true);
    assert.equal(satisfiesRange('24.0.0', '~24.1'), null, '모르는 모양은 판정하지 않는다(업데이트 안 함)');
    assert.equal(majorOf('v24.21.0'), 24);
    assert.ok(compareVersions('24.10.0', '24.9.9') > 0);
});

test('패치 대상: 같은 큰 버전의 LTS 만, 나온 지 7일 지난 것만, 지금보다 새 것만', () => {
    const releases = [
        { version: 'v26.10.0', date: '2026-09-21', lts: false },
        { version: 'v24.22.0', date: '2026-10-01', lts: 'Krypton' },
        { version: 'v24.21.0', date: '2026-09-07', lts: 'Krypton' },
        { version: 'v22.23.3', date: '2026-09-23', lts: 'Jod' }
    ];
    // 24.22.0 은 이틀 전이라 아직 지켜보는 중 → 24.21.0
    assert.equal(pickPatchTarget(releases, { major: 24, current: '24.19.0', today: '2026-10-03' }), '24.21.0');
    assert.equal(pickPatchTarget(releases, { major: 24, current: '24.19.0', today: '2026-10-09' }), '24.22.0');
    assert.equal(pickPatchTarget(releases, { major: 24, current: '24.21.0', today: '2026-10-03' }), null);
    // 22 는 22 안에서만(24·26 이 더 새것이어도 가지 않는다). 22.23.3 은 9/23 판이라 9/30 부터 대상.
    assert.equal(pickPatchTarget(releases, { major: 22, current: '22.23.2', today: '2026-10-03' }), '22.23.3');
    assert.equal(pickPatchTarget(releases, { major: 22, current: '22.23.2', today: '2026-09-28' }), null);
    assert.equal(pickPatchTarget(releases, { major: 22, current: '22.23.3', today: '2026-10-03' }), null);
});

test('지원 종료 경고는 90일 안에 들어왔을 때만, 끝났으면 끝났다고', () => {
    const schedule = { v20: { end: '2026-04-30' }, v22: { end: '2027-04-30' }, v24: { end: '2028-04-30' } };
    assert.deepEqual(eolWarnings(schedule, [22, 24], { today: '2026-10-03' }), []);
    assert.deepEqual(eolWarnings(schedule, [22], { today: '2027-02-01' }).map((w) => w.days), [88]);
    assert.equal(eolWarnings(schedule, [20, 20], { today: '2026-10-03' })[0].expired, true);
    assert.equal(eolWarnings(schedule, [20, 20], { today: '2026-10-03' }).length, 1);
});

test('brew 정보에서 깔린 판·받을 판·묶임을 읽는다', () => {
    const info = { formulae: [{ installed: [{ version: '24.19.0' }], versions: { stable: '24.21.0' }, pinned: false }] };
    assert.deepEqual(brewVersions(info), { installed: '24.19.0', available: '24.21.0', pinned: false });
    assert.equal(brewVersions({ formulae: [] }), null);
});

test('주간 루틴은 큰 버전을 넘지 않고, 실패하면 되돌리고 묶으며, 도커 베이스를 새로 받고, 관리자 경고로 알린다', () => {
    const script = readFileSync('scripts/node-runtime-update.mjs', 'utf8');
    const policy = JSON.parse(readFileSync('ops/node-runtime/policy.json', 'utf8'));
    assert.match(script, /majorOf\(target\) !== entry\.major/);
    assert.match(script, /HOMEBREW_NO_INSTALL_CLEANUP: '1'/, '되돌릴 전 판을 brew 가 지우지 않게');
    assert.match(script, /tryRun\(BREW, \['pin', entry\.formula\]\)/);
    assert.match(script, /restartGateway\(previousBin\)/);
    assert.match(script, /record_system_alert_v1\('node_runtime'/);
    assert.match(script, /\['pull', '-q', image\]/);
    assert.equal(policy.quarantineDays, 7);
    assert.equal(policy.eolWarnDays, 90);
    assert.deepEqual(policy.brewFormulas.map((entry) => [entry.formula, entry.major]), [['node@22', 22], ['node@24', 24]]);
    assert.equal(policy.openclaw.nodeBin, '/opt/homebrew/opt/node@24/bin/node');
    // plutil -replace 는 배열 칸을 끼워 넣는다 — 지우고 넣어야 한다(2026-10-03 겪음).
    assert.doesNotMatch(script, /'-replace', 'ProgramArguments/);
    const agent = readFileSync('ops/launchd/com.agit.node-runtime-update.plist', 'utf8');
    assert.match(agent, /scripts\/node-runtime-update\.mjs/);
    assert.match(agent, /<key>Weekday<\/key>\s*<integer>0<\/integer>/);
    const admin = readFileSync('src/components/admin/AdminServicePanel.jsx', 'utf8');
    assert.match(admin, /node_runtime: 'Node 실행환경 확인 필요'/);
});

test('오픈클로 업데이트는 Node 24 로 돌고, 새 판이 요구하는 Node 를 못 맞추면 설치를 시도하지 않고 알린다', () => {
    const script = readFileSync('scripts/openclaw-autoupdate.sh', 'utf8');
    assert.match(script, /export PATH="\/opt\/homebrew\/opt\/node@24\/bin:/);
    assert.match(script, /npm view "openclaw@\$latest" engines\.node/);
    assert.match(script, /write_status NEEDS_NODE/);
    assert.match(script, /record_system_alert_v1\('node_runtime'/);
});

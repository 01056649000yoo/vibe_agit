#!/usr/bin/env node
/**
 * Node 실행환경 주간 점검·자동 패치(2026-10-03). 규칙 원문: docs/NODE_RUNTIME_POLICY.md, 설정: ops/node-runtime/policy.json.
 *
 *   npm run node:runtime -- --dry-run   무엇을 할지만 본다(아무것도 바꾸지 않는다)
 *   npm run node:runtime                 실제로 한다(LaunchAgent com.agit.node-runtime-update 가 매주 일요일 05:10)
 *
 * 하는 일
 *   ① brew 의 node@22(맥미니 기본)·node@24(오픈클로 전용)를 **같은 큰 버전 안에서만**, 나온 지 7일 지난 LTS 판으로 올린다.
 *      올린 뒤 바로 확인한다 — node@24 는 오픈클로 게이트웨이를 다시 띄워 응답을, node@22 는 기본 node 와 짧은 검사를.
 *      실패하면 node@24 는 **바로 전 판으로 게이트웨이를 되돌리고**, 둘 다 `brew pin` 으로 더 오르지 않게 묶은 뒤 알린다.
 *   ② 도커 베이스 이미지(node:22-alpine·caddy:2-alpine)를 새로 받아 둔다 — 다음 빌드부터 보안 패치가 들어간다.
 *      (2026-10-03 CVE 점검: 맥미니에 남은 옛 사본으로 계속 빌드해 openssl·curl 이 오래돼 있었다.)
 *   ③ 쓰는 큰 버전의 지원 종료가 90일 안이면 관리자 `서비스 현황` 에 `node_runtime` 경고를 연다. 큰 버전 이동은 사람이 한다.
 * 결과는 ~/backups/auto/node-runtime-status.txt 한 줄과 ~/Library/Logs/agit-node-runtime.log.
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, realpathSync, rmdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { brewVersions, compareVersions, eolWarnings, majorOf, pickPatchTarget } from './lib/nodeRuntimePolicy.mjs';

const REPO = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const HOME = homedir();
const policy = JSON.parse(readFileSync(path.join(REPO, 'ops/node-runtime/policy.json'), 'utf8'));
const dryRun = process.argv.includes('--dry-run');
const STATUS = path.join(HOME, 'backups/auto/node-runtime-status.txt');
const LOG = path.join(HOME, 'Library/Logs/agit-node-runtime.log');
const LOCK = path.join(HOME, 'backups/auto/.node-runtime-update.lock');
const BREW = existsSync('/opt/homebrew/bin/brew') ? '/opt/homebrew/bin/brew' : 'brew';
const DOCKER = existsSync('/Applications/Docker.app/Contents/Resources/bin/docker')
    ? '/Applications/Docker.app/Contents/Resources/bin/docker' : 'docker';
const today = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10); // KST 날짜

const log = (message) => {
    const line = `${new Date().toISOString()} ${dryRun ? '[미리보기] ' : ''}${message}`;
    console.log(line);
    if (!dryRun) appendFileSync(LOG, `${line}\n`);
};
const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', timeout: 15 * 60 * 1000, ...options }).trim();
const tryRun = (command, args, options) => { try { return { ok: true, out: run(command, args, options) }; } catch (error) { return { ok: false, out: String(error.stderr || error.message).slice(0, 400) }; } };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fetchJson = async (url) => {
    const response = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`${url} ${response.status}`);
    return response.json();
};
const httpCode = async (url) => {
    try { return (await fetch(url, { signal: AbortSignal.timeout(8000) })).status; } catch { return 0; }
};

/** 관리자 `서비스 현황` 경고(record_system_alert_v1, 열기/닫기). 기록 실패는 상태 파일에만 남는다. */
const recordAlert = (isProblem, detail) => {
    if (dryRun) { log(`경고 ${isProblem ? '열기' : '닫기'}: ${detail}`); return; }
    const sql = `SELECT public.record_system_alert_v1('node_runtime', ${isProblem ? 'true' : 'false'}, $d$${detail.replaceAll('$d$', '')}$d$);`;
    const result = tryRun(DOCKER, ['exec', '-i', 'agit-db', 'psql', '-U', 'supabase_admin', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql]);
    if (!result.ok) log(`경고 기록 실패: ${result.out}`);
};

const gatewayHealthy = async () => {
    for (let attempt = 0; attempt < 12; attempt += 1) {
        if (await httpCode(policy.openclaw.gatewayUrl) === 200) return true;
        await sleep(5000);
    }
    return false;
};

/** 오픈클로 게이트웨이를 주어진 node 로 띄운다(plist 의 node 자리만 바꾸고 다시 올림). */
const restartGateway = async (nodeBin) => {
    const plist = policy.openclaw.gatewayPlist.replace(/^~/, HOME);
    const current = tryRun('/usr/bin/plutil', ['-extract', 'ProgramArguments.3', 'raw', plist]).out;
    if (nodeBin && current !== nodeBin) {
        // ⚠️ plutil -replace 는 배열 칸을 바꾸지 않고 끼워 넣는다(2026-10-03 겪음) — 지우고 넣는다.
        run('/usr/bin/plutil', ['-remove', 'ProgramArguments.3', plist]);
        run('/usr/bin/plutil', ['-insert', 'ProgramArguments.3', '-string', nodeBin, plist]);
    }
    tryRun('/bin/launchctl', ['bootout', policy.openclaw.gatewayLabel]);
    await sleep(3000);
    tryRun('/bin/launchctl', ['bootstrap', `gui/${process.getuid()}`, plist]);
    return gatewayHealthy();
};

/** 기본 node(node@22) 확인 — 버전이 맞고, 이 저장소의 짧은 검사가 돈다. */
const defaultNodeHealthy = (expected) => {
    const version = tryRun('/opt/homebrew/opt/node@22/bin/node', ['-v']).out.replace(/^v/, '');
    if (version !== expected) return false;
    return tryRun('/opt/homebrew/opt/node@22/bin/node', ['--test', 'tests/nodeRuntimePolicy.test.mjs'], { cwd: REPO }).ok;
};

const main = async () => {
    const changes = [];
    const problems = [];
    let index;
    let schedule;
    try {
        [index, schedule] = await Promise.all([
            fetchJson('https://nodejs.org/dist/index.json'),
            fetchJson('https://raw.githubusercontent.com/nodejs/Release/main/schedule.json')
        ]);
    } catch (error) {
        log(`SKIPPED Node 출시 정보를 받지 못함: ${error.message}`);
        if (!dryRun) writeFileSync(STATUS, `SKIPPED ${today} Node 출시 정보 조회 실패\n`);
        return;
    }

    if (!dryRun) tryRun(BREW, ['update', '--quiet'], { env: { ...process.env, HOMEBREW_NO_ENV_HINTS: '1' } });

    // ① brew node 패치
    for (const entry of policy.brewFormulas) {
        const info = tryRun(BREW, ['info', '--json=v2', entry.formula]);
        const versions = info.ok ? brewVersions(JSON.parse(info.out)) : null;
        if (!versions?.installed) { problems.push(`${entry.formula} 정보를 읽지 못함`); continue; }
        if (versions.pinned) { problems.push(`${entry.formula} ${versions.installed} 이 묶여 있음(지난 자동 패치 실패) — 확인 뒤 brew unpin`); continue; }
        // brew 가 줄 수 있는 판이 7일 격리를 지난 LTS 판 이하일 때만 올린다.
        const allowed = pickPatchTarget(index, { major: entry.major, current: versions.installed, today, quarantineDays: policy.quarantineDays });
        const target = versions.available;
        if (!target || compareVersions(target, versions.installed) <= 0) { log(`${entry.formula} ${versions.installed} 최신`); continue; }
        if (majorOf(target) !== entry.major) { problems.push(`${entry.formula} 가 큰 버전이 다른 ${target} 를 가리킴 — 건드리지 않음`); continue; }
        if (!allowed || compareVersions(target, allowed) > 0) { log(`${entry.formula} ${versions.installed} → ${target} 는 아직 7일 지켜보는 중`); continue; }
        log(`${entry.formula} ${versions.installed} → ${target} 올림`);
        if (dryRun) { changes.push(`${entry.formula} ${versions.installed}→${target}(예정)`); continue; }

        const previousBin = path.join(realpathSync(`/opt/homebrew/opt/${entry.formula}`), 'bin/node');
        const upgraded = tryRun(BREW, ['upgrade', entry.formula], { env: { ...process.env, HOMEBREW_NO_INSTALL_CLEANUP: '1', HOMEBREW_NO_ENV_HINTS: '1' } });
        if (!upgraded.ok) { problems.push(`${entry.formula} 올리기 실패: ${upgraded.out.slice(0, 120)}`); continue; }
        const healthy = entry.check === 'openclaw-gateway'
            ? await restartGateway(policy.openclaw.nodeBin)
            : defaultNodeHealthy(target);
        if (healthy) { changes.push(`${entry.formula} ${versions.installed}→${target}`); continue; }

        // 되돌림: 게이트웨이는 바로 전 판 node 로 다시 띄우고, 둘 다 묶어서 더 오르지 않게 한다.
        tryRun(BREW, ['pin', entry.formula]);
        if (entry.check === 'openclaw-gateway' && existsSync(previousBin)) {
            const back = await restartGateway(previousBin);
            problems.push(`${entry.formula} ${target} 에서 게이트웨이가 안 떠 ${versions.installed} 로 되돌림(${back ? '정상' : '여전히 응답 없음'}), brew pin`);
        } else {
            problems.push(`${entry.formula} ${target} 확인 실패 — brew pin 으로 묶음, 사람이 확인`);
        }
    }

    // ② 도커 베이스 이미지 새로 받기
    for (const image of policy.dockerBaseImages) {
        if (dryRun) { log(`도커 ${image} 새로 받기(예정)`); continue; }
        const before = tryRun(DOCKER, ['image', 'inspect', image, '--format', '{{.Id}}']).out;
        const pulled = tryRun(DOCKER, ['pull', '-q', image]);
        const after = tryRun(DOCKER, ['image', 'inspect', image, '--format', '{{.Id}}']).out;
        if (!pulled.ok) problems.push(`도커 ${image} 받기 실패`);
        else if (before !== after) changes.push(`도커 ${image} 새 판`);
    }

    // ③ 큰 버전 지원 종료 경고(자동으로 옮기지 않는다)
    const majors = [...policy.brewFormulas.map((entry) => entry.major), ...(policy.dockerMajors || [])];
    for (const warning of eolWarnings(schedule, majors, { today, warnDays: policy.eolWarnDays })) {
        problems.push(warning.expired
            ? `Node ${warning.major} 지원이 ${warning.end} 에 끝났음 — 다음 LTS 로 옮겨야 함`
            : `Node ${warning.major} 지원 종료 ${warning.end}(${warning.days}일 남음) — 다음 LTS 로 옮길 계획`);
    }

    const summary = [changes.length ? `바뀜: ${changes.join(', ')}` : '바뀐 것 없음', ...problems].join(' · ');
    const state = problems.length ? 'ATTENTION' : (changes.length ? 'UPDATED' : 'CURRENT');
    log(`${state} ${summary}`);
    if (!dryRun) writeFileSync(STATUS, `${state} ${today} ${summary}\n`);
    recordAlert(problems.length > 0, problems.length ? problems.join(' · ') : summary);
};

if (!dryRun) {
    try { mkdirSync(LOCK); } catch { console.log('다른 점검이 돌고 있어 건너뜀'); process.exit(0); }
}
main().catch((error) => {
    log(`FAILED ${error.message}`);
    if (!dryRun) writeFileSync(STATUS, `FAILED ${today} ${error.message}\n`);
    process.exitCode = 1;
}).finally(() => { if (!dryRun) { try { rmdirSync(LOCK); } catch { /* 이미 없음 */ } } });

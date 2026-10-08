#!/usr/bin/env node
/**
 * 맥미니 서버 점검 요약(2026-10-04, 선생님 결정: 오픈클로로 ① 알림 ② 묻고 답하기까지만).
 *
 *   node scripts/server-status-summary.mjs                요약을 터미널에(오픈클로 `server-status` 스킬이 이것을 부른다)
 *   node scripts/server-status-summary.mjs --send         텔레그램으로 보냄(LaunchAgent com.agit.server-status-brief, 매일 07:30)
 *   node scripts/server-status-summary.mjs --alert-only   문제가 새로 생기거나 풀렸을 때만 보냄(com.agit.server-status-watch, 30분마다)
 *
 * ⚠️ **읽기만 한다.** 재시작·업데이트·삭제를 하지 않는다. 고치는 일은 관문·되돌림이 있는 스크립트(UPDATE_RUNBOOK 등)로 사람이 한다.
 * 텔레그램 받는 사람은 오픈클로에 짝지은 사용자(channel_pairing_allow_entries)를 그때 읽는다 — 번호를 저장소에 적지 않는다.
 * AI 를 부르지 않아 토큰이 들지 않는다.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { sendTelegram } from './lib/telegram.mjs';
import { buildSummary, judgeBackup, judgeCertificates, judgeDisk, judgeRoutine, line } from './lib/serverStatus.mjs';

const HOME = homedir();
const DOCKER = existsSync('/Applications/Docker.app/Contents/Resources/bin/docker') ? '/Applications/Docker.app/Contents/Resources/bin/docker' : 'docker';
const STATE = path.join(HOME, 'backups/auto/server-status-alert.state');
const mode = process.argv.includes('--alert-only') ? 'alert' : process.argv.includes('--send') ? 'send' : 'print';

const run = (command, args, timeout = 20000) => {
    try { return execFileSync(command, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] }).trim(); } catch { return null; }
};
const lastLine = (file) => { try { return readFileSync(file, 'utf8').trim().split('\n').at(-1); } catch { return ''; } };
const sql = (query) => run(DOCKER, ['exec', 'agit-db', 'psql', '-U', 'postgres', '-d', 'postgres', '-Atc', query]);
const httpCode = async (url, init = {}) => {
    try { return (await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(12000), ...init })).status; } catch { return 0; }
};

const kstNow = new Date(Date.now() + 9 * 3600000);
const today = kstNow.toISOString().slice(0, 10);
const yesterday = new Date(kstNow.getTime() - 86400000).toISOString().slice(0, 10);
const at = `${today.slice(5).replace('-', '/')} ${kstNow.toISOString().slice(11, 16)}`;

const collect = async () => {
    const lines = [];
    lines.push(judgeBackup(lastLine(path.join(HOME, 'backups/auto/backup-status.txt')), { today, yesterday, hour: kstNow.getUTCHours() }));

    const monitor = (() => { try { return readFileSync(path.join(HOME, 'Library/Logs/agit-backup-monitor.stdout.log'), 'utf8').trim().split('\n').slice(-8).reverse().find((row) => row.includes('date=')) || ''; } catch { return ''; } })();
    const monitorDay = monitor.match(/date=(\d{4}-\d{2}-\d{2})/)?.[1];
    const monitorOk = /result=PASS/.test(monitor) && (monitorDay === today || (kstNow.getUTCHours() < 6 && monitorDay === yesterday));
    lines.push(line('복구 점검', monitorOk ? 'ok' : 'problem', monitorOk ? `${monitorDay} 실제 복구 시험 통과` : `최근 결과 ${monitorDay || '없음'} ${monitor.match(/result=\w+/)?.[0] || ''}`.trim()));

    const alerts = sql("select alert_key||' '||left(coalesce(detail,''),60) from public.system_alert_events where status='open' order by 1");
    if (alerts === null) lines.push(line('관리자 경고', 'problem', 'DB 에 묻지 못함(DB 응답 없음?)'));
    else lines.push(alerts ? line('관리자 경고', 'problem', alerts.split('\n').join(' / ')) : line('관리자 경고', 'ok', '열린 경고 0건'));

    // 서비스 응답(로컬 주소). 쌤링크만 바깥 주소로 본다(Cloudflare 경로).
    const anon = (() => { try { return readFileSync(path.join(HOME, 'agit-supabase/.env'), 'utf8').match(/^ANON_KEY=(.*)$/m)?.[1]?.replace(/^"|"$/g, ''); } catch { return ''; } })();
    const services = [
        ['아지트', await httpCode('http://127.0.0.1:8300/'), [200]],
        ['로그인 서버', await httpCode('http://127.0.0.1:8100/auth/v1/health', { headers: { apikey: anon || '' } }), [200]],
        ['쌤링크', await httpCode('https://xn--9y2br3k43n.kr/'), [200]],
        ['자비스', await httpCode('http://127.0.0.1:8001/'), [200, 307]],
        ['오픈클로', await httpCode('http://127.0.0.1:18789/'), [200]],
        // 맞춤법 회색 점선 실시간 창구(com.agit.spelling-analyzer, 맥미니 안에서만)
        ['맞춤법 회색 점선', await httpCode('http://127.0.0.1:8791/health'), [200]]
    ];
    const down = services.filter(([, code, okCodes]) => !okCodes.includes(code));
    lines.push(down.length
        ? line('서비스', 'problem', down.map(([name, code]) => `${name} ${code || '응답 없음'}`).join(', '))
        : line('서비스', 'ok', `${services.map(([name]) => name).join('·')} 응답`));

    const containers = run(DOCKER, ['ps', '-a', '--format', '{{.Names}}|{{.Status}}']);
    if (containers === null) lines.push(line('컨테이너', 'problem', '도커가 응답하지 않음'));
    else {
        const rows = containers.split('\n').filter(Boolean).map((row) => row.split('|'));
        const bad = rows.filter(([name, status]) => !/rehearsal|migrate|oneshot/i.test(name) && (/^Exited|unhealthy|Restarting/i.test(status)));
        lines.push(bad.length ? line('컨테이너', 'problem', bad.map(([name, status]) => `${name}(${status.split(' ')[0]})`).join(', ')) : line('컨테이너', 'ok', `${rows.length}개 정상`));
    }

    const freeGb = Number(run('/bin/df', ['-g', '/'])?.split('\n')[1]?.trim().split(/\s+/)[3] || 0);
    const dockerPct = Number(run(DOCKER, ['run', '--rm', '--entrypoint', 'sh', 'caddy:2-alpine', '-c', "df -P / | awk 'NR==2{gsub(/%/,\"\",$5); print $5}'"], 30000) || 0);
    lines.push(judgeDisk(freeGb, dockerPct));

    lines.push(judgeRoutine('오픈클로 업데이트', lastLine(path.join(HOME, 'backups/auto/openclaw-update-status.txt'))));
    lines.push(judgeRoutine('Node 루틴', lastLine(path.join(HOME, 'backups/auto/node-runtime-status.txt'))));
    lines.push(judgeRoutine('Supabase 업데이트', lastLine(path.join(HOME, 'backups/auto/supabase-upgrade-status.txt'))));
    lines.push(judgeRoutine('문집 표지 정리', lastLine(path.join(HOME, 'backups/auto/class-agit-cover-sweep-status.txt'))));
    lines.push(judgeRoutine('맞춤법 자동 검수', lastLine(path.join(HOME, 'backups/auto/spelling-review-auto-status.txt'))));
    // 회색 점선 교차 확인(hunspell·MeCab)이 빠지면 오타 점선이 안 보이는 쪽으로 물러난다 — 빠졌는지 알려 준다.
    const grayHealth = await (async () => {
        try { return await (await fetch('http://127.0.0.1:8791/health', { signal: AbortSignal.timeout(5000) })).json(); } catch { return null; }
    })();
    if (grayHealth) {
        lines.push(grayHealth.cross_check
            ? line('맞춤법 교차 확인', 'ok', 'hunspell·MeCab 켜짐')
            : line('맞춤법 교차 확인', 'problem', '꺼짐 — bash services/spelling-analyzer/setup.sh 로 다시 설치'));
    }
    // 한 달 자동 업데이트는 매달 1일에만 돈다 — 첫 실행 전(기록 없음)에는 줄을 띄우지 않는다.
    const monthlyStatus = lastLine(path.join(HOME, 'backups/auto/spelling-monthly-status.txt'));
    if (monthlyStatus) lines.push(judgeRoutine('맞춤법 한 달 업데이트', monthlyStatus));
    lines.push(judgeRoutine('맞춤법 살펴볼 곳 기록', lastLine(path.join(HOME, 'backups/auto/spelling-shadow-status.txt'))));

    const scan = sql("select to_char(finished_at at time zone 'Asia/Seoul','MM/DD')||'|'||urgent_count||'|'||attention_count from public.system_service_scan_runs where status='SUCCEEDED' or finished_at is not null order by finished_at desc nulls last limit 1");
    if (scan) {
        const [day, urgent, attention] = scan.split('|');
        lines.push(line('보안 취약점', Number(urgent) > 0 ? 'problem' : 'ok', `긴급 ${urgent} · 조치 ${attention}(${day} 검사)`));
    }

    const certs = [];
    for (const [name, host, resolve] of [['아지트', 'xn--vz0ba242ncqcba79xhwx.site', true], ['쌤링크', 'xn--9y2br3k43n.kr', false]]) {
        const out = run('/bin/sh', ['-c', `echo | /usr/bin/openssl s_client -servername ${host} -connect ${resolve ? '127.0.0.1' : host}:443 2>/dev/null | /usr/bin/openssl x509 -noout -enddate 2>/dev/null`]);
        const end = out?.split('=')[1];
        if (end) certs.push({ name, end });
    }
    lines.push(judgeCertificates(certs));
    return lines;
};

const summary = buildSummary(await collect(), { at });
if (mode === 'print') {
    console.log(summary.text);
} else if (mode === 'send') {
    console.log(summary.text);
    sendTelegram(summary.text);
    try { writeFileSync(STATE, summary.problemKey); } catch { /* 다음 알림 비교만 못 할 뿐 */ }
} else {
    // 문제 묶음이 바뀌었을 때만(새로 생김·풀림). 같은 문제는 30분마다 되풀이하지 않는다.
    let previous = '';
    try { previous = readFileSync(STATE, 'utf8'); } catch { /* 처음 */ }
    if (summary.problemKey !== previous) {
        const text = summary.problems ? `🚨 서버 문제 알림\n\n${summary.text}` : `✅ 서버 문제가 풀렸습니다\n\n${summary.text}`;
        if (summary.problems || previous) {
            if (sendTelegram(text)) writeFileSync(STATE, summary.problemKey);
        } else writeFileSync(STATE, summary.problemKey);
    }
    console.log(summary.problems ? `문제 ${summary.problems}건 (${summary.problemKey})` : '문제 없음');
}

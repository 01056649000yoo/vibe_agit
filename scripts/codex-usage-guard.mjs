#!/usr/bin/env node
// Codex 남은 사용량 지킴이 (2026-10-11, 선생님 결정: 남은 사용량이 10% 미만이면 Codex 를 쓰지 않는다).
//
//   node scripts/codex-usage-guard.mjs check [--min-remaining 10]
//       남은 사용량을 읽어 보여 준다. 충분하면 종료 코드 0, 모자라면 3, 읽지 못하면 2(읽지 못하면 쓰지 않는다).
//   node scripts/codex-usage-guard.mjs ask --dir <빈 복사 폴더> --prompt <질문 파일> --out <답 파일> --model <모델> [--effort medium]
//       check 를 먼저 통과해야만 `codex exec` 를 읽기 전용으로 돌리고, 끝나면 남은 사용량을 다시 보여 준다.
//
// 읽는 곳: Codex 앱 서버의 `account/rateLimits/read`(조회만 하므로 사용량이 줄지 않는다). 5시간 창·주간 창 둘 다 본다.
// 한계: 한 번 돌리는 도중에 10% 밑으로 내려가도 그 호출은 끝까지 간다 — 그래서 시작 전에 막는다.
import { spawn } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

export const DEFAULT_MIN_REMAINING = 10;

/** 응답 → 판정. 순수 함수라 검사가 그대로 부른다. */
export function evaluateUsage(result, minRemaining = DEFAULT_MIN_REMAINING) {
    // 앱 서버는 같은 값을 `rateLimits` 와 `rateLimitsByLimitId` 두 곳에 준다 — 한도 이름(limitId)별로 한 번만 센다.
    const byId = new Map(Object.entries(result?.rateLimitsByLimitId || {}));
    if (result?.rateLimits) byId.set(result.rateLimits.limitId || 'codex', result.rateLimits);
    const windows = [];
    for (const [limitId, snap] of byId) {
        const label = byId.size > 1 ? ` ${limitId}` : '';
        for (const [name, w] of [['5시간', snap?.primary], ['주간', snap?.secondary]]) {
            if (w && Number.isFinite(w.usedPercent)) {
                windows.push({ name: `${name}${label}`, remaining: 100 - w.usedPercent, resetsAt: w.resetsAt ?? null, minutes: w.windowDurationMins ?? null });
            }
        }
    }
    if (windows.length === 0) return { ok: false, code: 2, reason: '남은 사용량을 읽지 못했어요(창 정보 없음).', windows };

    const reasons = [];
    if (result?.ordinaryUsageAllowed === false) reasons.push('Codex 가 지금 사용을 허용하지 않아요.');
    if (result?.rateLimits?.spendControlReached) reasons.push('지출 한도에 닿았어요.');
    if (result?.rateLimits?.rateLimitReachedType) reasons.push(`사용량 한도에 닿았어요(${result.rateLimits.rateLimitReachedType}).`);
    for (const w of windows) {
        if (w.remaining < minRemaining) reasons.push(`${w.name} 창 남은 사용량 ${w.remaining}% (기준 ${minRemaining}% 이상)`);
    }
    return reasons.length ? { ok: false, code: 3, reason: reasons.join(' / '), windows } : { ok: true, code: 0, reason: '', windows };
}

export function describeWindows(windows) {
    return windows
        .map((w) => `${w.name} 창 남은 ${w.remaining}%${w.resetsAt ? ` (초기화 ${new Date(w.resetsAt * 1000).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })})` : ''}`)
        .join(' · ');
}

/** codex 앱 서버에 남은 사용량을 묻는다. 실패하면 null. */
export function readRateLimits({ timeoutMs = 25000 } = {}) {
    return new Promise((resolve) => {
        let child;
        try {
            child = spawn('codex', ['app-server'], { stdio: ['pipe', 'pipe', 'ignore'] });
        } catch {
            resolve(null);
            return;
        }
        let buffer = '';
        let done = false;
        const finish = (value) => {
            if (done) return;
            done = true;
            clearTimeout(timer);
            child.kill();
            resolve(value);
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
        child.on('error', () => finish(null));
        child.on('exit', () => finish(null));
        child.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            let index;
            while ((index = buffer.indexOf('\n')) >= 0) {
                const line = buffer.slice(0, index);
                buffer = buffer.slice(index + 1);
                let message;
                try { message = JSON.parse(line); } catch { continue; }
                if (message.id === 1) {
                    send({ method: 'initialized' });
                    send({ id: 2, method: 'account/rateLimits/read', params: { excludeResetCreditDetails: true } });
                } else if (message.id === 2) {
                    finish(message.result || null);
                }
            }
        });
        send({ id: 1, method: 'initialize', params: { clientInfo: { name: 'usage-guard', version: '1' } } });
    });
}

async function check(minRemaining) {
    const result = await readRateLimits();
    const verdict = result ? evaluateUsage(result, minRemaining) : { ok: false, code: 2, reason: '남은 사용량을 읽지 못했어요(Codex 에 연결할 수 없음).', windows: [] };
    if (verdict.windows.length) console.log(describeWindows(verdict.windows));
    console.log(verdict.ok ? `✔ 사용해도 됩니다(기준 남은 ${minRemaining}% 이상).` : `⛔ Codex 를 쓰지 않습니다 — ${verdict.reason}`);
    return verdict;
}

function option(args, name, fallback) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

async function main() {
    const [command, ...args] = process.argv.slice(2);
    const minRemaining = Number(option(args, '--min-remaining', DEFAULT_MIN_REMAINING));
    if (command === 'check') {
        process.exit((await check(minRemaining)).code);
    }
    if (command === 'ask') {
        const dir = option(args, '--dir');
        const promptFile = option(args, '--prompt');
        const out = option(args, '--out');
        if (!dir || !promptFile || !out || !option(args, '--model') || !existsSync(promptFile)) {
            console.error('사용법: ask --dir <폴더> --prompt <질문 파일> --out <답 파일> --model <모델> [--effort medium]');
            process.exit(64);
        }
        // 저장소 폴더(.env.local 같은 비밀 값이 있는 곳)에서는 돌리지 않는다 — 빈 복사 폴더만.
        const resolved = path.resolve(dir);
        if (existsSync(path.join(resolved, '.env.local')) || existsSync(path.join(resolved, '.git'))) {
            console.error('⛔ 이 폴더에는 .env.local 또는 .git 이 있어요. 바뀐 코드만 복사한 빈 폴더에서 돌려 주세요.');
            process.exit(65);
        }
        const before = await check(minRemaining);
        if (!before.ok) process.exit(before.code);
        // 모델 이름은 코드에 적지 않고 부르는 쪽(선생님이 정한 모델)이 지정한다.
        const model = option(args, '--model');
        const effort = option(args, '--effort', 'medium');
        const exit = await new Promise((resolve) => {
            const child = spawn('codex', ['exec', '-m', model, '-c', `model_reasoning_effort="${effort}"`, '-s', 'read-only', '--skip-git-repo-check', '-C', resolved, '-o', out, readFileSync(promptFile, 'utf8')], { stdio: ['ignore', 'ignore', 'inherit'] });
            child.on('exit', (code) => resolve(code ?? 1));
            child.on('error', () => resolve(1));
        });
        console.log(`codex 종료 코드 ${exit}. 호출 뒤 사용량:`);
        await check(minRemaining);
        process.exit(exit);
    }
    console.error('사용법: check | ask  (파일 위 설명 참고)');
    process.exit(64);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    await main();
}

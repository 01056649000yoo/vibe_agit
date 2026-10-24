#!/usr/bin/env node
/**
 * 코드 지도 조회: `npm run map -- <명령> <영문 이름>  (쓸 때마다 저장소 밖 usage.jsonl 에 기록 → `usage` 로 집계)`  (Graphify, 2026-10-25 시험 도입 — docs/wiki/CODE_MAP.md)
 *
 *   affected "이름"   이것을 고치면 영향받는 곳(부르는 곳·가져오는 곳)
 *   explain  "이름"   이것이 무엇과 이어져 있나
 *   query    "이름들" 이름이 나오는 부분 지도
 *   path "A" "B"      두 이름 사이의 가장 짧은 길
 *   status            지도 상태(낡았는지)
 *   update            지금 바로 다시 만들기(보통은 조회할 때 알아서 한다)
 *   usage             지금까지 몇 번 썼는지(2주 평가용)
 *   note 도움됨|아님|놓침 "이유"   직전 조회가 쓸모 있었는지 한 줄 기록(평가용)
 *
 * 지도는 저장소 밖(`CODE_MAP_DIR`, 기본 ~/graphify/vibe-agit)에 둔다 — 공개 저장소에 구조 정보를 올리지 않는다.
 * graphify 가 없으면 한 줄 안내만 하고 끝낸다(다른 컴퓨터·다른 모델에서도 깨지지 않게).
 * 코드(src/)만 읽는다: 로컬 분석이라 외부로 나가는 것이 없고 API 키가 필요 없다. 문서·PDF·이미지는 일부러 넣지 않는다.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { isMapSource, needsEnglishName, needsFullRescan, staleReason } from './codeMapPolicy.mjs';

const OUT = process.env.CODE_MAP_DIR || path.join(homedir(), 'graphify', 'vibe-agit');
const GRAPH = path.join(OUT, 'graphify-out', 'graph.json');
const COUNT_FILE = path.join(OUT, 'source-file-count.txt');
// 사용 기록(저장소 밖): 2주 평가 때 "몇 번, 어떤 질문에, 얼마나 짧은 답"을 세는 근거. 질문 이름만 적고 코드 내용은 적지 않는다.
const USAGE_LOG = path.join(OUT, 'usage.jsonl');
const logUsage = (entry) => {
    try { appendFileSync(USAGE_LOG, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`); } catch { /* 기록 실패는 조회를 막지 않는다 */ }
};
const SRC = 'src';

const findGraphify = () => {
    for (const candidate of [path.join(homedir(), '.local', 'bin', 'graphify'), '/opt/homebrew/bin/graphify', '/usr/local/bin/graphify']) {
        if (existsSync(candidate)) return candidate;
    }
    const which = spawnSync('which', ['graphify'], { encoding: 'utf8' });
    return which.status === 0 ? which.stdout.trim() : '';
};

const scanSources = (dir = SRC) => {
    let count = 0;
    let newest = 0;
    const walk = (current) => {
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            const full = path.join(current, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (isMapSource(entry.name)) { count += 1; newest = Math.max(newest, statSync(full).mtimeMs); }
        }
    };
    if (existsSync(dir)) walk(dir);
    return { count, newest };
};

const run = (bin, args, env = {}) => spawnSync(bin, args, { encoding: 'utf8', env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] });

const state = () => {
    const { count, newest } = scanSources();
    const recorded = existsSync(COUNT_FILE) ? Number(readFileSync(COUNT_FILE, 'utf8')) : null;
    const graphMtime = existsSync(GRAPH) ? statSync(GRAPH).mtimeMs : null;
    const input = { graphMtimeMs: graphMtime, newestSourceMtimeMs: newest, recordedFileCount: recorded, currentFileCount: count };
    return { ...input, reason: staleReason(input), full: needsFullRescan(input) };
};

/** 낡았을 때만 다시 만든다. 성공하면 true. */
export const refreshIfStale = (bin, { quiet = false } = {}) => {
    const current = state();
    if (!current.reason) return true;
    if (!quiet) console.error(`[코드 지도] ${current.reason} — 다시 만드는 중…`);
    const extract = run(bin, ['extract', SRC, '--code-only', '--out', OUT], current.full || current.graphMtimeMs == null ? { GRAPHIFY_FORCE: '1' } : {});
    if (extract.status !== 0) { if (!quiet) console.error(`[코드 지도] 만들지 못했어요: ${(extract.stderr || '').split('\n').filter(Boolean).at(-1) || '알 수 없음'}`); return false; }
    const cluster = run(bin, ['cluster-only', OUT, '--no-label', '--no-viz']);
    if (cluster.status !== 0) {
        // 다음 조회가 다시 시도하도록 파일 수 기록을 지운다(지도 파일 시각만 새로워져 "신선"으로 보이는 것을 막는다).
        try { unlinkSync(COUNT_FILE); } catch { /* 없으면 그대로 */ }
        if (!quiet) console.error('[코드 지도] 묶음 단계가 실패해 지도를 낡은 것으로 둡니다.'); return false; }
    writeFileSync(COUNT_FILE, String(current.currentFileCount));
    return true;
};

/** `npm run recall` 이 쓴다: 이 파일을 부르는 곳 몇 줄(실패하면 빈 배열 — 맥락 보조일 뿐이다). */
export const affectedLines = (file, { depth = 1, max = 12 } = {}) => {
    const bin = findGraphify();
    if (!bin || !existsSync(SRC)) return null;
    if (!refreshIfStale(bin, { quiet: true })) return null;
    const label = path.basename(file);
    const result = run(bin, ['affected', label, '--depth', String(depth), '--graph', GRAPH]);
    if (result.status !== 0) return [];
    const lines = result.stdout.split('\n').filter((line) => line.startsWith('- ')).slice(0, max);
    logUsage({ source: 'recall', command: 'affected', target: label, lines: lines.length, bytes: Buffer.byteLength(result.stdout) });
    return lines;
};

const printUsage = () => {
    if (!existsSync(USAGE_LOG)) { console.log('아직 사용 기록이 없어요.'); return 0; }
    const all = readFileSync(USAGE_LOG, 'utf8').split('\n').filter(Boolean).map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
    const rows = all.filter((row) => row.source !== 'note'); // 조회만 센다(평가 메모는 따로)
    const by = (key) => rows.reduce((acc, row) => ({ ...acc, [row[key]]: (acc[row[key]] || 0) + 1 }), {});
    const bytes = rows.reduce((sum, row) => sum + (row.bytes || 0), 0);
    console.log(`조회 ${rows.length}번 (첫 기록 ${rows[0]?.at?.slice(0, 10) || '-'} · 마지막 ${rows.at(-1)?.at?.slice(0, 10) || '-'})`);
    console.log('명령별:', JSON.stringify(by('command')), '· 경로별:', JSON.stringify(by('source')));
    console.log(`답 크기 합계 ${Math.round(bytes / 1024 * 10) / 10}KB (평균 ${rows.length ? Math.round(bytes / rows.length) : 0}B) · 결과 없음 ${rows.filter((row) => !row.lines).length}번`);
    const verdicts = all.filter((row) => row.source === 'note');
    if (verdicts.length) console.log(`평가 메모 ${verdicts.length}개 — 도움됨 ${verdicts.filter((row) => row.verdict === '도움됨').length} · 아님 ${verdicts.filter((row) => row.verdict === '아님').length} · 지도가 놓침 ${verdicts.filter((row) => row.verdict === '놓침').length}`);
    console.log(`최근: ${rows.slice(-5).map((row) => `${row.command} ${row.target}`).join(' | ')}`);
    return 0;
};

const main = () => {
    const [command, ...rest] = process.argv.slice(2);
    const bin = findGraphify();
    if (!command || command === 'help') {
        console.log('쓰는 법: npm run map -- affected|explain|query|path|status|update <영문 이름>   (docs/wiki/CODE_MAP.md)');
        return 0;
    }
    if (!bin) {
        console.log('코드 지도 도구(graphify)가 이 컴퓨터에 없어요. 없어도 작업에는 지장이 없고, 평소처럼 grep 으로 찾으면 됩니다. 설치: docs/wiki/CODE_MAP.md');
        return 0;
    }
    if (command === 'status') {
        const current = state();
        console.log(current.reason ? `낡음: ${current.reason}` : '신선함 — 지도 이후 바뀐 소스 없음');
        console.log(`지도 위치: ${GRAPH}`);
        return 0;
    }
    if (command === 'update') return refreshIfStale(bin) ? 0 : 1;
    if (command === 'usage') return printUsage();
    if (command === 'note') { // 직전 조회가 도움이 됐는지 한 줄로 남긴다: npm run map -- note 도움됨|아님 "이유"
        logUsage({ source: 'note', command: 'note', target: rest.join(' ').slice(0, 200), verdict: ['도움됨', '아님', '놓침'].find((word) => rest[0] === word) || '' });
        console.log('기록했어요.');
        return 0;
    }
    if (!['affected', 'explain', 'query', 'path'].includes(command)) { console.log(`모르는 명령: ${command}`); return 2; }
    if (rest.length === 0) { console.log(`무엇을 찾을까요? 예: npm run map -- ${command} PlazaPostModal`); return 2; }
    if (needsEnglishName(rest.join(' '))) console.error('[코드 지도] 한글 질문은 못 찾아요. 함수·파일·컴포넌트의 영문 이름으로 물어 보세요(예: PlazaPostModal, buildSeat).');
    if (!refreshIfStale(bin)) return 1;
    const started = Date.now();
    const result = spawnSync(bin, [command, ...rest, '--graph', GRAPH], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
    if (result.stdout) process.stdout.write(result.stdout);
    logUsage({ source: 'cli', command, target: rest.join(' ').slice(0, 120), lines: (result.stdout || '').split('\n').filter(Boolean).length, bytes: Buffer.byteLength(result.stdout || ''), ms: Date.now() - started, exit: result.status ?? 1 });
    return result.status ?? 1;
};

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());

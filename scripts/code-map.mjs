#!/usr/bin/env node
/**
 * 코드 지도 조회: `npm run map -- <명령> <영문 이름>`  (Graphify, 2026-10-25 시험 도입 — docs/wiki/CODE_MAP.md)
 *
 *   affected "이름"   이것을 고치면 영향받는 곳(부르는 곳·가져오는 곳)
 *   explain  "이름"   이것이 무엇과 이어져 있나
 *   query    "이름들" 이름이 나오는 부분 지도
 *   path "A" "B"      두 이름 사이의 가장 짧은 길
 *   status            지도 상태(낡았는지)
 *   update            지금 바로 다시 만들기(보통은 조회할 때 알아서 한다)
 *
 * 지도는 저장소 밖(`CODE_MAP_DIR`, 기본 ~/graphify/vibe-agit)에 둔다 — 공개 저장소에 구조 정보를 올리지 않는다.
 * graphify 가 없으면 한 줄 안내만 하고 끝낸다(다른 컴퓨터·다른 모델에서도 깨지지 않게).
 * 코드(src/)만 읽는다: 로컬 분석이라 외부로 나가는 것이 없고 API 키가 필요 없다. 문서·PDF·이미지는 일부러 넣지 않는다.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { isMapSource, needsEnglishName, needsFullRescan, staleReason } from './codeMapPolicy.mjs';

const OUT = process.env.CODE_MAP_DIR || path.join(homedir(), 'graphify', 'vibe-agit');
const GRAPH = path.join(OUT, 'graphify-out', 'graph.json');
const COUNT_FILE = path.join(OUT, 'source-file-count.txt');
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
    if (cluster.status !== 0) { if (!quiet) console.error('[코드 지도] 묶음 단계가 실패해 지도를 낡은 것으로 둡니다.'); return false; }
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
    return result.stdout.split('\n').filter((line) => line.startsWith('- ')).slice(0, max);
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
    if (!['affected', 'explain', 'query', 'path'].includes(command)) { console.log(`모르는 명령: ${command}`); return 2; }
    if (rest.length === 0) { console.log(`무엇을 찾을까요? 예: npm run map -- ${command} PlazaPostModal`); return 2; }
    if (needsEnglishName(rest.join(' '))) console.error('[코드 지도] 한글 질문은 못 찾아요. 함수·파일·컴포넌트의 영문 이름으로 물어 보세요(예: PlazaPostModal, buildSeat).');
    if (!refreshIfStale(bin)) return 1;
    const result = spawnSync(bin, [command, ...rest, '--graph', GRAPH], { stdio: 'inherit' });
    return result.status ?? 1;
};

if (import.meta.url === `file://${process.argv[1]}`) process.exit(main());

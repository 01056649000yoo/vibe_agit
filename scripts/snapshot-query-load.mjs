#!/usr/bin/env node
/**
 * 하루 DB 부하를 장부에 남긴다(2026-09-27).
 *
 * `pg_stat_statements` 는 DB 를 다시 켜면 지워져서, 평일 학교 시간의 부하를 나중에 볼 수 없었다(9/27 점검 때 토요일 하루치만 남음).
 * 매일 밤 한 번 누적값을 읽어 "어제와의 차이" 를 한 줄로 쌓는다. DB 는 **읽기만** 한다.
 *
 *   node scripts/snapshot-query-load.mjs            오늘 줄을 장부에 더한다
 *   node scripts/snapshot-query-load.mjs --dry      계산만 하고 쓰지 않는다
 *   node scripts/snapshot-query-load.mjs --report   장부를 요약해 보여 준다(날짜별·평일 평균·많이 쓴 함수)
 *
 * 장부: $AGIT_QUERY_LOAD_DIR(기본 ~/backups/query-load)/ledger.jsonl, 다음 날 견줄 누적은 state.json.
 * 예약: ops/launchd/com.agit.query-load-snapshot.plist (매일 23:55).
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { computeDailyLoad, summarizeLedger } from './queryLoadLedger.mjs';

const CONTAINER = process.env.AGIT_DB_CONTAINER || 'agit-db';
const DB_USER = process.env.AGIT_DB_READ_USER || 'postgres';
const DIR = process.env.AGIT_QUERY_LOAD_DIR || path.join(os.homedir(), 'backups', 'query-load');
const LEDGER = path.join(DIR, 'ledger.jsonl');
const STATE = path.join(DIR, 'state.json');
const args = new Set(process.argv.slice(2));

const readLedger = () => (existsSync(LEDGER)
    ? readFileSync(LEDGER, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line))
    : []);

if (args.has('--report')) {
    const summary = summarizeLedger(readLedger());
    if (!summary.days.length) {
        console.log(`장부가 비어 있습니다: ${LEDGER}`);
        process.exit(0);
    }
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    console.log('날짜        요일  호출 수   DB 시간(초)  기준');
    for (const day of summary.days) {
        console.log(`${day.date}  ${dayNames[day.weekday]}   ${String(day.calls).padStart(8)}  ${(day.totalMs / 1000).toFixed(1).padStart(10)}  ${day.baseline === 'previous-snapshot' ? '하루치' : '재시작 뒤 누적'}`);
    }
    const avg = summary.weekdayAverage;
    console.log(`\n평일 평균(하루치 ${avg.count}일): 호출 ${avg.calls}회 · DB 시간 ${(avg.totalMs / 1000).toFixed(1)}초`);
    if (summary.peak) console.log(`가장 바쁜 날: ${summary.peak.date} · DB 시간 ${(summary.peak.totalMs / 1000).toFixed(1)}초`);
    console.log('\n많이 쓴 함수(장부 전체 합):');
    for (const item of summary.top) console.log(`  ${(item.totalMs / 1000).toFixed(1).padStart(8)}초  ${String(item.calls).padStart(8)}회  ${item.name}`);
    process.exit(0);
}

const json = (sql) => JSON.parse(execFileSync('docker', [
    'exec', CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres', '-t', '-A', '-c', sql
], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }).trim() || 'null');

const current = json(`
    SELECT json_build_object(
        'statsReset', (SELECT stats_reset FROM pg_stat_statements_info)::text,
        'rows', COALESCE((
            SELECT json_agg(json_build_object(
                'queryid', s.queryid::text, 'calls', s.calls, 'totalMs', s.total_exec_time,
                -- 함수 이름은 쿼리 글 전체에서 뽑는다. PostgREST 쿼리는 이름이 300자 뒤에 나와 앞부분만 자르면 놓친다.
                'name', COALESCE(substring(s.query from '"public"\\."([a-z0-9_]+)"'), substring(s.query from 'public\\.([a-z0-9_]+)\\s*\\(')),
                'query', left(s.query, 120)
            ))
            FROM pg_stat_statements s
            WHERE s.dbid = (SELECT oid FROM pg_database WHERE datname = 'postgres')
        ), '[]'::json)
    );
`);
const previous = existsSync(STATE) ? JSON.parse(readFileSync(STATE, 'utf8')) : null;
const { entry, state } = computeDailyLoad(previous, current);
const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const line = { date, takenAt: new Date().toISOString(), ...entry };

console.log(`${date} · 호출 ${line.calls}회 · DB 시간 ${(line.totalMs / 1000).toFixed(1)}초 · ${line.baseline === 'previous-snapshot' ? '어제와의 차이' : '통계 초기화 뒤 누적'}`);
for (const item of line.top.slice(0, 5)) console.log(`  ${(item.totalMs / 1000).toFixed(1).padStart(7)}초 ${String(item.calls).padStart(7)}회 평균 ${item.meanMs}ms  ${item.name}`);

if (args.has('--dry')) {
    console.log('--dry: 장부에 쓰지 않았습니다.');
    process.exit(0);
}
mkdirSync(DIR, { recursive: true });
appendFileSync(LEDGER, `${JSON.stringify(line)}\n`);
writeFileSync(STATE, JSON.stringify(state));
console.log(`장부에 더했습니다: ${LEDGER}`);

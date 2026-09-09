#!/usr/bin/env node

/*
 * 안 쓰이는 인덱스·함수를 **여러 번에 걸쳐** 기록한다.
 *
 * 왜 한 번 재고 끝내면 안 되나:
 *   1) 포스트그레스의 사용 통계(`idx_scan`)는 **DB 를 다시 켜면 0 으로 돌아간다.**
 *      "내년에 다시 재서 그때도 0이면 지운다"는 방법은, 그 사이에 컨테이너가 한 번이라도
 *      재시작되면 **모든 인덱스가 0 으로 보인다.** 그대로 지우면 멀쩡한 인덱스를 지운다.
 *   2) 학기말·방학에만 쓰는 기능이 있다. 열흘치로 "안 쓴다"고 단정할 수 없다.
 *
 * 그래서 이 도구는 **잰 값을 장부에 누적한다.** 한 번이라도 쓰인 적이 있으면 `쓰임` 으로 남고,
 * 그 뒤 DB 가 재시작돼 0 으로 보여도 장부는 기억한다. 지울지는 장부의 **관찰 기간**과
 * **한 번도 안 쓰임**을 함께 보고 판단한다.
 *
 *   npm run db:usage         재서 장부에 더하고 문서를 새로 쓴다
 *   npm run db:usage -- --dry  재기만 하고 장부는 건드리지 않는다
 *
 * 제약(PK·UNIQUE)이 받치는 인덱스는 후보에서 뺀다. 그것은 속도가 아니라 **올바름**을 지킨다.
 * 안 쓰인다고 지우면 중복 데이터가 들어온다.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const CONTAINER = process.env.AGIT_DB_CONTAINER || 'agit-db';
const DB_USER = process.env.AGIT_DB_USER || 'supabase_admin';
const LEDGER = 'ops/db-usage-ledger.json';
const REPORT = 'docs/DB_UNUSED_OBJECTS.md';
const dryRun = process.argv.includes('--dry');

const psql = (sql) => execFileSync('docker', [
    'exec', CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres', '-t', '-A', '-F', '\t', '-c', sql
], { encoding: 'utf8' }).trim();

const rows = (sql) => psql(sql).split('\n').filter(Boolean).map((line) => line.split('\t'));

// 제약이 받치는 인덱스는 빼고 센다. 크기도 함께 적어 지웠을 때 얼마를 버는지 보이게 한다.
const INDEX_SQL = `
SELECT s.relname || '.' || s.indexrelname, s.idx_scan, pg_relation_size(s.indexrelid)
FROM pg_stat_user_indexes s
LEFT JOIN pg_constraint c ON c.conindid = s.indexrelid
WHERE s.schemaname = 'public' AND c.conname IS NULL
ORDER BY 1;`;

const FUNCTION_SQL = `
SELECT p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')',
       COALESCE(f.calls, 0)
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
LEFT JOIN pg_stat_user_functions f ON f.funcid = p.oid
WHERE p.prorettype <> 'trigger'::regtype
ORDER BY 1;`;

const startedAt = psql(`SELECT pg_postmaster_start_time()::timestamp(0)::text;`);
const trackFunctions = psql(`SHOW track_functions;`);
const today = new Date().toISOString().slice(0, 10);

const ledger = existsSync(LEDGER)
    ? JSON.parse(readFileSync(LEDGER, 'utf8'))
    : { version: 1, checks: [], indexes: {}, functions: {} };

/** 이번에 잰 값을 장부에 더한다. **한 번이라도** 쓰였으면 그것을 기억한다. */
const merge = (book, name, used, extra = {}) => {
    const before = book[name] || { firstSeen: today, everUsed: false, checks: 0 };
    book[name] = {
        ...before, ...extra,
        checks: before.checks + 1,
        lastSeen: today,
        everUsed: before.everUsed || used,
        ...(used ? { lastUsedCheck: today } : {}),
    };
};

for (const [name, scans, size] of rows(INDEX_SQL)) {
    merge(ledger.indexes, name, Number(scans) > 0, { bytes: Number(size) });
}
// 통계가 꺼져 있으면 함수는 세지 않는다. 0 을 "안 쓴다"로 적으면 장부가 거짓말을 한다.
if (trackFunctions !== 'none') {
    for (const [name, calls] of rows(FUNCTION_SQL)) merge(ledger.functions, name, Number(calls) > 0);
}

ledger.checks.push({ date: today, dbStartedAt: startedAt, trackFunctions });

const unusedIndexes = Object.entries(ledger.indexes).filter(([, item]) => !item.everUsed);
const unusedFunctions = Object.entries(ledger.functions).filter(([, item]) => !item.everUsed);
const totalBytes = unusedIndexes.reduce((sum, [, item]) => sum + (item.bytes || 0), 0);
const firstCheck = ledger.checks[0].date;
const days = Math.round((Date.parse(today) - Date.parse(firstCheck)) / 86400000);

console.log(`잰 날 ${today} · DB 켜진 시각 ${startedAt} · 함수 통계 ${trackFunctions}`);
console.log(`관찰 ${ledger.checks.length}회 (${firstCheck} 부터 ${days}일)`);
console.log(`한 번도 안 쓰인 인덱스 ${unusedIndexes.length}개 (${(totalBytes / 1048576).toFixed(1)}MB)`);
console.log(trackFunctions === 'none'
    ? '함수: 호출 통계가 꺼져 있어 세지 않았습니다(track_functions=none).'
    : `한 번도 안 불린 함수 ${unusedFunctions.length}개`);

if (dryRun) { console.log('\n(--dry 라서 장부와 문서를 쓰지 않았습니다.)'); process.exit(0); }

writeFileSync(LEDGER, `${JSON.stringify(ledger, null, 1)}\n`);

const list = (entries, format) => (entries.length
    ? entries.map(([name, item]) => `- ${format(name, item)}`).join('\n')
    : '- (없음)');

writeFileSync(REPORT, `# 안 쓰이는 DB 인덱스·함수 관찰 장부

> \`npm run db:usage\` 가 이 문서를 다시 쓴다. **손으로 고치지 않는다.**
> 원본 기록은 \`${LEDGER}\` 이고, 이 문서는 사람이 읽는 요약이다.

## 왜 한 번에 지우지 않나

포스트그레스의 사용 통계는 **DB 를 다시 켜면 0 으로 돌아간다.** "내년에 다시 재서 0이면 지운다"만
믿으면, 그 사이 컨테이너가 한 번이라도 재시작됐을 때 **멀쩡한 인덱스까지 0 으로 보인다.**
그래서 이 장부는 잰 값을 **누적**한다 — 한 번이라도 쓰인 적이 있으면 계속 기억한다.

학기말·방학에만 쓰는 기능도 있다. **최소 한 학년도(12개월)** 를 관찰하고 지운다.

제약(PK·UNIQUE)이 받치는 인덱스는 애초에 목록에 넣지 않는다. 그것은 속도가 아니라 **올바름**을
지킨다 — 안 쓰인다고 지우면 중복 데이터가 들어온다.

## 지금 상태

| | |
|---|---|
| 관찰 횟수 | ${ledger.checks.length}회 |
| 관찰 기간 | ${firstCheck} ~ ${today} (${days}일) |
| 한 번도 안 쓰인 인덱스 | **${unusedIndexes.length}개** (${(totalBytes / 1048576).toFixed(1)}MB) |
| 한 번도 안 불린 함수 | ${trackFunctions === 'none' ? '세지 않음 (\`track_functions=none\`)' : `**${unusedFunctions.length}개**`} |

${days < 365 ? `> ⚠️ 아직 ${days}일치다. **${365 - days}일 더** 관찰한 뒤 판단한다.` : '> 한 학년도를 채웠다. 아래 목록을 지울지 판단할 수 있다.'}

## 한 번도 쓰이지 않은 인덱스

${list(unusedIndexes, (name, item) => `\`${name}\` — ${((item.bytes || 0) / 1024).toFixed(0)}KB · ${item.checks}회 관찰 · ${item.firstSeen}부터`)}

## 한 번도 불리지 않은 함수

${trackFunctions === 'none'
        ? `- 호출 통계가 꺼져 있다(\`track_functions = none\`). 켜기 전에는 "안 불린다"를 알 수 없다.\n`
          + '- 켜려면: `ALTER SYSTEM SET track_functions = \'pl\'; SELECT pg_reload_conf();` (재시작 불필요)\n'
          + '- 켜지 않아도 `npm run check:rpc-surface` 가 "클라이언트에 열려 있는데 아무 데서도 안 부르는 것"은 이미 막는다.'
        : list(unusedFunctions, (name, item) => `\`${name}\` — ${item.checks}회 관찰 · ${item.firstSeen}부터`)}

## 관찰 기록

| 잰 날 | DB 켜진 시각 | 함수 통계 |
|---|---|---|
${ledger.checks.map((check) => `| ${check.date} | ${check.dbStartedAt} | ${check.trackFunctions} |`).join('\n')}

*DB 켜진 시각이 바뀌었다면 그 사이 재시작이 있었다는 뜻이고, 그때 통계는 0부터 다시 쌓였다.*
`);

console.log(`\n장부 ${LEDGER} · 문서 ${REPORT} 를 갱신했습니다.`);

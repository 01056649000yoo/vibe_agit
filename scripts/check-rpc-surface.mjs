#!/usr/bin/env node

/*
 * 운영 DB에 쓰지 않는 RPC가 쌓이는 것을 막는다.
 *
 * 왜 필요한가 (2026-08-26에 실제로 터진 일):
 *   새 판(`_v2`, `_v3`)을 만들면서 옛 판을 지우지 않는 습관이 있었다. 옛 판은 앱이 안 부르니
 *   눈에 안 띄지만 **권한은 그대로 열려 있다.** `record_comment_ai_review` 가 그랬다 —
 *   SECURITY DEFINER 인데 `authenticated` 에게 열려 있어서, 학생이 브라우저에서 한 번 부르면
 *   자기 댓글이 AI 검사 없이 곧바로 승인됐다. 앱 코드만 훑는 검사로는 절대 못 잡는다.
 *   코드에 없다는 것이 바로 위험 신호이기 때문이다.
 *
 *   반대 실수도 같이 막는다. `get_student_spelling_entries_v1` 은 이 저장소에 참조가 하나도
 *   없어서 죽은 줄 알았는데, **같은 DB를 쓰는 연구소 앱**이 아직 부르고 있었다. 지웠으면
 *   오류도 없이 학급 맞춤법 항목이 빈 목록이 됐을 것이다.
 *
 * 그래서 두 가지를 한꺼번에 본다.
 *   1. 새 판이 있는데 옛 판이 아직 클라이언트에 열려 있나
 *   2. 클라이언트에 열려 있는데 이 저장소에도, 함께 쓰는 다른 앱에도 참조가 없나
 *
 * 둘 중 하나에 걸리면 **지우거나, 남기는 이유를 허용 목록에 적어야** 통과한다.
 * 이유를 적게 하는 것이 핵심이다 — 다음 사람이 오늘처럼 처음부터 다시 캐지 않아도 된다.
 *
 * DB나 도커를 볼 수 없는 곳(다른 컴퓨터, 도커 꺼짐)에서는 막지 않고 건너뛴다.
 */

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const DB_CONTAINER = process.env.AGIT_DB_CONTAINER || 'agit-db';
const DB_USER = process.env.AGIT_DB_USER || 'postgres';
const ALLOWLIST_PATH = 'ops/rpc-surface-allowlist.json';

// 이 저장소에서 RPC 이름이 나올 수 있는 곳.
const REPO_SEARCH_PATHS = ['src', 'supabase', 'scripts', 'tests', 'e2e'];

const RED = '[31m';
const YELLOW = '[33m';
const GREEN = '[32m';
const OFF = '[0m';

const runQuiet = (file, args) => {
    try {
        return execFileSync(file, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    } catch {
        return null;
    }
};

const psql = (sql) => runQuiet('docker', [
    'exec', DB_CONTAINER, 'psql', '-U', DB_USER, '-d', 'postgres', '-t', '-A', '-F', '|', '-c', sql
]);

/** 클라이언트(로그인 사용자·비로그인)가 부를 수 있는 함수 목록. 트리거 함수는 부를 수 없으므로 뺀다. */
const CALLABLE_SQL = `
SELECT DISTINCT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prorettype <> 'trigger'::regtype
  AND (has_function_privilege('authenticated', p.oid, 'EXECUTE')
       OR has_function_privilege('anon', p.oid, 'EXECUTE'))
ORDER BY 1;`;

/** DB 에 있는 모든 함수 이름. 허용 목록이 이미 없는 이름을 가리키는지 볼 때 쓴다. */
const ALL_FUNCTIONS_SQL = `
SELECT DISTINCT p.proname
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY 1;`;

/** 더 높은 판이 있는데 아직 남아 있는 옛 판. */
const SUPERSEDED_SQL = `
WITH f AS (
  SELECT p.proname, p.oid,
         regexp_replace(p.proname, '_v[0-9]+$', '') AS base,
         (regexp_match(p.proname, '_v([0-9]+)$'))[1]::INT AS ver,
         (has_function_privilege('authenticated', p.oid, 'EXECUTE')
          OR has_function_privilege('anon', p.oid, 'EXECUTE')) AS client_callable
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prorettype <> 'trigger'::regtype AND p.proname ~ '_v[0-9]+$'
)
SELECT f.proname
FROM f
WHERE f.client_callable
  AND EXISTS (SELECT 1 FROM f g WHERE g.base = f.base AND g.ver > f.ver)
ORDER BY f.proname;`;

const parseNames = (output) => String(output || '')
    .split('\n')
    .map((line) => line.split('|')[0].trim())
    .filter(Boolean);

/** 이 저장소 어딘가에 이름이 나오는가. */
const referencedInRepo = (name) => runQuiet('grep', ['-rqF', name, ...REPO_SEARCH_PATHS]) !== null;

/** 같은 DB를 쓰는 다른 앱의 배포본 어딘가에 이름이 나오는가. */
const referencedInConsumer = (name, consumer) => {
    const result = runQuiet('docker', [
        'exec', consumer.container, 'sh', '-c',
        `grep -rqF '${name}' ${consumer.paths.join(' ')} 2>/dev/null`
    ]);
    return result !== null;
};

const main = async () => {
    let allowlist;
    try {
        allowlist = JSON.parse(await readFile(ALLOWLIST_PATH, 'utf8'));
    } catch {
        console.error(`${RED}✖ ${ALLOWLIST_PATH} 를 읽지 못했습니다.${OFF}`);
        process.exit(1);
    }

    const allowed = new Map((allowlist.keep || []).map((item) => [item.name, item]));
    const consumers = allowlist.externalConsumers || [];

    // 이유는 썩는다. 부르던 쪽이 새 판으로 옮겨 가면 이유는 조용히 거짓이 되는데,
    // 목록의 값어치는 통째로 "적힌 이유는 믿을 수 있다"에 걸려 있다.
    // 실제로 2026-08-27 점검에서 이유 8개 중 3개가 사실과 달랐다.
    // DB 없이도 돌아야 하므로 아래 DB 조회보다 먼저 본다.
    const STALE_AFTER_DAYS = 120;
    const today = new Date();
    const unchecked = [];
    const staleReasons = [];
    for (const item of allowed.values()) {
        if (!item.reasonCheckedAt) {
            unchecked.push(item.name);
            continue;
        }
        const days = Math.floor((today - new Date(item.reasonCheckedAt)) / 86400000);
        if (days > STALE_AFTER_DAYS) staleReasons.push(`${item.name}(${days}일 전)`);
    }
    if (unchecked.length || staleReasons.length) {
        console.log(`${YELLOW}· 허용 목록의 이유를 다시 확인할 때가 됐습니다.${OFF}`);
        if (unchecked.length) console.log(`  확인 날짜 없음: ${unchecked.join(', ')}`);
        if (staleReasons.length) console.log(`  ${STALE_AFTER_DAYS}일 넘게 확인 안 함: ${staleReasons.join(', ')}`);
        console.log('  이유에 적힌 "누가 부른다"가 아직 사실인지 보고 reasonCheckedAt 을 갱신하세요.');
    }

    const callableRaw = psql(CALLABLE_SQL);
    if (callableRaw === null) {
        console.log(`${YELLOW}· 운영 DB를 보지 못해 RPC 표면 검사는 건너뜁니다.${OFF}`);
        return;
    }
    const callable = parseNames(callableRaw);
    const superseded = parseNames(psql(SUPERSEDED_SQL));

    // 어느 앱이 켜져 있는지 먼저 확인한다. 꺼진 앱은 "참조 없음"으로 단정하지 않는다.
    const reachable = [];
    const unreachable = [];
    for (const consumer of consumers) {
        if (runQuiet('docker', ['exec', consumer.container, 'true']) === null) unreachable.push(consumer);
        else reachable.push(consumer);
    }

    const problems = [];

    for (const name of superseded) {
        if (allowed.has(name)) continue;
        problems.push({
            name,
            why: '더 새로운 판이 있는데 옛 판이 아직 클라이언트에 열려 있습니다.'
        });
    }

    for (const name of callable) {
        if (allowed.has(name) || superseded.includes(name)) continue;
        if (referencedInRepo(name)) continue;
        if (reachable.some((consumer) => referencedInConsumer(name, consumer))) continue;
        problems.push({
            name,
            why: '클라이언트에 열려 있는데 이 저장소에도, 켜져 있는 다른 앱에도 참조가 없습니다.'
        });
    }

    // 허용 목록에 적어 뒀는데 이미 사라진 함수는 목록에서 빼도록 알려 준다.
    // 클라이언트에 열려 있지 않아도(service_role 전용·내부 도우미) DB 에 있으면 살아 있는 것이다.
    // 여기서 `callable` 만 보면 그런 항목을 "없어졌다"고 잘못 알려 주고,
    // 그 말을 따라 지우면 이번엔 마이그레이션 검사가 막는다.
    const allFunctions = parseNames(psql(ALL_FUNCTIONS_SQL));
    const stale = [...allowed.keys()].filter((name) => !allFunctions.includes(name));

    if (unreachable.length) {
        console.log(`${YELLOW}· 꺼져 있어 확인하지 못한 앱: ${unreachable.map((c) => c.container).join(', ')}${OFF}`);
        console.log('  이 앱들이 쓰는 RPC는 "참조 없음"으로 판정하지 않았습니다.');
    }

    if (stale.length) {
        console.log(`${YELLOW}· 허용 목록에 있으나 DB에 없는 이름: ${stale.join(', ')}${OFF}`);
        console.log(`  ${ALLOWLIST_PATH} 에서 지워 주세요.`);
    }

    if (problems.length) {
        console.error(`\n${RED}✖ 정리하지 않은 RPC 가 ${problems.length}개 있습니다.${OFF}\n`);
        for (const problem of problems) {
            console.error(`    ${problem.name}`);
            console.error(`      ${problem.why}`);
        }
        console.error(`\n  ${YELLOW}지우거나${OFF}, 남겨야 한다면 ${YELLOW}${ALLOWLIST_PATH}${OFF} 에 이유를 적으세요.`);
        console.error('  이유를 적어 두면 다음 사람이 "이거 지워도 되나"를 처음부터 다시 캐지 않아도 됩니다.\n');
        process.exit(1);
    }

    console.log(
        `${GREEN}✔ RPC 표면 정상 — 클라이언트 공개 ${callable.length}개, `
        + `이유를 적어 남긴 것 ${allowed.size}개.${OFF}`
    );
};

await main();

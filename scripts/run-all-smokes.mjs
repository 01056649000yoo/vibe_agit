#!/usr/bin/env node
/**
 * tests/sql 의 모든 롤백 스모크를 하나씩 운영 스키마에서 돌린다(2026-09-28).
 *
 * 왜: 스모크 174개 중 npm 스크립트에 걸린 것은 일부뿐이라, 나머지는 아무도 안 돌리는 사이 46개가 낡아 깨져 있었다.
 * 이제 전부를 이 한 명령이 돌리고 `npm run test:security` 가 이 명령을 부른다. 새 스모크는 파일만 두면 저절로 들어온다.
 *
 * 규칙
 *  - 파일마다 따로 `BEGIN … ROLLBACK`. 파일 안의 BEGIN/COMMIT/ROLLBACK 줄은 걷어 낸다(run-rollback-smoke.mjs 와 같다).
 *  - **아직 적용 전**인 마이그레이션을 모두 먼저 싣는다(배포 뒤 스키마 기준). 적용된 것은 다시 싣지 않는다.
 *  - 잠금 3초·문장 60초 제한. 운영 표를 오래 붙잡지 않는다.
 *  - 스모크가 아닌 도구 SQL(`*.smoke.sql` 이 아닌 파일)은 돌리지 않는다.
 *
 *   npm run smoke:all              전부
 *   npm run smoke:all -- 202612    이름에 202612 가 들어간 것만
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const container = process.env.AGIT_DB_CONTAINER || 'agit-db';
const databaseUser = process.env.AGIT_DB_USER || 'supabase_admin';
const filter = process.argv[2] || '';
const psqlArgs = ['exec', '-i', container, 'psql', '-U', databaseUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q'];
const stripTransaction = (sql) => sql
  .replace(/^\s*BEGIN;\s*$/gmi, '')
  .replace(/^\s*(COMMIT|ROLLBACK);\s*$/gmi, '');

let applied;
try {
  applied = new Set(execFileSync('docker', [...psqlArgs, '-t', '-A', '-c', 'SELECT filename FROM public.applied_migrations;'],
    { encoding: 'utf8' }).trim().split('\n'));
} catch (error) {
  console.error(`DB 에 붙지 못했습니다(${container}). 맥미니에서 실행해 주세요.`);
  console.error(String(error.stderr || error.message).trim());
  process.exit(1);
}

// 아직 적용 전인 마이그레이션은 모든 스모크 앞에 싣는다 — 배포 뒤 스키마 기준으로 본다.
// (적용 전 수정이 옛 스모크까지 초록으로 바꾸는지 여기서 확인된다. 예: 20261356 이 20261116 ② 를 되살림)
const pendingMigrations = readdirSync('supabase/migrations')
  .filter((file) => file.endsWith('.sql') && !applied.has(file)).sort();
const prerequisite = pendingMigrations
  .map((file) => stripTransaction(readFileSync(path.join('supabase/migrations', file), 'utf8')))
  .join('\n');
if (pendingMigrations.length) console.log(`적용 전 마이그레이션 ${pendingMigrations.length}개를 먼저 싣습니다: ${pendingMigrations.join(', ')}`);

const smokes = readdirSync('tests/sql').filter((file) => file.endsWith('.smoke.sql') && file.includes(filter)).sort();
const failures = [];
for (const file of smokes) {
  const input = [
    'BEGIN;',
    "SET LOCAL lock_timeout = '3s';",
    "SET LOCAL statement_timeout = '60s';",
    prerequisite,
    stripTransaction(readFileSync(path.join('tests/sql', file), 'utf8')),
    'ROLLBACK;',
  ].join('\n');
  try {
    execFileSync('docker', psqlArgs, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (error) {
    const message = String(error.stderr || error.message).split('\n')
      .filter((line) => /ERROR|오류/.test(line)).slice(0, 2).join(' / ').slice(0, 300);
    failures.push({ file, message });
  }
}

console.log(`롤백 스모크 ${smokes.length - failures.length}/${smokes.length} 통과 — 스키마·데이터 변경은 모두 롤백했습니다.`);
for (const { file, message } of failures) console.log(`  ✖ ${file}\n      ${message}`);
process.exit(failures.length ? 1 : 0);

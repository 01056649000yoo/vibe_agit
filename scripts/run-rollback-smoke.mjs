#!/usr/bin/env node

/** 적용된 DB 함수의 기능 스모크를 실행하고 모든 데이터 변경을 롤백한다. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const requestedFile = process.argv[2];
if (!requestedFile) {
  console.error('사용법: node scripts/run-rollback-smoke.mjs tests/sql/<파일>.sql');
  process.exit(1);
}

const resolvedFile = path.resolve(requestedFile);
const allowedRoot = `${path.resolve('tests/sql')}${path.sep}`;
if (!resolvedFile.startsWith(allowedRoot) || !resolvedFile.endsWith('.sql')) {
  console.error('tests/sql 아래 SQL 파일만 실행할 수 있습니다.');
  process.exit(1);
}

const container = process.env.AGIT_DB_CONTAINER || 'agit-db';
const databaseUser = process.env.AGIT_DB_USER || 'supabase_admin';
const source = readFileSync(resolvedFile, 'utf8')
  .replace(/^\s*BEGIN;\s*$/gmi, '')
  .replace(/^\s*(COMMIT|ROLLBACK);\s*$/gmi, '');

try {
  execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', databaseUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: `BEGIN;\n${source}\nROLLBACK;\n`, encoding: 'utf8', stdio: ['pipe', 'inherit', 'pipe'] }
  );
  console.log(`${path.basename(resolvedFile)} 통과 — 데이터 변경은 모두 롤백했습니다.`);
} catch (error) {
  console.error(String(error.stderr || error.message).trim());
  process.exit(1);
}

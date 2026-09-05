#!/usr/bin/env node

/** 적용된 DB 함수의 기능 스모크를 실행하고 모든 데이터 변경을 롤백한다. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { planRollbackMigrations } from './lib/rollback-smoke-plan.mjs';

const requestedFile = process.argv[2];
const requestedMigrations = process.argv.slice(3);
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

const migrationSources = [];
for (const requestedMigration of requestedMigrations) {
  const resolvedMigration = path.resolve(requestedMigration);
  const allowedMigrationRoot = `${path.resolve('supabase/migrations')}${path.sep}`;
  if (!resolvedMigration.startsWith(allowedMigrationRoot) || !resolvedMigration.endsWith('.sql')) {
    console.error('선행 마이그레이션은 supabase/migrations 아래 SQL 파일만 사용할 수 있습니다.');
    process.exit(1);
  }
  migrationSources.push({ name: path.basename(resolvedMigration), source: readFileSync(resolvedMigration, 'utf8') });
}

const container = process.env.AGIT_DB_CONTAINER || 'agit-db';
const databaseUser = process.env.AGIT_DB_USER || 'supabase_admin';
try {
  const appliedRows = migrationSources.length ? execFileSync('docker', [
    'exec', container, 'psql', '-U', databaseUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A',
    '-c', 'SELECT filename, checksum FROM public.applied_migrations;'
  ], { encoding: 'utf8' }).trim() : '';
  const applied = new Map(appliedRows ? appliedRows.split('\n').map((row) => row.split('|')) : []);
  const pending = planRollbackMigrations(migrationSources, applied);
  const source = `${pending.map((item) => item.source).join('\n')}\n${readFileSync(resolvedFile, 'utf8')}`
    .replace(/^\s*BEGIN;\s*$/gmi, '')
    .replace(/^\s*(COMMIT|ROLLBACK);\s*$/gmi, '');
  execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', databaseUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1'],
    { input: `BEGIN;\n${source}\nROLLBACK;\n`, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }
  );
  console.log(`선행 SQL ${pending.length}개 검증 · 적용 완료 ${migrationSources.length - pending.length}개 재실행 제외`);
  console.log(`${path.basename(resolvedFile)} 통과 — 스키마·데이터 변경은 모두 롤백했습니다.`);
} catch (error) {
  console.error(String(error.stderr || error.message).trim().split('\n').filter((line) => !line.startsWith('CONTEXT:') && !line.startsWith('DETAIL:')).map((line) => line.replace(/: [\[{].*$/, ': (응답 본문 생략)')).join('\n'));
  process.exit(1);
}

#!/usr/bin/env node

/** 아직 적용하지 않은 SQL을 실제 DB 스키마에서 실행하되 마지막에 모두 롤백한다. */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const container = process.env.AGIT_DB_CONTAINER || 'agit-db';
const databaseUser = process.env.AGIT_DB_USER || 'supabase_admin';
const migrationsDirectory = 'supabase/migrations';

const runPsql = (sql, input) => execFileSync(
  'docker',
  ['exec', '-i', container, 'psql', '-U', databaseUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
    ...(input ? [] : ['-t', '-A', '-c', sql])],
  { input, encoding: 'utf8' }
);

const appliedRows = runPsql('SELECT filename FROM public.applied_migrations;').trim();
const applied = new Set(appliedRows ? appliedRows.split('\n') : []);
const pending = readdirSync(migrationsDirectory)
  .filter((file) => file.endsWith('.sql') && !applied.has(file))
  .sort();

if (pending.length === 0) {
  console.log('롤백 검증할 미적용 마이그레이션이 없습니다.');
  process.exit(0);
}

const prerequisiteSources = [];
for (const file of pending) {
  const source = readFileSync(path.join(migrationsDirectory, file), 'utf8')
    .replace(/^\s*BEGIN;\s*$/gmi, '')
    .replace(/^\s*COMMIT;\s*$/gmi, '');
  const smokePath = path.join('tests/sql', file.replace(/\.sql$/, '.smoke.sql'));
  const smoke = existsSync(smokePath) ? readFileSync(smokePath, 'utf8') : '';
  process.stdout.write(`롤백 검증 중  ${file} ... `);
  try {
    runPsql(null, `BEGIN;\n${prerequisiteSources.join('\n')}\n${source}\n${smoke}\nROLLBACK;\n`);
    // A later migration must see the schema created by earlier pending files.
    // Earlier smoke fixtures are excluded; each target gets an independent rollback.
    prerequisiteSources.push(source);
    console.log('통과');
  } catch (error) {
    console.log('실패');
    console.error(String(error.stderr || error.message).trim());
    process.exit(1);
  }
}

console.log(`${pending.length}개 SQL을 실제 스키마에서 검증했고 변경은 모두 롤백했습니다.`);

/**
 * 마이그레이션 적용 도구.
 *
 *   npm run migrate:status   아직 적용 안 된 파일 보기 (DB 를 건드리지 않는다)
 *   npm run migrate          안 된 것만 순서대로 적용하고 기록
 *
 * 왜 필요한가:
 *   이 저장소는 마이그레이션을 손으로 적용하고 여러 모델이 번갈아 작업한다.
 *   예전에는 "적용했는지"를 알려면 레포의 함수·인덱스 정의를 실물과 전수 대조해야 했다.
 *   이제 `public.applied_migrations` 에 기록이 남는다.
 *
 * 어디에 붙는가:
 *   맥미니의 `agit-db` 도커 컨테이너. `supabase-db` 는 **다른 앱**의 DB다 — 헷갈리지 말 것.
 *   스키마 소유자는 `supabase_admin` 이다. `postgres` 는 일부 신규 표만 소유해 기존 표 변경에 실패한다.
 *   (이 스크립트는 맥미니에서 돌린다. 다른 기기에서는 컨테이너가 없어 실패한다.)
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const CONTAINER = process.env.AGIT_DB_CONTAINER || 'agit-db';
const DATABASE_USER = process.env.AGIT_DB_USER || 'supabase_admin';
const MIGRATIONS_DIR = 'supabase/migrations';
const TRACKING_TABLE = 'public.applied_migrations';
const statusOnly = process.argv.includes('--status');

const psql = (sql, { input } = {}) => execFileSync(
    'docker',
    ['exec', '-i', CONTAINER, 'psql', '-U', DATABASE_USER, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1',
        ...(input ? [] : ['-t', '-A', '-F', '', '-c', sql])],
    { input, encoding: 'utf8' }
);

const checksumOf = (file) => createHash('sha256')
    .update(readFileSync(path.join(MIGRATIONS_DIR, file)))
    .digest('hex');

const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

let applied;
try {
    const rows = psql(`SELECT filename, checksum FROM ${TRACKING_TABLE};`).trim();
    applied = new Map(rows ? rows.split('\n').map((line) => line.split('')) : []);
} catch (err) {
    if (String(err.stderr || err.message).includes('does not exist')) {
        console.error(`기록 표가 아직 없습니다. 먼저 20260814_migration_tracking.sql 을 한 번 적용해 주세요.\n`
            + `  docker exec -i ${CONTAINER} psql -U ${DATABASE_USER} -d postgres -v ON_ERROR_STOP=1 < ${MIGRATIONS_DIR}/20260814_migration_tracking.sql`);
        process.exit(1);
    }
    console.error(`DB 에 붙지 못했습니다. 컨테이너·역할을 확인해 주세요(현재: ${CONTAINER} / ${DATABASE_USER}).`);
    console.error(String(err.stderr || err.message).trim());
    process.exit(1);
}

const pending = files.filter((f) => !applied.has(f));
// 이미 적용된 파일이 그 뒤에 수정된 경우. 자동으로 다시 적용하지 않는다 — 사람이 판단할 일이다.
const drifted = files.filter((f) => applied.has(f) && applied.get(f) !== checksumOf(f) && applied.get(f) !== '(신규)');

console.log(`파일 ${files.length}개 / 적용됨 ${applied.size}개 / 남은 것 ${pending.length}개\n`);

if (drifted.length) {
    console.log('⚠ 적용된 뒤에 내용이 바뀐 파일 — 자동으로 다시 적용하지 않습니다:');
    drifted.forEach((f) => console.log(`   ${f}`));
    console.log('   바뀐 내용을 반영하려면 새 마이그레이션 파일로 만드세요.\n');
}

if (pending.length === 0) {
    console.log('적용할 것이 없습니다.');
    process.exit(0);
}

console.log('적용 대기:');
pending.forEach((f) => console.log(`   ${f}`));

if (statusOnly) {
    console.log('\n(--status 라서 적용하지 않았습니다.)');
    process.exit(0);
}

console.log('');
for (const file of pending) {
    process.stdout.write(`적용 중  ${file} ... `);
    try {
        // 파일마다 자기 BEGIN/COMMIT 을 갖고 있어 여기서 또 감싸지 않는다.
        psql(null, { input: readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8') });
    } catch (err) {
        console.log('실패');
        console.error(String(err.stderr || err.message).trim());
        console.error(`\n${file} 에서 멈췄습니다. 이 파일부터 다시 확인해 주세요.`);
        process.exit(1);
    }

    // 적용 직후에 기록한다. 기록이 실패하면 다음에 이 파일이 다시 대기 목록에 뜬다.
    psql(`INSERT INTO ${TRACKING_TABLE} (filename, checksum, applied_by)
          VALUES ('${file}', '${checksumOf(file)}', 'scripts/migrate.mjs')
          ON CONFLICT (filename) DO UPDATE SET checksum = EXCLUDED.checksum, applied_at = NOW();`);
    console.log('완료');
}

console.log(`\n${pending.length}개 적용했습니다.`);

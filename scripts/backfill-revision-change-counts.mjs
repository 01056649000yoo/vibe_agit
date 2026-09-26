#!/usr/bin/env node
/**
 * 이미 승인된 글의 고친 자리 수(`student_posts.revision_change_count`)를 한 번 채운다(2026-09-26, 20261352 뒤).
 *
 * 새 글은 교사가 승인할 때 화면이 세어 저장한다. 그 전에 승인된 글은 수가 비어 목록 카드에 `🖍️ N군데 고침` 이
 * 뜨지 않으므로, 화면과 **같은 규칙**(src/modules/writing/review/writingDiff.js)으로 세어 넣는다.
 *
 *   node scripts/backfill-revision-change-counts.mjs          # 세기만 한다(쓰지 않음)
 *   node scripts/backfill-revision-change-counts.mjs --write  # 실제로 넣는다(한 트랜잭션)
 *
 * 맥미니의 agit-db 컨테이너에 붙는다. 이미 수가 있는 글은 건드리지 않는다(두 번 돌려도 안전하다).
 */
import { execFileSync } from 'node:child_process';
import { diffWritingText } from '../src/modules/writing/review/writingDiff.js';

const container = process.env.AGIT_DB_CONTAINER || 'agit-db';
const databaseUser = process.env.AGIT_DB_USER || 'supabase_admin';
const write = process.argv.includes('--write');
const BATCH = 500;

const psql = (args, input) => execFileSync(
    'docker',
    ['exec', '-i', container, 'psql', '-U', databaseUser, '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', ...args],
    { input, encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }
);

const raw = psql(['-At', '-c', `
    SELECT COALESCE(json_agg(json_build_object('id', id, 'o', original_content, 'c', content)), '[]'::json)
    FROM public.student_posts
    WHERE is_confirmed IS TRUE
      AND revision_change_count IS NULL
      AND NULLIF(original_content, '') IS NOT NULL;
`]);
const rows = JSON.parse(raw.trim() || '[]');

const counts = rows.map((row) => ({
    id: row.id,
    count: Math.min(diffWritingText(row.o, row.c).changeCount, 999)
}));
const changed = counts.filter((item) => item.count > 0).length;
console.log(`승인된 글 중 처음 글이 있고 수가 빈 글: ${counts.length}편 (고친 곳이 있는 글 ${changed}편)`);

if (!write) {
    console.log('--write 없이 돌려 쓰지 않았습니다.');
    process.exit(0);
}

const statements = ["BEGIN;", "SELECT set_config('agit.revision_writer', 'on', true);"];
for (let index = 0; index < counts.length; index += BATCH) {
    const values = counts.slice(index, index + BATCH)
        .map((item) => `('${item.id}'::UUID, ${Number(item.count)})`)
        .join(',\n');
    statements.push(`UPDATE public.student_posts post
SET revision_change_count = source.count
FROM (VALUES ${values}) AS source(id, count)
WHERE post.id = source.id
  AND post.is_confirmed IS TRUE
  AND post.revision_change_count IS NULL;`);
}
statements.push("SELECT set_config('agit.revision_writer', '', true);", 'COMMIT;');
psql(['-q'], statements.join('\n'));

const left = psql(['-At', '-c', `
    SELECT count(*) FROM public.student_posts
    WHERE is_confirmed IS TRUE AND revision_change_count IS NULL AND NULLIF(original_content, '') IS NOT NULL;
`]).trim();
console.log(`넣었습니다. 아직 빈 글: ${left}편`);

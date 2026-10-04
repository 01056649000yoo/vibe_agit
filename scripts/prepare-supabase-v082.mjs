#!/usr/bin/env node
/**
 * Supabase self-hosted v0.8.0 → v0.8.2 반영본 만들기(2026-10-04, 선생님 결정으로 연휴에 앞당김).
 *
 * 라이브 스택(~/agit-supabase, v0.8.0 + 우리 수정)에서 출발해 **이미지 태그만** 공식 v0.8.2 로 바꾸고,
 * 공식 v0.8.2 의 서버 함수 메인 워커(`volumes/functions/main/index.ts`, 새 `deno.jsonc`)와 공식 업데이트 도구
 * (`update.sh`·`upgrades.json`)를 가져온다. Kong(3.9.3)·kong.yml·DB 버전(17.6.1.136)은 v0.8.2 에서도 같아 그대로 둔다.
 * `PGRST_APP_SETTINGS_JWT_SECRET` 은 공식에서 빠졌지만 남겨 둔다(쓰는 DB 함수 0개 확인, 바꿀 것을 줄인다).
 *
 *   node scripts/prepare-supabase-v082.mjs --source ~/agit-supabase --official <공식 v0.8.2 docker 폴더> --destination <빈 폴더>
 */
import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const sourceRoot = args.get('--source');
const officialRoot = args.get('--official');
const destinationRoot = args.get('--destination');
if (!sourceRoot || !officialRoot || !destinationRoot) {
    console.error('usage: prepare-supabase-v082.mjs --source <live-stack> --official <v0.8.2-docker> --destination <empty-dir>');
    process.exit(2);
}

const TARGET_REF = 'self-hosted/v0.8.2';
// 공식 v0.8.2 묶음(docker-compose.yml·docker-compose.logs.yml)의 태그. 바뀌지 않는 것: kong 3.9.3, postgres 17.6.1.136, vector 0.53.0-alpine.
const IMAGE_UPDATES = [
    ['supabase/studio:2026.08.03-sha-022b374', 'supabase/studio:2026.09.07-sha-7996410'],
    ['supabase/gotrue:v2.189.0', 'supabase/gotrue:v2.196.0'],
    ['postgrest/postgrest:v14.12', 'postgrest/postgrest:v14.17'],
    ['supabase/realtime:v2.102.3', 'supabase/realtime:v2.134.10'],
    ['supabase/storage-api:v1.60.4', 'supabase/storage-api:v1.74.0'],
    ['darthsim/imgproxy:v3.30.1', 'darthsim/imgproxy:v3.31.4'],
    ['supabase/postgres-meta:v0.96.6', 'supabase/postgres-meta:v0.99.0'],
    ['supabase/edge-runtime:v1.74.0', 'supabase/edge-runtime:v1.76.2'],
    ['supabase/logflare:1.43.1', 'supabase/logflare:1.50.10'],
    ['supabase/supavisor:2.9.5', 'supabase/supavisor:2.9.12']
];

const replaceExact = (input, before, after, label) => {
    const count = input.split(before).length - 1;
    if (count !== 1) throw new Error(`${label}: 정확히 한 곳이어야 하는데 ${count} 곳`);
    return input.split(before).join(after);
};

const load = (relativePath) => readFile(path.join(sourceRoot, relativePath), 'utf8');
let compose = await load('docker-compose.yml');
for (const [before, after] of IMAGE_UPDATES) compose = replaceExact(compose, before, after, `이미지 ${before}`);

const files = new Map([
    ['docker-compose.yml', compose],
    ['docker-compose.pg17.yml', await load('docker-compose.pg17.yml')],
    ['docker-compose.agit.yml', await load('docker-compose.agit.yml')],
    ['volumes/api/kong.yml', await load('volumes/api/kong.yml')],
    ['volumes/api/kong-entrypoint.sh', await load('volumes/api/kong-entrypoint.sh')],
    ['volumes/functions/main/index.ts', await readFile(path.join(officialRoot, 'volumes/functions/main/index.ts'), 'utf8')],
    ['volumes/functions/deno.jsonc', await readFile(path.join(officialRoot, 'volumes/functions/deno.jsonc'), 'utf8')],
    ['update.sh', await readFile(path.join(officialRoot, 'update.sh'), 'utf8')],
    ['upgrades.json', await readFile(path.join(officialRoot, 'upgrades.json'), 'utf8')],
    ['.supabase-version', `ref=${TARGET_REF}\n`]
]);

await mkdir(destinationRoot, { recursive: false });
const manifest = [];
for (const [relativePath, content] of files) {
    const destination = path.join(destinationRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, content, { mode: relativePath.endsWith('.sh') ? 0o755 : 0o600 });
    if (relativePath.endsWith('.sh')) await chmod(destination, 0o755);
    manifest.push(`${createHash('sha256').update(content).digest('hex')}  ${relativePath}`);
}
await writeFile(path.join(destinationRoot, 'SHA256SUMS'), `${manifest.join('\n')}\n`, { mode: 0o600 });
console.log(`prepared ${TARGET_REF}: ${files.size} files`);

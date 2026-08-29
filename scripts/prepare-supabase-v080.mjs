#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const sourceRoot = args.get('--source');
const officialRoot = args.get('--official');
const destinationRoot = args.get('--destination');

if (!sourceRoot || !officialRoot || !destinationRoot) {
  console.error('usage: prepare-supabase-v080.mjs --source <live-stack> --official <v0.8.0-docker> --destination <empty-dir>');
  process.exit(2);
}

const targetRef = 'self-hosted/v0.8.0';
const files = new Map();

async function load(relativePath) {
  return readFile(path.join(sourceRoot, relativePath), 'utf8');
}

function replaceExact(input, before, after, label, expected = 1) {
  const count = input.split(before).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} source match(es), found ${count}`);
  }
  return input.split(before).join(after);
}

let compose = await load('docker-compose.yml');
const imageUpdates = [
  ['supabase/studio:2026.04.08-sha-205cbe7', 'supabase/studio:2026.08.03-sha-022b374'],
  ['kong/kong:3.9.1', 'kong/kong:3.9.3'],
  ['supabase/gotrue:v2.186.0', 'supabase/gotrue:v2.189.0'],
  ['postgrest/postgrest:v14.8', 'postgrest/postgrest:v14.12'],
  ['supabase/realtime:v2.76.5', 'supabase/realtime:v2.102.3'],
  ['supabase/storage-api:v1.48.26', 'supabase/storage-api:v1.60.4'],
  ['supabase/postgres-meta:v0.96.3', 'supabase/postgres-meta:v0.96.6'],
  ['supabase/edge-runtime:v1.71.2', 'supabase/edge-runtime:v1.74.0'],
  ['supabase/logflare:1.36.1', 'supabase/logflare:1.43.1'],
  ['supabase/postgres:17.6.1.084', 'supabase/postgres:17.6.1.136'],
  ['supabase/supavisor:2.7.4', 'supabase/supavisor:2.9.5'],
];
for (const [before, after] of imageUpdates) {
  compose = replaceExact(compose, before, after, `image ${before}`);
}

compose = replaceExact(
  compose,
  '      KONG_DNS_NOT_FOUND_TTL: 1\n      KONG_PLUGINS:',
  '      KONG_DNS_NOT_FOUND_TTL: 1\n      KONG_DNS_VALID_TTL: 5\n      KONG_ROUTER_FLAVOR: expressions\n      KONG_PLUGINS:',
  'Kong DNS/router settings',
);
compose = replaceExact(
  compose,
  '    entrypoint: /home/kong/kong-entrypoint.sh',
  '    entrypoint: ["/bin/sh", "/home/kong/kong-entrypoint.sh"]',
  'Kong entrypoint',
);
compose = replaceExact(
  compose,
  '      #GOTRUE_JWT_KEYS: ${JWT_KEYS:-[]}\n\n      GOTRUE_EXTERNAL_EMAIL_ENABLED:',
  '      #GOTRUE_JWT_KEYS: ${JWT_KEYS:-[]}\n\n      GOTRUE_JWT_ISSUER: ${API_EXTERNAL_URL}\n\n      GOTRUE_EXTERNAL_EMAIL_ENABLED:',
  'Auth issuer',
);
compose = replaceExact(
  compose,
  '      # GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${API_EXTERNAL_URL}/auth/v1/callback',
  '      # GOTRUE_EXTERNAL_GOOGLE_REDIRECT_URI: ${API_EXTERNAL_URL}/callback',
  'Google OAuth callback example',
);
compose = replaceExact(
  compose,
  '      # GOTRUE_EXTERNAL_GITHUB_REDIRECT_URI: ${API_EXTERNAL_URL}/auth/v1/callback',
  '      # GOTRUE_EXTERNAL_GITHUB_REDIRECT_URI: ${API_EXTERNAL_URL}/callback',
  'GitHub OAuth callback example',
);
compose = replaceExact(
  compose,
  '      # GOTRUE_EXTERNAL_AZURE_REDIRECT_URI: ${API_EXTERNAL_URL}/auth/v1/callback',
  '      # GOTRUE_EXTERNAL_AZURE_REDIRECT_URI: ${API_EXTERNAL_URL}/callback',
  'Azure OAuth callback example',
);
compose = replaceExact(
  compose,
  '    environment:\n      PGRST_DB_URI:',
  '    healthcheck:\n      test: ["CMD", "postgrest", "--ready"]\n      interval: 5s\n      timeout: 5s\n      retries: 3\n    environment:\n      PGRST_DB_URI:',
  'PostgREST healthcheck',
);
compose = replaceExact(
  compose,
  '      PGRST_DB_ANON_ROLE: anon\n      # PostgREST accepts',
  '      PGRST_DB_ANON_ROLE: anon\n      PGRST_ADMIN_SERVER_PORT: 3001\n      PGRST_ADMIN_SERVER_HOST: localhost\n      # PostgREST accepts',
  'PostgREST admin health port',
);
compose = replaceExact(
  compose,
  '      DB_ENC_KEY: supabaserealtime',
  '      DB_ENC_KEY: ${REALTIME_DB_ENC_KEY:-supabaserealtime}',
  'Realtime encryption key compatibility',
);
compose = replaceExact(
  compose,
  '      PG_META_DB_USER: supabase_admin',
  '      PG_META_DB_USER: postgres',
  'Postgres Meta role',
);
compose = replaceExact(
  compose,
  '    depends_on:\n      kong:\n        condition: service_healthy\n    environment:\n      # Legacy symmetric HS256 key',
  '    depends_on:\n      kong:\n        condition: service_healthy\n    healthcheck:\n      test: ["CMD-SHELL", "timeout 1 bash -c \'</dev/tcp/127.0.0.1/9000\'"]\n      interval: 5s\n      timeout: 5s\n      retries: 3\n    environment:\n      # Legacy symmetric HS256 key',
  'Edge Runtime healthcheck',
);
compose = replaceExact(
  compose,
  '      POSTGRES_PORT: ${POSTGRES_PORT}\n      POSTGRES_DB: ${POSTGRES_DB}\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n      DATABASE_URL: ecto://supabase_admin:',
  '      POSTGRES_PORT: ${POSTGRES_PORT}\n      POSTGRES_HOST: ${POSTGRES_HOST}\n      POSTGRES_DB: ${POSTGRES_DB}\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n      DATABASE_URL: ecto://supabase_admin:',
  'Supavisor Postgres host',
);

let pg17 = await load('docker-compose.pg17.yml');
pg17 = replaceExact(
  pg17,
  'supabase/postgres:17.6.1.084',
  'supabase/postgres:17.6.1.136',
  'PG17 override image',
);

files.set('docker-compose.yml', compose);
files.set('docker-compose.pg17.yml', pg17);
files.set('docker-compose.agit.yml', await load('docker-compose.agit.yml'));
files.set('volumes/api/kong.yml', await readFile(path.join(officialRoot, 'volumes/api/kong.yml'), 'utf8'));
files.set('volumes/api/kong-entrypoint.sh', await readFile(path.join(officialRoot, 'volumes/api/kong-entrypoint.sh'), 'utf8'));
files.set('volumes/functions/main/index.ts', await readFile(path.join(officialRoot, 'volumes/functions/main/index.ts'), 'utf8'));
files.set('update.sh', await readFile(path.join(officialRoot, 'update.sh'), 'utf8'));
files.set('upgrades.json', await readFile(path.join(officialRoot, 'upgrades.json'), 'utf8'));
files.set('.supabase-version', `ref=${targetRef}\n`);

await mkdir(destinationRoot, { recursive: false });
const manifest = [];
for (const [relativePath, content] of files) {
  const destination = path.join(destinationRoot, relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, content, { mode: relativePath.endsWith('.sh') ? 0o755 : 0o600 });
  if (relativePath.endsWith('.sh')) await chmod(destination, 0o755);
  const digest = createHash('sha256').update(content).digest('hex');
  manifest.push(`${digest}  ${relativePath}`);
}
await writeFile(path.join(destinationRoot, 'SHA256SUMS'), `${manifest.join('\n')}\n`, { mode: 0o600 });

console.log(`prepared ${targetRef}: ${files.size} files`);

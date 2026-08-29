/* eslint-disable security/detect-non-literal-fs-filename -- fixed repository fixture URLs */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const prepareSource = readFile(new URL('../scripts/prepare-supabase-v080.mjs', import.meta.url), 'utf8');
const applySource = readFile(new URL('../scripts/apply-supabase-v080.sh', import.meta.url), 'utf8');
const rehearsalSource = readFile(new URL('../scripts/rehearse-supabase-v080.sh', import.meta.url), 'utf8');
const plistSource = readFile(new URL('../ops/launchd/com.agit.supabase-upgrade-v080.plist', import.meta.url), 'utf8');
const overrideSource = readFile(new URL('../ops/supabase-v080/docker-compose.rehearsal.yml', import.meta.url), 'utf8');
const ownerSource = readFile(new URL('../scripts/normalize-supabase-restore-owners.sql', import.meta.url), 'utf8');

test('Supabase v0.8.0 update stays pinned and keeps the current Kong compatibility boundary', async () => {
  const prepare = await prepareSource;
  const apply = await applySource;
  const pinnedSources = `${prepare}\n${apply}`;

  for (const version of [
    'self-hosted/v0.8.0',
    'supabase/studio:2026.08.03-sha-022b374',
    'kong/kong:3.9.3',
    'supabase/gotrue:v2.189.0',
    'postgrest/postgrest:v14.12',
    'supabase/realtime:v2.102.3',
    'supabase/storage-api:v1.60.4',
    'darthsim/imgproxy:v3.30.1',
    'supabase/postgres-meta:v0.96.6',
    'supabase/edge-runtime:v1.74.0',
    'supabase/logflare:1.43.1',
    'supabase/postgres:17.6.1.136',
    'supabase/supavisor:2.9.5',
  ]) {
    assert.ok(pinnedSources.includes(version), `${version} must remain pinned`);
  }
  assert.doesNotMatch(prepare, /image:\s*[^\n]+:latest/);
  assert.match(apply, /agit-kong/);
  assert.match(prepare, /KONG_ROUTER_FLAVOR: expressions/);
  assert.match(prepare, /REALTIME_DB_ENC_KEY:-supabaserealtime/);
});

test('scheduled production update is gated by rehearsal, backup, monitoring, checksums and rollback', async () => {
  const apply = await applySource;
  const plist = await plistSource;

  assert.match(apply, /EXPECTED_DAY="2026-08-30"/);
  assert.match(apply, /shasum -a 256 -c SHA256SUMS/);
  assert.match(apply, /PASS 2026-08-29/);
  assert.match(apply, /date=2026-08-30 result=PASS/);
  assert.match(apply, /backup-status\.txt/);
  assert.match(apply, /rollback_config/);
  assert.match(apply, /config\.tar\.gz/);
  assert.match(apply, /pre-v080\.dump/);
  assert.match(apply, /realtime-openapi 403/);
  assert.match(apply, /realtime-tenants 403/);
  assert.match(apply, /WS_CODE.*101/s);

  assert.match(plist, /<key>Month<\/key>\s*<integer>8<\/integer>/);
  assert.match(plist, /<key>Day<\/key>\s*<integer>30<\/integer>/);
  assert.match(plist, /<key>Hour<\/key>\s*<integer>5<\/integer>/);
  assert.match(plist, /<key>Minute<\/key>\s*<integer>30<\/integer>/);
});

test('isolated rehearsal restores service ownership and cannot reuse production containers or ports', async () => {
  const rehearsal = await rehearsalSource;
  const override = await overrideSource;
  const owners = await ownerSource;

  assert.match(rehearsal, /normalize-supabase-restore-owners\.sql/);
  assert.match(rehearsal, /DROP SCHEMA IF EXISTS _realtime CASCADE/);
  assert.match(rehearsal, /realtime-openapi 403/);
  assert.match(rehearsal, /realtime-tenants 403/);
  assert.match(override, /name: agit-rehearsal/);
  assert.match(override, /127\.0\.0\.1:18100:8000/);
  assert.doesNotMatch(override, /127\.0\.0\.1:8100:8000/);
  assert.match(owners, /OWNER TO supabase_auth_admin/);
  assert.match(owners, /OWNER TO supabase_storage_admin/);
});

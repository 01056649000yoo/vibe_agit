import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('Supabase v0.8.2 반영본은 공식 묶음 태그로 고정하고 Kong 3.9.3·Postgres 17.6.1.136 은 그대로 둔다', async () => {
    const [prepare, apply] = await Promise.all([read('scripts/prepare-supabase-v082.mjs'), read('scripts/apply-supabase-v082.sh')]);
    for (const version of [
        'self-hosted/v0.8.2', 'supabase/studio:2026.09.07-sha-7996410', 'supabase/gotrue:v2.196.0', 'postgrest/postgrest:v14.17',
        'supabase/realtime:v2.134.10', 'supabase/storage-api:v1.74.0', 'darthsim/imgproxy:v3.31.4', 'supabase/postgres-meta:v0.99.0',
        'supabase/edge-runtime:v1.76.2', 'supabase/logflare:1.50.10', 'supabase/supavisor:2.9.12'
    ]) {
        assert.ok(`${prepare}\n${apply}`.includes(version), `${version} 이 고정돼 있어야 한다`);
    }
    assert.match(apply, /'kong\/kong:3\.9\.3'/);
    assert.match(apply, /'supabase\/postgres:17\.6\.1\.136'/);
    assert.doesNotMatch(prepare, /kong\/kong:3\.9\.3', 'kong/, 'Kong 은 v0.8.2 에서도 같아 바꾸지 않는다');
    assert.doesNotMatch(prepare, /:latest/);
    // 공식 v0.8.2 의 메인 워커와 새 deno.jsonc 를 가져온다.
    assert.match(prepare, /volumes\/functions\/main\/index\.ts/);
    assert.match(prepare, /volumes\/functions\/deno\.jsonc/);
});

test('v0.8.2 적용은 리허설·백업·감시·체크섬 관문을 지나야 하고, 실패하면 설정과 이미지를 되돌린다(새 deno.jsonc 는 지운다)', async () => {
    const apply = await read('scripts/apply-supabase-v082.sh');
    assert.match(apply, /EXPECTED_DAY="2026-10-04"/);
    assert.match(apply, /shasum -a 256 -c SHA256SUMS/);
    assert.match(apply, /grep -q "\^PASS \$EXPECTED_DAY " "\$REHEARSAL_STATUS"/);
    assert.match(apply, /date=\$EXPECTED_DAY result=PASS/);
    assert.match(apply, /rollback_config/);
    assert.match(apply, /for file in \.supabase-version update\.sh upgrades\.json volumes\/functions\/deno\.jsonc; do/);
    assert.match(apply, /remove-on-rollback\.txt/);
    assert.match(apply, /pre-v082\.dump/);
    assert.match(apply, /realtime-openapi 403/);
    assert.match(apply, /WS_CODE.*101/s);
    // 메인 워커가 바뀌므로 서버 함수를 하나씩 확인한다(배포 스크립트와 같은 기대값).
    assert.match(apply, /edge function \$fn expected \$expected/);
    assert.match(apply, /expected=401; \[ "\$fn" = vibe-ai \] && expected=400/);
});

test('v0.8.2 리허설은 운영 컨테이너·포트를 쓰지 않고, 서버 함수 응답까지 본다', async () => {
    const rehearsal = await read('scripts/rehearse-supabase-v082.sh');
    assert.match(rehearsal, /ops\/supabase-v080\/docker-compose\.rehearsal\.yml/);
    assert.match(rehearsal, /127\.0\.0\.1:18100\/functions\/v1\/\$fn/);
    assert.doesNotMatch(rehearsal, /127\.0\.0\.1:8100\//);
    assert.match(rehearsal, /supabase\/storage-api:v1\.74\.0/);
    assert.match(rehearsal, /target=self-hosted\/v0\.8\.2/);
});

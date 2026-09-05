import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPublicReadHandler } from '../supabase/functions/class-agit-public-read/handler.js';
import { buildSharePeriod, MAX_SHARE_PERIOD_MS } from '../src/modules/class-agit/public/sharePeriod.js';
import { CLASS_AGIT_LIMITS } from '../src/modules/class-agit/policy.js';
const sql = readFileSync('supabase/migrations/20261243_class_agit_frozen_public_reads.sql', 'utf8');
const fn = (name) => sql.split(`CREATE OR REPLACE FUNCTION public.${name}(`)[1]?.split('$$;')[0] || '';
const body = { p_token: 'a'.repeat(64), p_room: 10, p_work_id: null, p_publication_no: null };
const request = (payload = body, options = {}) => new Request('http://test.invalid/functions/v1/class-agit-public-read', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), ...options });

test('외부 전시 기간은 30일 이하이며 잘못된 시간·역순·초과는 거절한다', () => {
    const start = '2026-09-05T00:00:00.000Z';
    assert.equal(MAX_SHARE_PERIOD_MS, CLASS_AGIT_LIMITS.externalExpiryDays * 86400000);
    assert.equal(buildSharePeriod(start, Date.parse(start) + MAX_SHARE_PERIOD_MS).expires_at, '2026-10-05T00:00:00.000Z');
    for (const end of [start, Date.parse(start) - 1, Date.parse(start) + MAX_SHARE_PERIOD_MS + 1, 'bad']) assert.throws(() => buildSharePeriod(start, end));
    assert.throws(() => buildSharePeriod('', '2026-10-01'));
    assert.match(fn('class_agit_valid_share_period_v1'), /INTERVAL '720 hours'/);
    assert.match(fn('run_class_agit_share_action_v1'), /v_start:=v_share.starts_at; v_end:=v_share.expires_at/);
    assert.match(fn('run_class_agit_share_action_v1'), /v_share.expires_at<=now\(\)/);
    assert.doesNotMatch(fn('run_class_agit_share_action_v1'), /make_interval|v_days/);
});

test('교사·학생·외부 감상 5경로는 원글/대형 공개 배열/요청 카운터를 읽지 않는다', () => {
    for (const name of ['get_my_class_agit_exhibitions_v1', 'get_my_class_agit_room_v1', 'get_my_class_agit_work_v1', 'get_class_agit_publication_v1', 'read_public_class_agit_v1']) {
        const source = fn(name);
        assert.match(source, /STABLE SECURITY DEFINER/);
        assert.doesNotMatch(source, /class_agit_current_source_v1|student_posts|writing_missions|published_snapshot|class_agit_take_public_budget|FOR (SHARE|UPDATE)/, name);
        assert.match(source, /class_agit_publication_catalog/);
    }
    for (const name of ['get_my_class_agit_room_v1', 'get_class_agit_publication_v1', 'read_public_class_agit_v1']) assert.match(fn(name), /s.room_no=p_room[\s\S]*LIMIT 12/, name);
    assert.match(sql, /DROP FUNCTION IF EXISTS public.class_agit_visible_works_v1\(UUID,UUID\)/);
    const privacyPredicates = [...fn('class_agit_revoke_changed_posts_v1').matchAll(/AND \(n.is_submitted[\s\S]*?n.mission_id IS DISTINCT FROM o.mission_id\)/g)].map((m) => m[0]);
    assert.equal(privacyPredicates.length, 3, 'class, external and anthology must share the same privacy predicate');
    assert.equal(new Set(privacyPredicates).size, 1);
    assert.match(sql, /REFERENCING OLD TABLE AS old_items NEW TABLE AS new_items FOR EACH STATEMENT/);
    for (const name of ['read_public_class_agit_v1(TEXT,INTEGER,TEXT,INTEGER)', 'take_class_agit_public_read_budget_v1(TEXT)']) {
        assert.ok(sql.includes(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC,anon,authenticated,service_role;`));
        assert.ok(sql.includes(`GRANT EXECUTE ON FUNCTION public.${name} TO service_role;`));
        assert.ok(!sql.includes(`GRANT EXECUTE ON FUNCTION public.${name} TO anon`));
    }
});

test('방문 요청 한 번은 짧은 예산 검사 완료 후 읽기 한 번으로 이어진다', async () => {
    const calls = []; let release;
    const held = new Promise((resolve) => { release = resolve; });
    const handler = createPublicReadHandler({ rpc: async (name, args) => { calls.push({ name, args }); if (calls.length === 1) { await held; return { allowed: true }; } return { version: 1, items: [] }; } });
    const response = handler(request());
    await new Promise((resolve) => setTimeout(resolve, 10));
    assert.deepEqual(calls.map((c) => c.name), ['take_class_agit_public_read_budget_v1']);
    release(); const r = await response;
    assert.equal(r.status, 200); assert.deepEqual(calls[1], { name: 'read_public_class_agit_v1', args: body });
    assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(r.headers.get('referrer-policy'), 'no-referrer');
    assert.match(r.headers.get('x-robots-tag'), /noindex/);
});

test('예산 초과·해지·만료·이전 판·서버 오류가 일관된 상태로 차단된다', async () => {
    for (const [error, expected] of [['rate_limited', 429], ['unavailable', 404], ['changed', 409]]) {
        let calls = 0;
        const r = await createPublicReadHandler({ rpc: async () => { calls++; return { error }; } })(request());
        assert.equal(r.status, expected); assert.equal(calls, 1); assert.equal(r.headers.get('cache-control'), 'no-store');
        if (expected === 429) assert.equal(r.headers.get('retry-after'), '60');
    }
    let calls = 0;
    const blockedBetweenCalls = await createPublicReadHandler({ rpc: async () => ++calls === 1 ? { allowed: true } : { error: 'unavailable' } })(request());
    assert.equal(blockedBetweenCalls.status, 404); assert.equal(calls, 2);
    const r = await createPublicReadHandler({ rpc: async () => { throw new Error('private upstream detail'); } })(request());
    assert.equal(r.status, 503); assert(!JSON.stringify(await r.json()).includes('private'));
});

test('본문·작품·방·임의 RPC 입력 제한으로 서버 호출 전에 우회를 거절한다', async () => {
    let calls = 0;
    const handler = createPublicReadHandler({ rpc: async () => { calls++; return { allowed: true }; } });
    for (const payload of [null, [], { ...body, p_token: 'bad' }, { ...body, p_room: 11 }, { ...body, p_work_id: 'published-121' },
        { ...body, p_work_id: 'published-01' }, { ...body, p_work_id: 'published-1', p_publication_no: -1 },
        { ...body, method: 'get_private_post' }, { ...body, p_token: 'a'.repeat(2049) }]) assert((await handler(request(payload))).status >= 400);
    const streamed = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(2049)); controller.close(); } });
    assert.equal((await handler(request(body, { body: streamed, duplex: 'half' }))).status, 400);
    assert.equal((await handler(new Request('http://test.invalid', { method: 'OPTIONS' }))).status, 204);
    assert.equal(calls, 0);
    const source = readFileSync('supabase/functions/class-agit-public-read/handler.js', 'utf8');
    assert.equal(Number(source.match(/MAX_WORKS = (\d+)/)[1]), CLASS_AGIT_LIMITS.maxWorks);
});

test('공개 브라우저는 전용 입구를 쓰며 배포 두 경로가 같은 두 파일을 설치한다', () => {
    const api = readFileSync('src/modules/class-agit/public/publicApi.js', 'utf8');
    assert.match(api, /\/functions\/v1\/class-agit-public-read/); assert.doesNotMatch(api, /\/rest\/v1\/rpc/);
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Only the two literal deployment paths below.
    for (const file of ['scripts/deploy-local.sh', '.github/workflows/deploy.yml']) assert.match(readFileSync(file, 'utf8'), /bash scripts\/sync-class-agit-public-read.sh/);
    const sync = readFileSync('scripts/sync-class-agit-public-read.sh', 'utf8');
    for (const file of ['index.ts', 'handler.js']) assert.ok(sync.includes(`install -m 0644 "$class_agit_edge_src/${file}"`));
    assert.match(readFileSync('scripts/check-operational-security.mjs', 'utf8'), /20261243_class_agit_frozen_public_reads.sql/);
});

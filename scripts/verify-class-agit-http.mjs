// Isolated HTTP integration smoke: schema only from agit-db, synthetic smoke data,
// temporary database + PostgREST container. Never applies migrations to postgres.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, randomBytes, createHmac } from 'node:crypto';
import assert from 'node:assert/strict';
import { verifyClassAgitSelection } from './lib/class-agit-selection-http.mjs';
import { verifyFrozenPublicReads } from './lib/class-agit-frozen-http.mjs';
const suffix = randomUUID().replaceAll('-', '').slice(0, 12);
const dbName = `class_agit_verify_${suffix}`; const container = `class-agit-verify-${suffix}`;
const dir = mkdtempSync(join(tmpdir(), 'class-agit-http-')); let created = false;
const run = (args, input) => {
    const r = spawnSync('docker', args, { input, encoding: 'utf8', maxBuffer: 80 * 1024 * 1024, timeout: 180000 });
    if (r.status !== 0) throw new Error(`Docker ${args[0]} failed (${r.status}): ${String(r.stderr || '').split('\n').filter((line) => /ERROR:|FATAL:/.test(line)).map((line) => line.slice(0, 220)).join('\n')}`);
    return r.stdout;
};
const sql = (text) => run(['exec', '-i', 'agit-db', 'psql', '-U', 'supabase_admin', '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-At'], text);
const jwt = (sub, secret, role = 'authenticated') => {
    const body = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ role, sub, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')].join('.');
    return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
};
try {
    const schema = run(['exec', 'agit-db', 'pg_dump', '-U', 'supabase_admin', '--schema-only', '--no-owner', '--no-privileges', 'postgres']);
    run(['exec', 'agit-db', 'createdb', '-U', 'supabase_admin', '-O', 'supabase_admin', dbName]); created = true;
    console.log('Temporary database created; restoring schema without production data.');
    sql(schema);
    // Rebuild only the module's schema in this empty temporary database so historical
    // migration smokes remain reproducible even after a newer version is deployed.
    sql(`DO $$ DECLARE x RECORD; BEGIN
        FOR x IN SELECT t.tgname,c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND t.tgname LIKE 'class_agit_%' LOOP
            EXECUTE format('DROP TRIGGER %I ON public.%I',x.tgname,x.relname); END LOOP;
        FOR x IN SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'class_agit_%' LOOP
            EXECUTE format('DROP TABLE IF EXISTS public.%I CASCADE',x.tablename); END LOOP;
    END; $$;`);
    sql(readFileSync('supabase/migrations/20261240_neighbor_publication_matching_hardening.sql', 'utf8'));
    sql(readFileSync('supabase/migrations/20261241_class_agit_internal_publication.sql', 'utf8'));
    const smoke = readFileSync('tests/sql/20261241_class_agit_internal_publication.smoke.sql', 'utf8');
    sql(`BEGIN;\n${smoke}\nCOMMIT;`);
    // Existing authenticated DB login is passed only via a mode-0600 temporary env
    // file. It is never printed, embedded in an argv, or copied into the repository.
    const inspect = JSON.parse(run(['inspect', 'agit-rest']))[0];
    const env = new Map(inspect.Config.Env.map((line) => { const i = line.indexOf('='); return [line.slice(0, i), line.slice(i + 1)]; }));
    const uri = new URL(env.get('PGRST_DB_URI')); uri.pathname = `/${dbName}`;
    const secret = randomBytes(32).toString('hex');
    const envFile = join(dir, 'postgrest.env');
    writeFileSync(envFile, `PGRST_DB_URI=${uri}\nPGRST_DB_ANON_ROLE=anon\nPGRST_DB_SCHEMAS=public\nPGRST_JWT_SECRET=${secret}\nPGRST_DB_POOL=20\nPGRST_LOG_LEVEL=crit\nPGRST_SERVER_PORT=3000\n`, { mode: 0o600 });
    const network = Object.keys(inspect.NetworkSettings.Networks)[0];
    run(['run', '-d', '--name', container, '--network', network, '--env-file', envFile, '-p', '127.0.0.1::3000', inspect.Config.Image]);
    const port = run(['port', container, '3000/tcp']).trim().split(':').at(-1); const origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 40; i++) { try { const r = await fetch(origin, { signal: AbortSignal.timeout(2000) }); if (r.status < 500) { ready = true; break; } } catch { /* booting */ } await new Promise((resolve) => setTimeout(resolve, 500)); }
    assert(ready, 'PostgREST readiness');
    const rpc = async (name, body, bearer) => {
        const r = await fetch(`${origin}/rpc/${name}`, { method: 'POST', signal: AbortSignal.timeout(8000), headers: { 'Content-Type': 'application/json', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(body) });
        return { status: r.status, cache: r.headers.get('cache-control'), referrer: r.headers.get('referrer-policy'), robots: r.headers.get('x-robots-tag'), data: await r.json() };
    };
    // PostgREST must hoist the function timeout before starting the transaction.
    sql("CREATE FUNCTION public.class_agit_timeout_probe() RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET statement_timeout='100ms' AS $$ BEGIN PERFORM pg_sleep(0.4); END $$; GRANT EXECUTE ON FUNCTION public.class_agit_timeout_probe() TO anon; NOTIFY pgrst,'reload schema';");
    let timeoutProbe;
    for (let i = 0; i < 30; i++) { timeoutProbe = await rpc('class_agit_timeout_probe', {}); if (timeoutProbe.data.code !== 'PGRST202') break; await new Promise((r) => setTimeout(r, 100)); }
    assert.equal(timeoutProbe.data.code, '57014', 'PostgREST hoists statement_timeout');
    const token = 'c'.repeat(64);
    const room = await rpc('read_public_class_agit_v1', { p_token: token, p_room: 1 });
    assert.equal(room.status, 200); assert.equal(room.cache, 'no-store'); assert.equal(room.referrer, 'no-referrer'); assert.match(room.robots, /noindex/);
    assert.equal(room.data.items.length, 11); assert(!JSON.stringify(room.data).includes('blocks')); assert(!JSON.stringify(room.data).includes('class_id'));
    const detail = await rpc('read_public_class_agit_v1', { p_token: token, p_room: 1, p_work_id: 'published-3', p_publication_no: 1 });
    assert.equal(detail.status, 200); assert(detail.data.work.blocks.length);
    assert.equal((await rpc('read_public_class_agit_v1', { p_token: token, p_work_id: 'published-2', p_room: 1, p_publication_no: 1 })).status, 404);
    assert.equal((await rpc('read_public_class_agit_v1', { p_token: 'a'.repeat(64) })).status, 404);
    assert.equal((await rpc('read_public_class_agit_v1', { p_token: token, p_work_id: 'published-3', p_room: 1, p_publication_no: 2 })).status, 409);
    for (const table of ['class_agit_external_shares', 'class_agit_external_items', 'class_agit_books', 'class_agit_release_events']) { const r = await fetch(`${origin}/${table}?select=*`); assert(r.status >= 400, `anonymous table ${table}`); }
    const ids = JSON.parse(sql("SELECT jsonb_build_object('class',c.id,'admin',c.teacher_id,'student',s.auth_id) FROM public.classes c JOIN public.students s ON s.class_id=c.id WHERE c.name='C1 합성 학급' LIMIT 1;").trim());
    const adminToken = jwt(ids.admin, secret); const studentToken = jwt(ids.student, secret);
    assert.equal((await rpc('get_class_agit_share_workspace_v1', { p_class_id: ids.class, p_exhibition_id: randomUUID() }, studentToken)).status, 403);
    const manager = await rpc('get_class_agit_book_workspace_v1', { p_class_id: ids.class }, adminToken); assert.equal(manager.status, 200); assert.equal(manager.data.books.length, 1);
    const selectedBook = manager.data.books[0];
    assert.equal((await rpc('get_class_agit_book_preview_v1', { p_class_id: ids.class, p_book_id: selectedBook.id, p_revision: selectedBook.revision }, adminToken)).status, 403, 'withdrawn source blocks draft print');
    assert.equal((await rpc('get_class_agit_book_preview_v1', { p_class_id: ids.class, p_book_id: selectedBook.id, p_revision: selectedBook.revision - 1 }, adminToken)).status, 409, 'stale draft print');
    const ex = sql(`SELECT exhibition_id FROM public.class_agit_external_shares WHERE class_id='${ids.class}';`).trim();
    sql("UPDATE public.class_agit_public_read_budget SET requests=3000,window_start=date_trunc('minute',clock_timestamp()) WHERE bucket='global';");
    const limited = await rpc('read_public_class_agit_v1', { p_token: 'invalid' }); assert.equal(limited.status, 429); assert.equal(limited.cache, 'no-store');
    assert.equal(Number(sql("SELECT requests FROM public.class_agit_public_read_budget WHERE bucket='global';").trim()), 3001);
    sql("UPDATE public.class_agit_public_read_budget SET requests=1;");
    assert.equal((await rpc('run_class_agit_share_action_v1', { p_class_id: ids.class, p_exhibition_id: ex, p_action: 'revoke', p_payload: { expected_revision: 2 } }, adminToken)).status, 200);
    assert.equal((await rpc('read_public_class_agit_v1', { p_token: token })).status, 404);
    // Capacity migration and synthetic 120-work scenario run only in this temporary database.
    sql(readFileSync('supabase/migrations/20261242_class_agit_120_works.sql', 'utf8'));
    sql(`BEGIN;\n${readFileSync('tests/sql/20261242_class_agit_120_works.smoke.sql', 'utf8')}\nCOMMIT;`);
    const capacityIds = JSON.parse(sql("SELECT jsonb_build_object('exhibition',e.id,'student',s.auth_id) FROM public.classes c JOIN public.class_agit_exhibitions e ON e.class_id=c.id JOIN public.students s ON s.class_id=c.id WHERE c.name='120편 합성 학급';").trim());
    const public120 = await rpc('read_public_class_agit_v1', { p_token: 'd'.repeat(64), p_room: 10 });
    assert.equal(public120.status, 200); assert.equal(public120.data.total_count, 120);
    assert.equal(public120.data.items.length, 12); assert.equal(public120.data.items.at(-1).id, 'published-120');
    assert.equal(public120.cache, 'no-store'); assert.equal(public120.referrer, 'no-referrer');
    const last120 = await rpc('read_public_class_agit_v1', { p_token: 'd'.repeat(64), p_room: 10, p_work_id: 'published-120', p_publication_no: 1 });
    assert.equal(last120.status, 200); assert.equal(Array.from(last120.data.work.blocks[0]).length, 20000);
    assert.equal((await rpc('read_public_class_agit_v1', { p_token: 'd'.repeat(64), p_room: 11 })).status, 404);
    assert.equal((await rpc('read_public_class_agit_v1', { p_token: 'd'.repeat(64), p_room: 10, p_work_id: 'published-121', p_publication_no: 1 })).status, 404);
    const student120 = await rpc('get_my_class_agit_work_v1', { p_exhibition_id: capacityIds.exhibition, p_publication_no: 1, p_work_id: 'published-120' }, jwt(capacityIds.student, secret));
    assert.equal(student120.status, 200); assert.equal(student120.data.previous_id, 'published-119'); assert.equal(student120.data.next_id, null);
    console.log('PASS: 120 long works; student and anonymous room 10 / last work 120; invalid room 11 / work 121 rejected.');
    await verifyFrozenPublicReads({ sql, rpc, run, dir, network, postgrestContainer: container, jwt, secret, capacityIds });
    await verifyClassAgitSelection({ sql, rpc, jwt, secret });
    console.log('PASS: business conflicts return HTTP 409 without retry; anonymous 200/404/409/429 + no-store/no-referrer/noindex; role boundaries; token rotation/recall/revocation; durable rate limits.');
} finally {
    spawnSync('docker', ['rm', '-f', container], { stdio: 'ignore' });
    if (created) {
        const result = spawnSync('docker', ['exec', 'agit-db', 'dropdb', '-U', 'supabase_admin', '--force', dbName], { encoding: 'utf8' });
        if (result.status !== 0) { console.error(`Temporary database cleanup required: ${dbName}`); process.exitCode = 1; }
        else console.log('Temporary database and HTTP container removed.');
    }
    rmSync(dir, { recursive: true, force: true });
}

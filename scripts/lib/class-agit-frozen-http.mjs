import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { spawnSync, execFile } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
const execAsync = promisify(execFile);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const percentile = (values, fraction) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil(values.length * fraction) - 1)];
export async function verifyFrozenPublicReads({ sql, rpc, run, dir, network, postgrestContainer, jwt, secret, capacityIds }) {
    sql(readFileSync('supabase/migrations/20261243_class_agit_frozen_public_reads.sql', 'utf8'));
    sql(`BEGIN;\n${readFileSync('tests/sql/20261243_class_agit_frozen_public_reads.smoke.sql', 'utf8')}\nROLLBACK;`);
    // Migration is idempotent and must preserve previously captured body/withdrawal state.
    const catalogBefore = sql("SELECT md5(jsonb_agg(jsonb_build_array(class_id,exhibition_id,scope,total_count,rooms) ORDER BY class_id,exhibition_id,scope)::text) FROM public.class_agit_publication_catalog;").trim();
    sql(readFileSync('supabase/migrations/20261243_class_agit_frozen_public_reads.sql', 'utf8'));
    assert.equal(sql("SELECT md5(jsonb_agg(jsonb_build_array(class_id,exhibition_id,scope,total_count,rooms) ORDER BY class_id,exhibition_id,scope)::text) FROM public.class_agit_publication_catalog;").trim(), catalogBefore);
    for (const bearer of [undefined, jwt(capacityIds.student, secret)]) {
        for (const name of ['read_public_class_agit_v1', 'take_class_agit_public_read_budget_v1']) {
            let result;
            for (let i = 0; i < 30; i++) {
                result = await rpc(name, { p_token: 'd'.repeat(64) }, bearer);
                if (result.status === 401 || result.status === 403) break;
                await pause(100);
            }
            assert([401, 403].includes(result.status), `${name}: browser role cannot bypass gateway`);
        }
    }
    const edgeName = `${postgrestContainer}-edge`; const proxyName = `${postgrestContainer}-proxy`;
    try {
        const runtime = join(dir, 'functions'); mkdirSync(join(runtime, 'main'), { recursive: true }); mkdirSync(join(runtime, 'class-agit-public-read'));
        // Exact production main router + exact new handler, in a separate runtime/container.
        copyFileSync('/Users/seunghyeonmaegmini/agit-supabase/volumes/functions/main/index.ts', join(runtime, 'main/index.ts'));
        for (const name of ['index.ts', 'handler.js']) copyFileSync(`supabase/functions/class-agit-public-read/${name}`, join(runtime, 'class-agit-public-read', name));
        const caddyFile = join(dir, 'Caddyfile');
        writeFileSync(caddyFile, `:8000 {\n handle_path /rest/v1/* {\n reverse_proxy ${postgrestContainer}:3000\n }\n}\n`);
        const proxyImage = JSON.parse(run(['inspect', 'agit-app']))[0].Image;
        run(['run', '-d', '--name', proxyName, '--network', network, '--entrypoint', 'caddy', '-v', `${caddyFile}:/tmp/Caddyfile:ro`, proxyImage, 'run', '--config', '/tmp/Caddyfile', '--adapter', 'caddyfile']);
        const edgeConfig = JSON.parse(run(['inspect', 'agit-edge-functions']))[0];
        const envFile = join(dir, 'edge.env');
        writeFileSync(envFile, `SUPABASE_URL=http://${proxyName}:8000\nSUPABASE_SERVICE_ROLE_KEY=${jwt(undefined, secret, 'service_role')}\nVERIFY_JWT=false\nJWT_SECRET=${secret}\n`, { mode: 0o600 });
        run(['run', '-d', '--name', edgeName, '--network', network, '--env-file', envFile, '-p', '127.0.0.1::9000',
            '-v', `${runtime}:/home/deno/functions:ro`, edgeConfig.Image, ...edgeConfig.Config.Cmd]);
        const port = run(['port', edgeName, '9000/tcp']).trim().split(':').at(-1); const url = `http://127.0.0.1:${port}/class-agit-public-read`;
        const read = async (body) => {
            const start = performance.now();
            const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
            const text = await r.text(); let data; try { data = JSON.parse(text); } catch { data = null; }
            return { status: r.status, data, bytes: Buffer.byteLength(text), ms: performance.now() - start, headers: r.headers };
        };
        let ready;
        for (let i = 0; i < 60; i++) { try { ready = await read({ p_token: 'bad' }); if (ready.status === 404) break; } catch { /* cold start */ } await pause(500); }
        assert.equal(ready?.status, 404, 'actual Edge runtime readiness');
        const body = { p_token: 'd'.repeat(64), p_room: 10 };
        const baseline = await read(body);
        assert.equal(baseline.status, 200); assert.equal(baseline.data.total_count, 120); assert.equal(baseline.data.items.at(-1).id, 'published-120');
        assert.equal(baseline.headers.get('cache-control'), 'no-store'); assert.equal(baseline.headers.get('referrer-policy'), 'no-referrer'); assert(baseline.bytes < 25000);
        const last = await read({ ...body, p_work_id: 'published-120', p_publication_no: 1 });
        assert.equal(last.status, 200); assert.equal(Array.from(last.data.work.blocks[0]).length, 20000);
        assert.equal((await read({ ...body, p_work_id: 'published-120', p_publication_no: 2 })).status, 409);
        assert.equal((await read({ ...body, p_work_id: 'published-121', p_publication_no: 1 })).status, 404);
        sql("UPDATE public.class_agit_public_read_budget SET requests=3000,window_start=date_trunc('minute',clock_timestamp()) WHERE bucket='global';");
        assert.equal((await read(body)).status, 429); sql('DELETE FROM public.class_agit_public_read_budget;');
        console.log(`PASS: actual Edge → private REST → temporary DB; 120 frozen works, strict roles/time/409/429; room ${baseline.bytes} bytes.`);
        const measurements = { runtime: edgeConfig.Config.Image, roomBytes: baseline.bytes, bursts: [], sustained: [] };
        for (const concurrency of [1, 5, 10, 20]) {
            const results = await Promise.all(Array.from({ length: concurrency }, () => read(body)));
            assert(results.every((r) => r.status === 200), `burst ${concurrency} responses`);
            const times = results.map((r) => r.ms);
            const row = { concurrency, p50: +percentile(times, 0.5).toFixed(1), p95: +percentile(times, 0.95).toFixed(1), errors: 0 };
            measurements.bursts.push(row); console.log('Frozen public burst:', JSON.stringify(row));
        }
        await verifyConcurrency({ sql, rpc, read, body, capacityIds, jwt, secret });
        if (process.env.CLASS_AGIT_LOAD === '1') await sustainedLoad({ sql, read, rpc, jwt, secret, capacityIds, body, measurements, containers: [edgeName, postgrestContainer, 'agit-db'] });
        await verifyConcurrentPrivacy({ sql, rpc, read, jwt, secret, capacityIds });
        writeFileSync(process.env.CLASS_AGIT_LOAD === '1' ? '/tmp/class-agit-frozen-load-result.json' : '/tmp/class-agit-frozen-http-result.json', JSON.stringify(measurements, null, 2));
    } finally {
        for (const name of [edgeName, proxyName]) spawnSync('docker', ['rm', '-f', name], { stdio: 'ignore' });
    }
}

async function verifyConcurrency({ sql, rpc, read, body, capacityIds, jwt, secret }) {
    const ids = JSON.parse(sql(`SELECT jsonb_build_object('class',e.class_id,'teacher',c.teacher_id,'post',i.post_id,'item',i.id)
        FROM public.class_agit_exhibitions e JOIN public.classes c ON c.id=e.class_id JOIN public.class_agit_items i ON i.class_id=e.class_id AND i.exhibition_id=e.id
        WHERE e.id='${capacityIds.exhibition}' AND i.position=120;`).trim());
    const payload = { p_class_id: ids.class, p_action: 'publish', p_payload: { exhibition_id: capacityIds.exhibition, expected_revision: 3, confirmed: true } };
    const started = performance.now();
    // A test-only mutation endpoint, created only in the disposable database, makes real concurrent transactions.
    sql(`CREATE FUNCTION public.class_agit_test_withdraw(p_post uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN UPDATE public.student_posts SET is_submitted=false,is_confirmed=false WHERE id=p_post; PERFORM pg_sleep(0.05); RETURN TRUE; END $$;
        GRANT EXECUTE ON FUNCTION public.class_agit_test_withdraw(uuid) TO service_role; NOTIFY pgrst,'reload schema';`);
    const server = jwt(undefined, secret, 'service_role');
    await pause(200);
    const results = await Promise.all([rpc('class_agit_test_withdraw', { p_post: ids.post }, server), rpc('run_class_agit_action_v1', payload, jwt(ids.teacher, secret)), ...Array.from({ length: 20 }, () => read(body))]);
    assert.equal(results[0].status, 200); assert([200, 403, 409].includes(results[1].status), `publish/withdraw completes: HTTP ${results[1].status}, code ${results[1].data?.code}, message ${results[1].data?.message}`);
    assert(results.slice(2).every((r) => r.status === 200 && [119, 120].includes(r.data.total_count)), 'readers see complete old or new edition');
    assert.equal((await read({ ...body, p_work_id: 'published-120', p_publication_no: 1 })).status, 404);
    assert.equal((await read(body)).data.total_count, 119);
    console.log(`PASS: simultaneous publication, withdrawal and 20 readers; ${Math.round(performance.now() - started)}ms; no partial edition/deadlock.`);
    // Restore only this synthetic source with explicit new confirmation/publication below if load is requested.
    sql(`UPDATE public.student_posts SET is_submitted=true,is_confirmed=true WHERE id='${ids.post}';`);
    // The old edition must stay withdrawn even when the source becomes public again.
    assert.equal((await read(body)).data.total_count, 119);
}

async function sustainedLoad({ sql, read, rpc, jwt, secret, capacityIds, body, measurements, containers }) {
    // Keep 120 maximum-size frozen works per exhibition without regenerating source content.
    // These are synthetic fixtures in an empty temporary DB, never production publications.
    const tokens = ['1', '2', '3'].map((s) => s.repeat(64));
    const c = sql(`SELECT class_id FROM public.class_agit_exhibitions WHERE id='${capacityIds.exhibition}';`).trim();
    for (const token of tokens) {
        const ex = randomUUID();
        sql(`INSERT INTO public.class_agit_exhibitions(id,class_id,title) VALUES('${ex}','${c}','부하 전시');
            INSERT INTO public.class_agit_external_shares(id,class_id,exhibition_id,title,introduction,token_hash,starts_at,expires_at)
                VALUES('${ex}','${c}','${ex}','부하 전시','합성 자료',encode(extensions.digest('${token}','sha256'),'hex'),now()-interval '1 minute',now()+interval '1 day');
            INSERT INTO public.class_agit_external_items(class_id,share_id,post_id,student_id,position,snapshot)
                SELECT class_id,'${ex}',post_id,student_id,position,snapshot FROM public.class_agit_external_items WHERE class_id='${c}' AND share_id='${capacityIds.exhibition}';
            SELECT public.class_agit_refresh_catalog_v1('${c}','${ex}','external');`);
    }
    const studentBearer = jwt(capacityIds.student, secret);
    const writePost = sql(`SELECT post_id FROM public.class_agit_items WHERE class_id='${c}' AND exhibition_id='${capacityIds.exhibition}' AND position=1;`).trim();
    sql(`CREATE FUNCTION public.class_agit_test_edit(p_post uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN UPDATE public.student_posts SET title=title,updated_at=clock_timestamp() WHERE id=p_post; RETURN TRUE; END $$;
        GRANT EXECUTE ON FUNCTION public.class_agit_test_edit(uuid) TO service_role; NOTIFY pgrst,'reload schema';`);
    const server = jwt(undefined, secret, 'service_role'); await pause(200);
    for (const users of [100, 300]) {
        const durationMs = 600000; const thinkMs = 20000; const start = performance.now();
        const responses = []; const homes = []; const writes = []; const resourceSamples = [];
        let done = false;
        const monitor = (async () => {
            while (!done) {
                const result = await execAsync('docker', ['stats', '--no-stream', '--format', '{{json .}}', ...containers], { encoding: 'utf8', timeout: 10000 });
                const stats = result.stdout.trim().split('\n').map((s) => JSON.parse(s)).map((s) => ({ name: s.Name, cpu: s.CPUPerc, memory: s.MemUsage }));
                const connections = Number(sql('SELECT count(*) FROM pg_stat_activity;').trim());
                resourceSamples.push({ elapsed: Math.round((performance.now() - start) / 1000), connections, stats });
                await pause(10000);
            }
        })();
        const mixed = (async () => {
            while (performance.now() - start < durationMs) {
                let t = performance.now(); const h = await rpc('get_student_home_bootstrap_v1', {}, studentBearer); homes.push({ status: h.status, ms: performance.now() - t });
                t = performance.now(); const w = await rpc('class_agit_test_edit', { p_post: writePost }, server); writes.push({ status: w.status, ms: performance.now() - t });
                await pause(2000);
            }
        })();
        const readers = Array.from({ length: users }, async (_, user) => {
            await pause(user * thinkMs / users); let action = 0;
            while (performance.now() - start < durationMs) {
                const token = tokens[users === 100 ? 0 : user % tokens.length];
                const request = { ...body, p_token: token, p_room: action % 3 === 0 ? 0 : 10,
                    ...(action % 3 === 2 ? { p_work_id: 'published-120', p_publication_no: 1 } : {}) };
                const began = performance.now();
                try { responses.push(await read(request)); } catch { responses.push({ status: 0, ms: performance.now() - began }); }
                action++; await pause(Math.max(0, thinkMs - (performance.now() - began)));
            }
        });
        console.log(`Load started: ${users} readers, ${users === 100 ? 1 : 3} exhibitions, one action/20 seconds, 10 minutes + home/edit traffic.`);
        await Promise.all([...readers, mixed]); done = true; await monitor;
        const summarize = (rows) => ({ count: rows.length, errors: rows.filter((r) => r.status !== 200 && r.status !== 429).length,
            limited: rows.filter((r) => r.status === 429).length, p50: +percentile(rows.map((r) => r.ms), 0.5).toFixed(1), p95: +percentile(rows.map((r) => r.ms), 0.95).toFixed(1) });
        const row = { users, exhibitions: users === 100 ? 1 : 3, seconds: Math.round((performance.now() - start) / 1000), reads: summarize(responses), home: summarize(homes), write: summarize(writes), resourceSamples };
        measurements.sustained.push(row); console.log('Load result:', JSON.stringify({ ...row, resourceSamples: undefined }));
        writeFileSync(process.env.CLASS_AGIT_LOAD === '1' ? '/tmp/class-agit-frozen-load-result.json' : '/tmp/class-agit-frozen-http-result.json', JSON.stringify(measurements, null, 2));
        assert.equal(row.reads.errors, 0); assert.equal(row.reads.limited, 0); assert.equal(row.home.errors, 0); assert.equal(row.write.errors, 0);
    }
}

// A fresh student/mission keeps this race independent of the 120-work load fixtures.
async function verifyConcurrentPrivacy({ sql, rpc, read, jwt, secret, capacityIds }) {
    const c = sql(`SELECT class_id FROM public.class_agit_exhibitions WHERE id='${capacityIds.exhibition}';`).trim();
    const teacher = sql(`SELECT teacher_id FROM public.classes WHERE id='${c}';`).trim();
    const student = randomUUID(); const ex = randomUUID();
    sql(`INSERT INTO public.students(id,class_id,name,student_code) VALUES('${student}','${c}','동시성 합성 학생','${student.slice(0, 8)}RACE');
        INSERT INTO public.writing_missions(class_id,teacher_id,title,guide,genre,mission_type,input_template,min_chars,min_paragraphs,base_reward,bonus_reward)
        VALUES('${c}','${teacher}','동시성 합성 미션','합성 안내','글쓰기','글쓰기','freeform',1,1,0,0);`);
    const mission = sql(`SELECT id FROM public.writing_missions WHERE class_id='${c}' AND title='동시성 합성 미션';`).trim();
    const post = randomUUID();
    sql(`INSERT INTO public.student_posts(id,class_id,student_id,mission_id,title,content,is_submitted,is_confirmed)
        VALUES('${post}','${c}','${student}','${mission}','동시성 글','확정한 문장입니다.',true,true);`);
    const bearer = jwt(teacher, secret);
    const action = (p_action, p_payload) => rpc('run_class_agit_action_v1', { p_class_id: c, p_action, p_payload: { exhibition_id: ex, ...p_payload } }, bearer);
    assert.equal((await action('create', {})).status, 200);
    const source = (await rpc('get_class_agit_source_v1', { p_class_id: c, p_post_id: post }, bearer)).data.source;
    assert.equal((await action('save', { expected_revision: 1, title: '동시성 전시', introduction: '',
        items: [{ sourceId: post, sourceRevision: source.source_revision, publicAlias: '별 작가', classAcknowledged: true }] })).status, 200);
    assert.equal((await action('publish', { expected_revision: 2, confirmed: true })).status, 200);
    const share = async (expectedRevision, token) => {
        const workspace = (await rpc('get_class_agit_share_workspace_v1', { p_class_id: c, p_exhibition_id: ex }, bearer)).data;
        return rpc('run_class_agit_share_action_v1', { p_class_id: c, p_exhibition_id: ex, p_action: 'publish', p_payload: {
            expected_revision: expectedRevision, exhibition_revision: workspace.exhibition_revision, title: '동시성 외부 전시', introduction: '',
            token, confirmed: true, starts_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
            items: workspace.candidates.map((i) => ({ itemId: i.itemId, sourceRevision: i.sourceRevision, publicAlias: '별 작가', externalConfirmed: true })),
        } }, bearer);
    };
    let token = randomBytes(32).toString('hex'); assert.equal((await share(0, token)).status, 200);
    sql(`CREATE FUNCTION public.class_agit_test_deactivate(p_student uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN UPDATE public.students SET is_active=false WHERE id=p_student; PERFORM pg_sleep(0.05); RETURN TRUE; END $$;
        CREATE FUNCTION public.class_agit_test_delete_mission(p_mission uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER AS $$
        BEGIN DELETE FROM public.writing_missions WHERE id=p_mission; PERFORM pg_sleep(0.05); RETURN TRUE; END $$;
        GRANT EXECUTE ON FUNCTION public.class_agit_test_deactivate(uuid),public.class_agit_test_delete_mission(uuid) TO service_role;
        NOTIFY pgrst,'reload schema';`);
    await pause(250); const server = jwt(undefined, secret, 'service_role');
    let result = await Promise.all([rpc('class_agit_test_deactivate', { p_student: student }, server), action('publish', { expected_revision: 3, confirmed: true })]);
    assert.equal(result[0].status, 200); assert([200, 403, 409].includes(result[1].status), `deactivate/publish: ${result[1].data?.code}`);
    assert.equal((await read({ p_token: token })).data.total_count, 0);
    sql(`BEGIN; SELECT set_config('request.jwt.claims',jsonb_build_object('role','service_role')::TEXT,TRUE);
        UPDATE public.students SET is_active=true WHERE id='${student}'; COMMIT;`);
    assert.equal((await read({ p_token: token })).data.total_count, 0, 'reactivation cannot revive an old share');
    token = randomBytes(32).toString('hex'); assert.equal((await share(1, token)).status, 200);
    const next = randomBytes(32).toString('hex');
    result = await Promise.all([rpc('class_agit_test_delete_mission', { p_mission: mission }, server), share(2, next)]);
    assert.equal(result[0].status, 200); assert([200, 403, 409].includes(result[1].status), `mission delete/publish: ${result[1].data?.code}`);
    const page = await read({ p_token: result[1].status === 200 ? next : token });
    assert.equal(page.status, 200); assert.equal(page.data.total_count, 0);
    console.log('PASS: student deactivation and mission deletion race with publication; no deadlock or revived share.');
}

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';

export async function verifyClassAgitSelection({ sql, rpc, jwt, secret }) {
    sql(readFileSync('supabase/migrations/20261244_class_agit_mission_selection.sql', 'utf8'));
    sql(`BEGIN;\n${readFileSync('tests/sql/20261244_class_agit_mission_selection.smoke.sql', 'utf8')}\nCOMMIT;`);
    const ids = JSON.parse(sql("SELECT jsonb_build_object('class',c.id,'teacher',c.teacher_id,'student',s.auth_id) FROM public.classes c JOIN public.students s ON s.class_id=c.id WHERE c.name='작품 탐색 합성 학급' AND s.auth_id IS NOT NULL;").trim());
    const teacher = jwt(ids.teacher, secret); const student = jwt(ids.student, secret);
    let page;
    for (let attempt = 0; attempt < 30; attempt++) {
        page = await rpc('get_class_agit_candidates_v2', { p_class_id: ids.class, p_filters: {} }, teacher);
        if (page.data.code !== 'PGRST202') break;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(page.status, 200); assert.equal(page.data.items.length, 30); assert.equal(page.data.version, 2);
    assert.equal(page.data.class_id, ids.class); assert(!JSON.stringify(page.data).includes('blocks'));
    const old = await rpc('get_class_agit_candidates_v1', { p_class_id: ids.class }, teacher);
    assert.equal(old.status, 404, 'retired RPC must be absent');
    const missions = await rpc('get_class_agit_missions_v1', { p_class_id: ids.class, p_limit: 50 }, teacher);
    assert.equal(missions.status, 200); assert.equal(missions.data.items.length, 50);
    const tail = await rpc('get_class_agit_missions_v1', { p_class_id: ids.class, p_cursor: missions.data.next_cursor }, teacher);
    assert.equal(tail.data.items.length, 16); assert.equal(tail.data.items.at(-1).review_count, 0);
    const found = await rpc('get_class_agit_candidates_v2', { p_class_id: ids.class, p_filters: { query: '탐색 작품 61-01' } }, teacher);
    assert.equal(found.data.items.length, 1);
    const bulk = await rpc('get_class_agit_sources_v1', { p_class_id: ids.class, p_post_ids: [...page.data.items.map((item) => item.id), randomUUID()] }, teacher);
    assert.equal(bulk.status, 200); assert.equal(bulk.data.items.length, 31);
    assert(bulk.data.items[0].source.source_revision); assert.equal(bulk.data.items[0].source.class_id, ids.class);
    assert.equal(bulk.data.items.at(-1).source, null); assert(bulk.data.items.at(-1).reason);
    for (const [name, body] of [
        ['get_class_agit_missions_v1', { p_class_id: ids.class }],
        ['get_class_agit_candidates_v2', { p_class_id: ids.class }],
        ['get_class_agit_sources_v1', { p_class_id: ids.class, p_post_ids: [page.data.items[0].id] }],
    ]) {
        assert.equal((await rpc(name, body, student)).status, 403, `${name} student`);
        assert((await rpc(name, body)).status >= 400, `${name} anonymous`);
    }
    assert.equal((await rpc('get_class_agit_sources_v1', { p_class_id: ids.class, p_post_ids: Array.from({ length: 51 }, () => randomUUID()) }, teacher)).status, 400);
    assert.equal((await rpc('get_class_agit_candidates_v2', { p_class_id: ids.class, p_filters: { cursor: { id: randomUUID() } } }, teacher)).status, 400);
    const durations = [];
    for (let index = 0; index < 20; index++) {
        const start = performance.now();
        const response = await rpc('get_class_agit_missions_v1', { p_class_id: ids.class }, teacher);
        assert.equal(response.status, 200); durations.push(performance.now() - start);
    }
    durations.sort((a, b) => a - b);
    console.log(`PASS: mission selection HTTP; 66 missions/1040 synthetic long posts; old/empty/archived missions, bounded summaries, bulk sources, old RPC removed, role boundaries; mission catalog p95=${durations[18].toFixed(1)}ms (20 serial local reads).`);
}

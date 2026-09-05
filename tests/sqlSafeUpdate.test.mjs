import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

// `authenticator` 역할에는 `session_preload_libraries=safeupdate` 가 걸려 있다(Supabase 기본).
// 그래서 앱(PostgREST)으로 들어오는 요청은 WHERE 없는 DELETE/UPDATE 를
// "DELETE requires a WHERE clause" 로 거부한다. psql 은 postgres 역할이라 통과하므로
// 사람이 손으로 확인하면 멀쩡해 보이고 실제 사용자만 400을 만난다 — 검사로만 잡을 수 있다.
const dir = 'supabase/migrations';
const files = readdirSync(dir).filter((name) => name.endsWith('.sql')).sort();

// 함수 본문($$ ... $$)만 본다. 마이그레이션 본문의 일회성 정리 문장은 postgres 역할로 돌아 해당 없음.
function unqualifiedWrites(sql) {
    const found = [];
    for (const [, body] of sql.matchAll(/\$\$([\s\S]*?)\$\$/g)) {
        const clean = body
            .replace(/--[^\n]*/g, ' ')
            .replace(/ON CONFLICT[\s\S]*?DO UPDATE SET[^;]*/gi, ' ')  // upsert 는 DELETE/UPDATE 문이 아니다
            .replace(/FOR\s+UPDATE/gi, ' '); // 잠금 절(FOR UPDATE ... )은 갱신 문장이 아니다
        for (const [statement] of clean.matchAll(/\b(?:DELETE\s+FROM|UPDATE)\s+[^;]*;/gi)) {
            if (!/\bWHERE\b/i.test(statement)) found.push(statement.replace(/\s+/g, ' ').trim().slice(0, 90));
        }
    }
    return found;
}

test('RPC 함수 안에는 WHERE 없는 DELETE·UPDATE 를 두지 않는다', () => {
    const offenders = [];
    for (const name of files) {
        // 옛 마이그레이션은 이력이라 고치지 않는다. 나중 마이그레이션이 덮어쓴 것만 실제로 살아 있다.
        if (name < '20261253') continue;
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- 경로는 이 저장소의 마이그레이션 목록뿐이다
        for (const statement of unqualifiedWrites(readFileSync(`${dir}/${name}`, 'utf8'))) offenders.push(`${name}: ${statement}`);
    }
    assert.deepEqual(offenders, [], `앱에서 "DELETE requires a WHERE clause" 로 실패합니다:\n${offenders.join('\n')}`);
});

test('공개 단계 저장의 시범 학급 정리는 조건을 밝힌다', () => {
    const sql = readFileSync(`${dir}/20261253_class_agit_rollout_safeupdate_fix.sql`, 'utf8');
    assert.deepEqual(unqualifiedWrites(sql), []);
    assert.match(sql, /DELETE FROM public\.class_agit_pilot_classes pc WHERE NOT EXISTS\(/);
    assert.match(sql, /ON CONFLICT\(class_id\) DO NOTHING/);
    // 고른 학급은 남고 고르지 않은 학급만 빠져야 저장을 되풀이해도 결과가 같다.
    assert.match(sql, /x::UUID=pc\.class_id/);
    // 권한·검증 계약은 그대로다.
    assert.match(sql, /관리자만 공개 단계를 관리할 수 있습니다/);
    assert.match(sql, /NOT IN\('internal','pilot','open','disabled'\)/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.manage_class_agit_rollout_v1\(JSONB\) TO authenticated/);
});

test('검사가 실제로 WHERE 없는 문장을 집어낸다', () => {
    assert.deepEqual(unqualifiedWrites('CREATE FUNCTION f() AS $$ BEGIN DELETE FROM t; END; $$'), ['DELETE FROM t;']);
    assert.deepEqual(unqualifiedWrites('CREATE FUNCTION f() AS $$ BEGIN UPDATE t SET a=1; END; $$'), ['UPDATE t SET a=1;']);
    // 아래는 거짓 양성이 되면 안 되는 것들이다.
    for (const safe of ['$$ DELETE FROM t WHERE id=1; $$', '$$ UPDATE t SET a=1 WHERE id=1; $$',
        '$$ INSERT INTO t VALUES(1) ON CONFLICT(id) DO UPDATE SET a=EXCLUDED.a; $$',
        '$$ SELECT 1 FROM t FOR UPDATE NOWAIT; $$', '$$ SELECT 1 FROM t FOR UPDATE OF t SKIP LOCKED; $$',
        '$$ BEGIN -- UPDATE t SET a=1;\n SELECT 1; END; $$']) {
        assert.deepEqual(unqualifiedWrites(safe), [], safe);
    }
    // 함수 밖(마이그레이션 본문)은 postgres 역할로 돌아 검사 대상이 아니다.
    assert.deepEqual(unqualifiedWrites('DELETE FROM t;'), []);
    // 실제로 걸렸던 문장(61241·61252)이 지금 규칙에 잡히는지 본다.
    assert.deepEqual(unqualifiedWrites('CREATE FUNCTION f() AS $$ BEGIN DELETE FROM public.class_agit_pilot_classes; END; $$'),
        ['DELETE FROM public.class_agit_pilot_classes;']);
});

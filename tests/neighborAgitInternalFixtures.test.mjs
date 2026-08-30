import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, smoke, fixtures, panel] = await Promise.all([
    readFile('supabase/migrations/20261200_neighbor_internal_test_classes.sql', 'utf8'),
    readFile('tests/sql/20261200_neighbor_internal_test_classes.smoke.sql', 'utf8'),
    readFile('scripts/create-neighbor-test-fixtures.sql', 'utf8'),
    readFile('src/components/admin/AdminNeighborAgitPanel.jsx', 'utf8')
]);

const functionSource = (name) => {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const next = migration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
    return migration.slice(start, next < 0 ? migration.length : next);
};

test('내부 시험 학급 등록부는 브라우저와 service_role이 직접 읽을 수 없다', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.neighbor_internal_test_classes/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.neighbor_internal_test_classes FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(smoke, /has_table_privilege\('authenticated'/);
    assert.match(smoke, /has_table_privilege\('service_role'/);
});

test('관리자 후보와 내부 공간 생성은 등록된 테스트 학급으로만 제한한다', () => {
    const dashboard = functionSource('get_neighbor_admin_dashboard_v1');
    const createTrial = functionSource('create_neighbor_internal_trial_v1');
    assert.match(dashboard, /JOIN public\.neighbor_internal_test_classes test_class/);
    assert.match(createTrial, /JOIN public\.neighbor_internal_test_classes test_class/);
    assert.match(smoke, /exclude operational classes/);
    assert.match(smoke, /unregistered operational class must be rejected/);
    assert.match(panel, /등록된 테스트 학급만/);
    assert.match(panel, /관리자 테스트 학급 선택/);
});

test('운영 fixture는 두 비로그인 교사와 두 빈 학급을 멱등 생성한다', () => {
    assert.equal((fixtures.match(/neighbor-test-teacher-[ab]@internal\.invalid/g) || []).length, 2);
    assert.match(fixtures, /'이웃아지트 테스트 교사 A'/);
    assert.match(fixtures, /'이웃아지트 테스트 교사 B'/);
    assert.match(fixtures, /'이웃아지트 테스트 1반'/);
    assert.match(fixtures, /'이웃아지트 테스트 2반'/);
    assert.match(fixtures, /encrypted_password[\s\S]*NULL/);
    assert.match(fixtures, /banned_until[\s\S]*'infinity'::TIMESTAMPTZ/);
    assert.doesNotMatch(fixtures, /auth\.identities/);
    assert.match(fixtures, /ON CONFLICT \(class_id\) DO UPDATE/);
});

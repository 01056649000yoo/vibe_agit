import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NEIGHBOR_AGIT_LIMITS } from '../src/modules/community/neighbor-agit/policy.js';

const [migration, smoke, securityHarness] = await Promise.all([
    readFile('supabase/migrations/20261199_neighbor_agit_data_foundation.sql', 'utf8'),
    readFile('tests/sql/20261199_neighbor_agit_data_foundation.smoke.sql', 'utf8'),
    readFile('SECURITY_HARNESS.md', 'utf8')
]);

const TABLES = [
    'neighbor_rollout_state',
    'neighbor_rollout_events',
    'neighbor_spaces',
    'neighbor_space_classes',
    'neighbor_invites',
    'neighbor_invite_attempts',
    'neighbor_shared_posts',
    'neighbor_comments',
    'neighbor_reactions',
    'neighbor_saves',
    'neighbor_feed_visits',
    'neighbor_space_events'
];

test('이웃 아지트 열두 표는 RLS와 직접 권한 회수 뒤 전용 RPC만 사용한다', () => {
    assert.equal(TABLES.length, 12);
    TABLES.forEach((table) => {
        assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS public.${table} (`));
        assert.ok(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
        assert.ok(migration.includes(
            `REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role`
        ));
        assert.ok(smoke.includes(`'${table}'`));
    });
    assert.doesNotMatch(migration, /CREATE POLICY/);
    assert.match(smoke, /has_table_privilege\('authenticated'/);
    assert.match(smoke, /has_table_privilege\('service_role'/);
});

test('공개 기본값과 학급·피드 제한은 화면 정책과 DB 제약 검사가 함께 본다', () => {
    assert.equal(NEIGHBOR_AGIT_LIMITS.maxClassesPerSpace, 4);
    assert.equal(NEIGHBOR_AGIT_LIMITS.maxActiveSpacesPerClass, 1);
    assert.equal(NEIGHBOR_AGIT_LIMITS.initialFeedRows, 20);
    assert.equal(NEIGHBOR_AGIT_LIMITS.maximumFeedRows, 50);
    assert.match(migration, /mode TEXT NOT NULL DEFAULT 'internal'/);
    assert.match(migration, /mode IN \('internal', 'public_beta', 'paused'\)/);
    assert.match(smoke, /NOT IN \('internal', 'limited_beta', 'public_beta', 'paused'\)/);
    assert.doesNotMatch(smoke, /mode FROM public\.neighbor_rollout_state WHERE singleton\) <> 'internal'/);
    assert.match(migration, /v_active_count >= 4/);
    assert.match(migration, /uq_neighbor_space_classes_one_active_space/);
    assert.match(smoke, /fifth active class must be blocked/);
    assert.match(smoke, /one class must not join two active neighbor spaces/);
    assert.match(smoke, /SET CONSTRAINTS neighbor_spaces_host_constraint, neighbor_space_classes_host_constraint IMMEDIATE/);
    assert.match(smoke, /active space without one matching host class must be blocked/);
});

test('글·댓글·반응·간직하기는 원래 학급과 학생을 복합 외래키로 고정한다', () => {
    assert.match(migration, /idx_student_posts_id_class_student_unique/);
    assert.match(migration, /FOREIGN KEY \(post_id, class_id, student_id\)[\s\S]*student_posts\(id, class_id, student_id\)/);
    assert.equal((migration.match(/FOREIGN KEY \(student_id, class_id\)/g) ?? []).length, 4);
    assert.equal((migration.match(/FOREIGN KEY \(space_id, class_id\)/g) ?? []).length, 7);
    assert.match(migration, /UNIQUE \(shared_post_id, student_id\)/);
    assert.match(migration, /content !~ E'\[\\\\r\\\\n\]'/);
});

test('호스트·게스트·학생 경계와 이웃 전용 표 원칙이 보안 정본에 남는다', () => {
    assert.match(securityHarness, /이웃 아지트/);
    assert.match(securityHarness, /neighbor_/);
    assert.match(securityHarness, /공간당 최대\s+4학급/);
    assert.match(securityHarness, /브라우저 역할.*직접 권한/);
});

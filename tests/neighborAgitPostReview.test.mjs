import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NEIGHBOR_AGIT_WRITING_BRIDGE } from '../src/modules/community/neighbor-agit/writingBridge.js';

const [migration, smoke, manifest] = await Promise.all([
    readFile('supabase/migrations/20261199_neighbor_agit_data_foundation.sql', 'utf8'),
    readFile('tests/sql/20261199_neighbor_agit_data_foundation.smoke.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/manifest.js', 'utf8')
]);

const STEP_3_RPCS = [
    ['set_neighbor_class_access_v1', 'UUID, UUID, BOOLEAN'],
    ['request_neighbor_post_share_v1', 'UUID, UUID'],
    ['recall_my_neighbor_shared_post_v1', 'UUID, UUID'],
    ['review_neighbor_shared_post_v1', 'UUID, UUID, TEXT, TEXT'],
    ['moderate_neighbor_item_v1', 'UUID, UUID, TEXT, UUID, TEXT, TEXT']
];

test('Step 3 글 연결은 기존 원본·임시저장을 재사용하고 전용 RPC만 쓴다', () => {
    assert.deepEqual(NEIGHBOR_AGIT_WRITING_BRIDGE, {
        sourceTable: 'student_posts',
        shareTable: 'neighbor_shared_posts',
        editorStrategy: 'reuse-existing-writing-editor',
        draftStrategy: 'reuse-existing-writing-draft',
        requestRpc: 'request_neighbor_post_share_v1',
        recallRpc: 'recall_my_neighbor_shared_post_v1',
        reviewRpc: 'run_neighbor_teacher_action_v1',
        reviewAction: 'review_post',
        moderationRpc: 'moderate_neighbor_item_v1'
    });
    assert.match(manifest, /writingBridge: NEIGHBOR_AGIT_WRITING_BRIDGE/);
    assert.match(manifest, /writes: 'rpc'/);
    assert.match(manifest, /studentEntry: \(\) => import\('\.\/StudentEntry'\)/);
    assert.match(migration, /FOREIGN KEY \(post_id, class_id, student_id\)[\s\S]*student_posts\(id, class_id, student_id\)/);
    assert.match(migration, /request_neighbor_post_share_v1/);
});

test('학생 공개는 실제 계정·학급 모듈 ON·학급 스위치·두 학급 참여를 모두 확인한다', () => {
    assert.match(migration, /student\.auth_id = v_user_id/);
    assert.match(migration, /student\.is_active IS DISTINCT FROM FALSE/);
    assert.match(migration, /'neighbor-agit' = ANY\(COALESCE\(class\.enabled_modules, ARRAY\[\]::TEXT\[\]\)\)/);
    assert.match(migration, /membership\.student_access_enabled IS TRUE/);
    assert.match(migration, /active_membership\.status = 'active'[\s\S]*>= 2/);
    assert.match(migration, /post\.student_id = v_student_id/);
    assert.match(migration, /post\.class_id = v_class_id/);
    assert.match(migration, /post\.is_submitted IS TRUE/);
});

test('원학급 교사만 공개·반려·복원하고 모든 실제 참여 교사는 긴급 숨김할 수 있다', () => {
    assert.match(migration, /assert_neighbor_participating_teacher_v1\(p_space_id, v_shared\.class_id\)/);
    assert.match(migration, /v_shared\.status <> 'hidden' OR v_shared\.class_id <> p_actor_class_id/);
    assert.match(migration, /hidden_by_class_id = p_actor_class_id/);
    assert.match(migration, /p_action NOT IN \('hide', 'restore'\)/);
    assert.match(smoke, /guest teacher reviewed another class post/);
    assert.match(smoke, /guest teacher restored another class post/);
    assert.match(smoke, /participant teacher could not emergency-hide/);
});

test('기존 학생 글·댓글·반응의 RLS와 직접 권한은 Step 3에서 바꾸지 않는다', () => {
    assert.doesNotMatch(migration, /(?:CREATE|ALTER|DROP) POLICY[\s\S]{0,120}(?:student_posts|post_comments|post_reactions)/i);
    assert.doesNotMatch(migration, /(?:GRANT|REVOKE)[\s\S]{0,80}ON TABLE public\.(?:student_posts|post_comments|post_reactions)/i);
    STEP_3_RPCS.forEach(([name, parameters]) => {
        assert.ok(migration.includes(`CREATE OR REPLACE FUNCTION public.${name}(`));
        assert.ok(migration.includes(`GRANT EXECUTE ON FUNCTION public.${name}(${parameters}) TO authenticated`));
    });
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.assert_neighbor_student_access_v1\(UUID\)/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.sync_neighbor_shared_post_source_v1\(\)/);
});

test('원글 회수는 공개를 내리고 공개 후 본문 변경은 재검토 대기로 되돌린다', () => {
    assert.match(migration, /NEW\.is_submitted IS NOT TRUE OR NEW\.recalled_at IS NOT NULL/);
    assert.match(migration, /SET status = 'recalled'/);
    assert.match(migration, /shared\.status IN \('published', 'hidden'\)/);
    assert.match(migration, /SET status = 'pending'/);
    assert.match(smoke, /source edit did not return published share to pending review/);
});

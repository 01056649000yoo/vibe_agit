import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NEIGHBOR_AGIT_LIMITS } from '../src/modules/community/neighbor-agit/policy.js';

const [migration, smoke] = await Promise.all([
    readFile('supabase/migrations/20261199_neighbor_agit_data_foundation.sql', 'utf8'),
    readFile('tests/sql/20261199_neighbor_agit_data_foundation.smoke.sql', 'utf8')
]);

const TEACHER_RPCS = [
    ['create_neighbor_space_v1', 'UUID, TEXT, TEXT, TEXT'],
    ['create_neighbor_invite_v1', 'UUID'],
    ['request_neighbor_join_v1', 'TEXT, UUID, TEXT'],
    ['review_neighbor_join_v1', 'UUID, UUID, BOOLEAN'],
    ['leave_neighbor_space_v1', 'UUID, UUID'],
    ['transfer_neighbor_host_v1', 'UUID, UUID'],
    ['close_neighbor_space_v1', 'UUID']
];

test('Step 2 교사 작업은 직접 표 접근 없이 authenticated 전용 SECURITY DEFINER RPC로만 열린다', () => {
    TEACHER_RPCS.forEach(([name, parameters]) => {
        assert.ok(migration.includes(`CREATE OR REPLACE FUNCTION public.${name}(`));
        assert.ok(migration.includes(
            `GRANT EXECUTE ON FUNCTION public.${name}(${parameters}) TO authenticated`
        ));
    });
    assert.match(migration, /SECURITY DEFINER/g);
    assert.match(smoke, /has_function_privilege\('anon', 'public\.create_neighbor_space_v1/);
    assert.match(smoke, /has_function_privilege\('service_role', 'public\.create_neighbor_space_v1/);
});

test('권한은 실제 프로필 승인과 담당 학급을 확인하고 JWT 관리자 주장을 신뢰하지 않는다', () => {
    assert.match(migration, /FROM public\.profiles profile[\s\S]*profile\.id = v_user_id/);
    assert.match(migration, /v_profile\.role = 'ADMIN'/);
    assert.match(migration, /v_profile\.role <> 'TEACHER'/);
    assert.match(migration, /v_profile\.is_approved IS NOT TRUE/);
    assert.match(migration, /v_profile\.approval_revoked_at IS NOT NULL/);
    assert.match(migration, /class\.teacher_id = v_user_id/);
    assert.doesNotMatch(migration, /auth\.jwt|app_metadata/);
    assert.match(smoke, /위조 관리자 JWT/);
    assert.match(smoke, /internal 단계에서 일반 교사/);
});

test('초대키는 혼동 문자 없는 일회성 원문 응답과 SHA-256 해시·24시간 만료를 사용한다', () => {
    assert.equal(NEIGHBOR_AGIT_LIMITS.inviteTtlHours, 24);
    assert.match(migration, /v_alphabet CONSTANT TEXT := '23456789ABCDEFGHJKMNPQRSTUVWXYZ'/);
    assert.match(migration, /extensions\.gen_random_bytes\(16\)/);
    assert.match(migration, /extensions\.digest\(convert_to\(v_normalized, 'UTF8'\), 'sha256'\)/);
    assert.match(migration, /v_expires_at TIMESTAMPTZ := NOW\(\) \+ INTERVAL '24 hours'/);
    assert.match(migration, /SET status = 'used', used_at = v_now, used_by_class_id = p_class_id/);
    assert.match(smoke, /invite must be hash-only and expire in 24 hours/);
    assert.match(smoke, /used one-time invite key was accepted again/);
});

test('초대 추측은 10분 창 5회 뒤 30초 차단되고 실패 기록은 일반 오류 응답으로 남는다', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.neighbor_invite_attempts/);
    assert.match(migration, /INTERVAL '10 minutes'/);
    assert.match(migration, /\) >= 5 THEN v_now \+ INTERVAL '30 seconds'/);
    assert.match(migration, /'error', 'invalid_or_expired_invite'/);
    assert.match(migration, /'error', 'rate_limited'/);
    assert.match(smoke, /FOR v_index IN 1\.\.5 LOOP/);
    assert.match(smoke, /sixth attempt/);
});

test('신청·승인·호스트 이전·퇴장·종료 흐름과 최종 접근 차단을 역할 스모크가 확인한다', () => {
    assert.match(smoke, /guest join request failed/);
    assert.match(smoke, /host approval failed/);
    assert.match(smoke, /host transfer failed/);
    assert.match(smoke, /previous host retained host-only close permission/);
    assert.match(smoke, /guest leave flow failed/);
    assert.match(smoke, /new host could not close the space/);
    assert.match(smoke, /closed neighbor space retained active access/);
    assert.match(migration, /v_active_count >= 4/);
    assert.match(smoke, /fifth active class must be blocked/);
});

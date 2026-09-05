import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { getExchangeEligibility } from '../src/modules/community/neighbor-agit/exchangeEligibility.js';

const memberships = [
    { class_id: 'host', status: 'active', matchable_student_count: 4 },
    { class_id: 'guest', status: 'active', matchable_student_count: 2 },
    { class_id: 'other', status: 'active', matchable_student_count: 3 }
];
const check = (changes = {}) => getExchangeEligibility({ memberships, classIds: ['host', 'guest'], hostClassId: 'host', actorClassId: 'host', ...changes });
test('호스트 제안과 게스트 제안 모두 호스트 포함 1:2 인원을 허용한다', () => {
    assert.equal(check(), '');
    assert.equal(check({ actorClassId: 'guest' }), '');
    assert.match(check({ actorClassId: 'guest', classIds: ['guest', 'other'] }), /호스트/);
    assert.match(check({ classIds: ['host', 'host'] }), /서로 다른/);
});
test('학생 수 경계와 미확인 인원은 활동을 제안하기 전에 안내한다', () => {
    const withCounts = (a, b) => check({ memberships: memberships.map((item, index) => ({ ...item, matchable_student_count: index === 0 ? a : b })) });
    for (const counts of [[0, 1], [101, 100], [3, 1], [undefined, 2]]) assert.notEqual(withCounts(...counts), '');
    for (const counts of [[1, 1], [2, 1], [100, 50]]) assert.equal(withCounts(...counts), '');
    assert.notEqual(check({ memberships: memberships.map((item) => ({ ...item, status: 'left' })) }), '');
});
test('모든 현재 공개 조회와 공유 진입점이 같은 원글 공개 조건을 사용한다', () => {
    const sql = readFileSync('supabase/migrations/20261240_neighbor_publication_matching_hardening.sql', 'utf8');
    for (const name of ['get_neighbor_teacher_share_candidates_v1', 'get_neighbor_my_share_candidates_v1', 'publish_neighbor_class_post_v1', 'request_neighbor_post_share_v1', 'get_neighbor_space_feed_v1', 'get_neighbor_activity_feed_v1', 'get_neighbor_shared_post_v1', 'assert_neighbor_student_post_access_v1', 'get_neighbor_teacher_source_post_v1', 'get_neighbor_teacher_post_detail_v1']) {
        const definition = sql.match(new RegExp(`CREATE OR REPLACE FUNCTION public\\.${name}\\([\\s\\S]*?\\n\\$\\$;`))?.[0];
        assert.ok(definition?.includes('neighbor_source_is_shareable_v1(post)'), `${name} 공개 조건 누락`);
    }
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.review_neighbor_shared_post_v1\(UUID, UUID, TEXT, TEXT\)\s+FROM PUBLIC, anon, authenticated, service_role/);
});

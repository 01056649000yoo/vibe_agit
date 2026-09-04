import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, teacherEntry, studentEntry, teacherApi, readme, security, performance, packageJson] = await Promise.all([
    readFile('supabase/migrations/20261239_neighbor_teacher_sharing_exchange_matching.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/teacherApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/README.md', 'utf8'),
    readFile('SECURITY_HARNESS.md', 'utf8'),
    readFile('PERFORMANCE_HARNESS.md', 'utf8'),
    readFile('package.json', 'utf8')
]);

const functionSource = (name) => {
    const start = migration.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const next = migration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
    return migration.slice(start, next < 0 ? migration.length : next);
};

test('교사는 자기 학급의 제출 완료 일반 글만 불러와 글 나눔 공간에 직접 공개한다', () => {
    const candidates = functionSource('get_neighbor_teacher_share_candidates_v1');
    const publish = functionSource('publish_neighbor_class_post_v1');
    for (const source of [candidates, publish]) {
        assert.match(source, /post\.class_id = p_actor_class_id/);
        assert.match(source, /post\.is_submitted IS TRUE/);
        assert.match(source, /post\.recalled_at IS NULL/);
        assert.match(source, /NOT EXISTS[\s\S]*neighbor_activity_classes/);
    }
    assert.match(publish, /status = 'published'/);
    assert.match(functionSource('run_neighbor_teacher_action_v1'), /publish_gallery_post/);
    assert.match(teacherApi, /get_neighbor_teacher_share_candidates_v1/);
    assert.match(teacherEntry, /우리 학급 글 불러오기/);
    assert.match(teacherEntry, /공유에 올리기/);
});

test('글짝 명단은 호스트에게만 활동별 불투명 키와 이름을 최대 100명 반환한다', () => {
    const roster = functionSource('get_neighbor_exchange_roster_v1');
    assert.match(roster, /space\.host_class_id = p_actor_class_id/);
    assert.match(roster, /encode\(extensions\.digest/);
    assert.match(roster, /'sha256'/);
    assert.match(roster, /'student_key'/);
    assert.match(roster, /> 100/);
    assert.doesNotMatch(roster, /'student_id'/);
    assert.match(teacherApi, /get_neighbor_exchange_roster_v1/);
    assert.match(teacherApi, /\^\[a-f0-9\]\{64\}\$/);
});

test('호스트 매칭안은 학생마다 1~2명을 보장하고 상대 학급 교사 승인 뒤에만 미션을 연다', () => {
    const propose = functionSource('propose_neighbor_exchange_matches_v1');
    const review = functionSource('review_neighbor_exchange_matches_v1');
    assert.match(propose, /GREATEST\(v_first_count, v_second_count\) > LEAST\(v_first_count, v_second_count\) \* 2/);
    assert.match(propose, /partner_count, 0\) NOT BETWEEN 1 AND 2/);
    assert.match(propose, /status = 'matching_review'/);
    assert.match(review, /match_review_class_id <> p_actor_class_id/);
    assert.match(review, /SET status = 'matched'/);
    assert.match(review, /SET is_archived = FALSE/);
    assert.match(migration, /DROP FUNCTION IF EXISTS public\.match_neighbor_exchange_v1/);
    assert.match(teacherEntry, /학생 불러와 매칭하기/);
    assert.match(teacherEntry, /매칭 승인/);
});

test('글짝 전용과 두 학급 전체 공개 범위를 목록·상세·화면에서 같은 값으로 사용한다', () => {
    const summary = functionSource('get_neighbor_student_activities_v1');
    const access = functionSource('assert_neighbor_student_post_access_v1');
    const feed = functionSource('get_neighbor_activity_feed_v1');
    for (const source of [summary, access, feed]) {
        assert.match(source, /exchange_share_scope/);
    }
    assert.match(access, /neighbor_activity_classes/);
    assert.match(feed, /v_activity\.matched_at IS NULL/);
    assert.match(teacherEntry, /글짝끼리만 나누기/);
    assert.match(teacherEntry, /교환 뒤 전체 글 공개/);
    assert.match(studentEntry, /두 학급이 함께 보는 글/);
    assert.match(readme, /활동별 불투명 식별값/);
    assert.match(security, /1:1·1:2 매칭안/);
    assert.match(performance, /매칭 학생 불러오기/);
});

test('새 글 공유·매칭 계약 검사는 보안과 구조 검사에 함께 포함된다', () => {
    const scripts = JSON.parse(packageJson).scripts;
    assert.ok(scripts['test:security:static'].includes('neighborAgitTeacherSharingMatching.test.mjs'));
    assert.ok(scripts['test:architecture'].includes('neighborAgitTeacherSharingMatching.test.mjs'));
    assert.ok(scripts['smoke:neighbor-agit'].includes('20261239_neighbor_teacher_sharing_exchange_matching.sql'));
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, removal, candidateGrouping, teacherEntry, teacherCss, studentEntry, teacherApi, readme, security, performance, packageJson] = await Promise.all([
    readFile('supabase/migrations/20261239_neighbor_teacher_sharing_exchange_matching.sql', 'utf8'),
    readFile('supabase/migrations/20261254_neighbor_drop_exchange_activity.sql', 'utf8'),
    readFile('supabase/migrations/20261271_neighbor_share_candidates_by_mission.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8'),
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
    assert.match(teacherEntry, /전문 확인 후 공유/);
});

test('글 나눔 후보는 과제 주제를 함께 받아 필터 가능한 카드로 보여 준다', () => {
    assert.match(candidateGrouping, /'mission_id', post\.mission_id/);
    assert.match(candidateGrouping, /'mission_title', COALESCE\(mission\.title, '자율 글'\)/);
    assert.match(candidateGrouping, /mission\.id = post\.mission_id AND mission\.class_id = post\.class_id/);
    assert.match(teacherEntry, /galleryMissionFilter/);
    assert.match(teacherEntry, /neighbor-teacher__mission-chip/);
    assert.match(teacherCss, /candidate-list[^}]*grid-template-columns: repeat\(3/);
});

// 2026-09-06: 글짝 교환 활동을 제품에서 뺐다(SQL 61254). 매칭 계약 검사 세 개는 아래 제거 확인으로 대체한다.
test('글짝 교환의 서버 표면이 사라지고 주제 활동 경로는 살아 있다', () => {
    for (const rpc of ['get_neighbor_exchange_roster_v1', 'propose_neighbor_exchange_matches_v1', 'review_neighbor_exchange_matches_v1']) {
        assert.ok(removal.includes(`DROP FUNCTION IF EXISTS public.${rpc}(`), `${rpc} 를 지우지 않았습니다.`);
    }
    assert.match(removal, /DELETE FROM public\.neighbor_activities WHERE activity_type='exchange'/);
    assert.match(removal, /CHECK \(activity_type = 'topic'\)/);
    assert.match(removal, /p_activity_type <> 'topic'/);
    // 운영 중인 주제 활동 읽기 경로는 건드리지 않는다.
    assert.doesNotMatch(removal, /DROP TABLE/);
    assert.doesNotMatch(teacherApi, /getExchangeRoster/);
    assert.doesNotMatch(teacherEntry, /매칭/);
});

test('새 글 공유·매칭 계약 검사는 보안과 구조 검사에 함께 포함된다', () => {
    const scripts = JSON.parse(packageJson).scripts;
    assert.ok(scripts['test:security:static'].includes('neighborAgitTeacherSharingMatching.test.mjs'));
    assert.ok(scripts['test:architecture'].includes('neighborAgitTeacherSharingMatching.test.mjs'));
    assert.ok(scripts['smoke:neighbor-agit'].includes('20261239_neighbor_teacher_sharing_exchange_matching.sql'));
    assert.ok(scripts['smoke:neighbor-agit'].includes('20261254_neighbor_drop_exchange_activity.smoke.sql'), '제거 스모크를 등록해야 합니다.');
});

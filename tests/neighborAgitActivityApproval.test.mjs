import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [approvalMigration, matchingMigration, teacherEntry, studentEntry, activityTypes, missionForm, promptFields, teacherGuides, packageJson, readme, plan] = await Promise.all([
    readFile('supabase/migrations/20261238_neighbor_activity_teacher_approval.sql', 'utf8'),
    readFile('supabase/migrations/20261239_neighbor_teacher_sharing_exchange_matching.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/activityTypes.js', 'utf8'),
    readFile('src/components/teacher/MissionForm.jsx', 'utf8'),
    readFile('src/modules/writing/mission-form/MissionPromptFields.jsx', 'utf8'),
    readFile('src/constants/teacherGuides.js', 'utf8'),
    readFile('package.json', 'utf8'),
    readFile('src/modules/community/neighbor-agit/README.md', 'utf8'),
    readFile('NEIGHBOR_AGIT_PLAN.md', 'utf8')
]);
const migration = `${approvalMigration}\n${matchingMigration}`;

const functionSource = (name) => {
    const start = migration.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const next = migration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
    return migration.slice(start, next < 0 ? migration.length : next);
};

test('공동 활동은 참여 교사가 제안하고 다른 학급 승인을 기다리는 상태로 시작한다', () => {
    const create = functionSource('create_neighbor_activity_v1');
    assert.match(migration, /'pending_approval', 'open', 'matching_review', 'matched', 'closed'/);
    assert.match(create, /assert_neighbor_participating_teacher_v1/);
    assert.doesNotMatch(create, /호스트 교사만 새 활동/);
    assert.match(create, /'pending_approval', v_user_id/);
    assert.match(create, /CASE WHEN v_class_id = p_actor_class_id THEN 'approved' ELSE 'pending' END/);
    assert.match(create, /jsonb_build_array\('이웃 아지트'/);
});

test('승인 전 미션은 보관 상태이고 주제 활동만 마지막 활동 승인 뒤 학급에 열린다', () => {
    const create = functionSource('create_neighbor_activity_v1');
    const review = functionSource('review_neighbor_activity_v1');
    assert.match(create, /'\[\]'::JSONB,[\s\S]*TRUE[\s\S]*FROM public\.classes/);
    assert.match(review, /approval\.status = 'pending'/);
    assert.match(review, /NOT EXISTS[\s\S]*approval\.status = 'pending'/);
    assert.match(review, /UPDATE public\.neighbor_activities SET status = 'open'/);
    assert.match(review, /v_activity\.activity_type = 'topic'/);
    assert.match(review, /SET is_archived = FALSE/);
});

test('글짝 활동은 활동 승인 뒤에도 매칭안 상대 교사 승인 전까지 미션을 열지 않는다', () => {
    const reviewActivity = functionSource('review_neighbor_activity_v1');
    const reviewMatch = functionSource('review_neighbor_exchange_matches_v1');
    assert.match(reviewActivity, /v_activity\.activity_type = 'topic'/);
    assert.match(reviewMatch, /status <> 'matching_review'/);
    assert.match(reviewMatch, /match_review_class_id <> p_actor_class_id/);
    assert.match(reviewMatch, /SET status = 'matched'/);
    assert.match(reviewMatch, /SET is_archived = FALSE/);
});

test('상대 교사가 거절하면 활동을 닫고 보관된 미션을 학생에게 열지 않는다', () => {
    const review = functionSource('review_neighbor_activity_v1');
    assert.match(review, /SET status = 'rejected'/);
    assert.match(review, /SET status = 'cancelled'/);
    assert.match(review, /SET status = 'closed', closed_at = NOW\(\)/);
});

test('승인 원장은 브라우저와 service_role 직접 접근을 막고 교사 행동 RPC만 공개한다', () => {
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.neighbor_activity_approvals/);
    assert.match(migration, /ALTER TABLE public\.neighbor_activity_approvals ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.neighbor_activity_approvals FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.review_neighbor_activity_v1[\s\S]*FROM PUBLIC, anon, authenticated, service_role/);
    assert.doesNotMatch(migration, /GRANT EXECUTE ON FUNCTION public\.review_neighbor_activity_v1/);
    assert.match(functionSource('run_neighbor_teacher_action_v1'), /p_action = 'review_activity'/);
});

test('승인 대기 활동은 학생 요약과 직접 활동 피드 양쪽에서 차단한다', () => {
    const summary = functionSource('get_neighbor_student_activities_v1');
    const feed = functionSource('get_neighbor_activity_feed_v1');
    assert.match(summary, /approval\.status <> 'approved'/);
    assert.match(feed, /approval\.status <> 'approved'/);
    assert.match(feed, /교사 승인이 끝난 뒤 학생에게 공개됩니다/);
    assert.doesNotMatch(studentEntry, /pending_approval/);
});

test('교사 화면은 호스트·게스트 모두 제안하고 상대 교사가 승인 또는 거절한다', () => {
    assert.match(teacherEntry, /새 \{getNeighborActivityLabel\(activeActivityTab\)\} 제안하기/);
    assert.match(teacherEntry, /\{getNeighborActivityLabel\(activeActivityTab\)\} 제안하기<\/Button>/);
    assert.ok(teacherEntry.includes('활동 승인'));
    assert.ok(teacherEntry.includes('활동 제안을 거절했습니다.'));
    assert.match(teacherEntry, /activity\.can_review/);
    assert.doesNotMatch(teacherEntry, /workspace\.space\.my_role === 'host' && \(\s*<form className="neighbor-teacher-card neighbor-teacher__activity-form"/);
});

test('일반 미션과 이웃 공동 활동은 같은 주제·안내 제시틀을 사용한다', () => {
    assert.match(missionForm, /import MissionPromptFields from '..\/..\/modules\/writing\/mission-form\/MissionPromptFields'/);
    assert.match(teacherEntry, /import MissionPromptFields from '..\/..\/writing\/mission-form\/MissionPromptFields'/);
    assert.match(missionForm, /<MissionPromptFields[\s\S]*title=\{formData\.title\}[\s\S]*guide=\{formData\.guide\}/);
    assert.match(teacherEntry, /<MissionPromptFields[\s\S]*title=\{activityForm\.title\}[\s\S]*guide=\{activityForm\.prompt\}/);
    assert.match(promptFields, /저장 방식은 소유하지 않고/);
    assert.match(promptFields, /aria-label="글쓰기 주제"/);
    assert.match(promptFields, /aria-label="학생 글쓰기 안내"/);
    assert.match(teacherGuides, /일반 글쓰기 미션을 제시할 때와 같은 입력틀/);
});

test('세 활동의 현재 이름과 기존 미션 재사용 설명을 한 계약으로 유지한다', () => {
    for (const label of ['글 나눔 공간', '함께 쓰는 주제', '글짝 교환 활동']) {
        assert.ok(activityTypes.includes(label));
    }
    assert.match(teacherEntry, /getNeighborActivityLabel/);
    assert.match(studentEntry, /getNeighborActivityLabel/);
    assert.match(readme, /기존 `writing_missions` 과제/);
    assert.match(plan, /교사.*승인/);
    const scripts = JSON.parse(packageJson).scripts;
    assert.ok(scripts['test:architecture'].includes('neighborAgitActivityApproval.test.mjs'));
    assert.ok(scripts['test:security:static'].includes('neighborAgitActivityApproval.test.mjs'));
});

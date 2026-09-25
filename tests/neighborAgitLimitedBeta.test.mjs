import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, reconciliation, adminOwnerMigration, foundationSmoke, panel, adminApi, teacherEntry, teacherApi, studentEntry, studentApi, security, performance] = await Promise.all([
    readFile('supabase/migrations/20261201_neighbor_limited_beta.sql', 'utf8'),
    readFile('supabase/migrations/20261235_neighbor_limited_beta_checksum_reconciliation.sql', 'utf8'),
    readFile('supabase/migrations/20261236_neighbor_admin_owned_limited_classes.sql', 'utf8'),
    readFile('tests/sql/20261199_neighbor_agit_data_foundation.smoke.sql', 'utf8'),
    readFile('src/components/admin/AdminNeighborAgitPanel.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/adminApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/teacherApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/api.js', 'utf8'),
    readFile('SECURITY_HARNESS.md', 'utf8'),
    readFile('PERFORMANCE_HARNESS.md', 'utf8')
]);

const effectiveMigration = `${migration}\n${adminOwnerMigration}`;

const functionSource = (name) => {
    const start = effectiveMigration.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const next = effectiveMigration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
    return effectiveMigration.slice(start, next < 0 ? effectiveMigration.length : next);
};

test('제한 공개 원장과 변경 이력은 직접 접근 없이 관리자 RPC로만 다룬다', () => {
    assert.match(migration, /mode IN \('internal', 'limited_beta', 'public_beta', 'paused'\)/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.neighbor_limited_classes/);
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.neighbor_limited_class_events/);
    assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.neighbor_limited_classes[\s\S]*service_role/);
    const setter = functionSource('set_neighbor_limited_class_v1');
    assert.match(setter, /assert_neighbor_admin_v1\(\)/);
    assert.match(setter, />= 8/);
    assert.match(setter, /neighbor_internal_test_classes/);
    assert.match(setter, /neighbor_limited_class_events/);
});

test('제한 공개는 두 허용 학급이 있어야 열리고 전체 공개의 기존 6항목 확인은 유지한다', () => {
    const change = functionSource('change_neighbor_rollout_v1');
    assert.match(change, /p_mode = 'limited_beta'[\s\S]*count\(\*\)[\s\S]*< 2/);
    assert.match(change, /p_mode = 'public_beta'[\s\S]*neighbor_acceptance_ready_v1/);
    assert.match(change, /p_confirmation <> '전체 교사 Beta 공개'/);
    assert.match(panel, /선택한 학급으로 제한 공개 시작/);
    assert.match(panel, /limitedClassCount < 2/);
    assert.match(panel, /role="switch"/);
    assert.match(panel, /제한 공개[\s\S]*정상 공개/);
    assert.match(adminApi, /set_neighbor_limited_class_v1/);
});

test('제한 공개 후보는 승인 교사 학급과 현재 관리자가 직접 소유한 실제 학급으로 한정한다', () => {
    const setter = functionSource('set_neighbor_limited_class_v1');
    const dashboard = functionSource('get_neighbor_admin_dashboard_v1');
    for (const source of [setter, dashboard]) {
        assert.match(source, /profile\.role = 'TEACHER'[\s\S]*profile\.is_approved IS TRUE[\s\S]*profile\.approval_revoked_at IS NULL/);
        assert.match(source, /profile\.role = 'ADMIN'[\s\S]*profile\.id = v_user_id/);
        assert.match(source, /neighbor_internal_test_classes/);
    }
});

test('서버는 제한 공개 학급만 교사·학생 권한과 홈 카드 신호를 허용한다', () => {
    const release = functionSource('neighbor_class_is_released_v1');
    const teacher = functionSource('assert_neighbor_teacher_class_v1');
    const student = functionSource('assert_neighbor_student_access_v1');
    const bootstrap = functionSource('get_student_home_bootstrap_v1');
    assert.match(release, /WHEN 'limited_beta'[\s\S]*neighbor_limited_classes/);
    assert.match(release, /WHEN 'public_beta' THEN TRUE/);
    assert.match(teacher, /neighbor_class_is_released_v1\(p_class_id\)/);
    assert.match(student, /neighbor_class_is_released_v1\(v_class_id\)/);
    assert.match(bootstrap, /neighbor_class_is_released_v1\(membership\.class_id\)/);
});

test('교사 작업 공간은 한 번 읽고 행동도 한 번의 RPC 응답으로 최신 화면을 돌려준다', () => {
    const workspace = functionSource('get_neighbor_teacher_workspace_v1');
    const action = functionSource('run_neighbor_teacher_action_v1');
    assert.match(workspace, /LIMIT 100/);
    assert.match(workspace, /LIMIT 50/);
    assert.match(action, /create_neighbor_space_v1/);
    assert.match(action, /review_neighbor_shared_post_v1/);
    assert.match(action, /moderate_neighbor_item_v1/);
    assert.match(action, /'workspace', public\.get_neighbor_teacher_workspace_v1/);
    // 2026-09-06에 글짝 명단 RPC 를 걷어내 호출이 6개에서 5개가 됐고,
    // 2026-09-19에 교사 활동 글 후보 조회를 더해 7→8이 됐다.
    // 2026-09-23: ③ 댓글·반응 반별 조회(get_neighbor_teacher_engagement_v1) 하나를 더했다. 9 → 10.
    // 2026-09-25: 같이 쓰기 광장 진행 현황을 봤다고 남기는 mark_neighbor_topic_seen_v1 하나를 더했다. 10 → 11.
    // 2026-09-25: 같이 쓰기 광장 주제 삭제(delete_neighbor_activity_v1) 하나를 더했다. 11 → 12.
    assert.equal((teacherApi.match(/supabase\.rpc\(/g) || []).length, 12);
    assert.match(teacherApi, /get_neighbor_teacher_share_candidates_v1/);
    assert.doesNotMatch(teacherApi, /get_neighbor_exchange_roster_v1/);
    assert.match(teacherEntry, /setWorkspace\(next\.workspace\)/);
    assert.doesNotMatch(`${teacherEntry}\n${teacherApi}`, /setInterval|postgres_changes|supabase\.from\(/);
});

test('학생 공개 요청 시스템은 제거되고, 글 공개는 교사가 직접 정한다', async () => {
    // 2026-09-19: 학생이 "내 글 공개해 주세요"라고 요청하던 시스템을 없앴다.
    const decide = await readFile('supabase/migrations/20261317_neighbor_teacher_decides_publishing.sql', 'utf8');
    // 학생 화면·api 에서 요청·회수·후보 흐름이 사라졌다.
    assert.doesNotMatch(studentEntry, /공개 요청|공개할 내 글 고르기|requestShare|recallShare|requestActivityShare/);
    assert.doesNotMatch(studentApi, /request_neighbor_post_share_v1|recall_my_neighbor_shared_post_v1|get_neighbor_my_share_candidates_v1|request_neighbor_activity_post_v1/);
    // 서버의 요청 계열 함수는 거절로 바뀌었다(권한/서명은 유지).
    for (const fn of ['request_neighbor_post_share_v1', 'request_neighbor_activity_post_v1', 'recall_my_neighbor_shared_post_v1', 'get_neighbor_my_share_candidates_v1']) {
        assert.match(decide, new RegExp(`FUNCTION public\\.${fn}[\\s\\S]*?RAISE EXCEPTION`), `${fn} 를 거절로 바꾸지 않았습니다.`);
    }
    // 교사가 직접 공개: 활동 글 후보 조회 + 직접 공개 함수.
    assert.match(teacherApi, /get_neighbor_teacher_activity_candidates_v1/);
    assert.match(decide, /publish_neighbor_activity_post_v1/);
    assert.match(teacherEntry, /publish_activity_post/);
});

test('제한 공개의 직접 권한·요청 상한이 보안과 성능 정본에 기록된다', () => {
    assert.match(security, /제한 공개/);
    assert.match(performance, /이웃 아지트 교사 작업 공간/);
    assert.match(performance, /내 글 공개 후보/);
});

test('적용 뒤 서식만 바뀐 마이그레이션은 함수 정의를 검증한 새 파일로 checksum을 보정한다', () => {
    assert.match(reconciliation, /3e46ce9365f24bb08ce34648f6bee17f896258b8ddd397eded57883085f043d9/);
    assert.match(reconciliation, /25e0c973cf30d02cc81bfd53b47b22b42067e5af1078ee34b102a480ab886914/);
    assert.equal((reconciliation.match(/compact_definition_hash/g) || []).length, 2);
    assert.equal((reconciliation.match(/\('[a-z0-9_]+\([^']*\)', '[a-f0-9]{32}'\)/g) || []).length, 13);
    assert.match(reconciliation, /pg_get_functiondef/);
    assert.match(reconciliation, /예상하지 못한 20261201 checksum/);
});

test('기반 스모크는 이미 운영 중인 내부 시험 공간의 학급을 후보에서 제외한다', () => {
    assert.ok((foundationSmoke.match(/existing_membership\.status IN \('pending', 'active'\)/g) || []).length >= 3);
});

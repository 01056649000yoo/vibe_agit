import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [activityMigration, approvalMigration, matchingMigration, teacherEntry, studentEntry, activityTypes, teacherApi, studentApi, app, navigation, missionSubmit, readme, security, performance] = await Promise.all([
    readFile('supabase/migrations/20261237_neighbor_activity_spaces.sql', 'utf8'),
    readFile('supabase/migrations/20261238_neighbor_activity_teacher_approval.sql', 'utf8'),
    readFile('supabase/migrations/20261239_neighbor_teacher_sharing_exchange_matching.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/activityTypes.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/teacherApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/api.js', 'utf8'),
    readFile('src/App.jsx', 'utf8'),
    readFile('src/components/student/studentNavigation.js', 'utf8'),
    readFile('src/hooks/useMissionSubmit.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/README.md', 'utf8'),
    readFile('SECURITY_HARNESS.md', 'utf8'),
    readFile('PERFORMANCE_HARNESS.md', 'utf8')
]);
const migration = `${activityMigration}\n${approvalMigration}\n${matchingMigration}`;

const functionSource = (name) => {
    const start = migration.lastIndexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const next = migration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
    return migration.slice(start, next < 0 ? migration.length : next);
};

test('이웃 아지트는 글 나눔 공간·함께 쓰는 주제·글짝 교환 활동을 탭으로 구분한다', () => {
    assert.match(migration, /activity_type IN \('topic', 'exchange'\)/);
    assert.match(migration, /activity_id UUID/);
    for (const label of ['글 나눔 공간', '함께 쓰는 주제', '글짝 교환 활동']) {
        assert.ok(activityTypes.includes(label), `공용 활동 이름에 ${label} 표시가 없습니다.`);
    }
    assert.match(teacherEntry, /NEIGHBOR_ACTIVITY_TABS\.map/);
    assert.match(teacherEntry, /aria-label="세 가지 활동 전환"/);
    assert.match(studentEntry, /NEIGHBOR_ACTIVITY_TABS\.map/);
    assert.match(readme, /세 가지 활동/);
});

test('활동 원장·참여 학급·글짝은 브라우저와 service_role이 직접 읽지 못한다', () => {
    for (const table of ['neighbor_activities', 'neighbor_activity_classes', 'neighbor_exchange_matches']) {
        assert.ok(migration.includes(`CREATE TABLE IF NOT EXISTS public.${table}`), `${table} 생성문이 없습니다.`);
        assert.ok(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`), `${table} RLS가 없습니다.`);
        assert.ok(migration.includes(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role`), `${table} 직접 권한 회수가 없습니다.`);
    }
    assert.match(security, /글짝 교환/);
});

test('공동 주제와 글짝 글쓰기는 학급별 기존 과제를 만들어 공용 편집기를 재사용한다', () => {
    const create = functionSource('create_neighbor_activity_v1');
    assert.match(create, /INSERT INTO public\.writing_missions/);
    assert.match(create, /INSERT INTO public\.neighbor_activity_classes/);
    assert.match(studentEntry, /onNavigate\('writing'/);
    assert.match(app, /NeighborAgitStudentEntry[\s\S]*onNavigate=\{setInternalPage\}/);
    assert.match(navigation, /params\?\.returnTo === 'neighbor_agit'/);
    assert.match(missionSubmit, /params\?\.returnTo === 'neighbor_agit'/);
});

test('호스트는 두 학급 전체 학생을 직접 1:1·1:2 매칭하고 상대 교사에게 승인을 요청한다', () => {
    const create = functionSource('create_neighbor_activity_v1');
    const roster = functionSource('get_neighbor_exchange_roster_v1');
    const match = functionSource('propose_neighbor_exchange_matches_v1');
    const review = functionSource('review_neighbor_exchange_matches_v1');
    assert.match(create, /cardinality\(p_exchange_class_ids\) <> 2/);
    assert.match(roster, /student\.auth_id IS NOT NULL/);
    assert.match(roster, /digest[\s\S]*sha256/);
    assert.doesNotMatch(roster, /'student_id'/);
    assert.match(match, /GREATEST\(v_first_count, v_second_count\) > LEAST\(v_first_count, v_second_count\) \* 2/);
    assert.match(match, /partner_count, 0\) NOT BETWEEN 1 AND 2/);
    assert.match(match, /INSERT INTO public\.neighbor_exchange_matches/);
    assert.match(match, /status = 'matching_review'/);
    assert.match(review, /status = 'matched'/);
    assert.match(review, /SET is_archived = FALSE/);
    assert.match(teacherEntry, /학생 불러와 매칭하기/);
    assert.match(teacherEntry, /상대 교사에게 승인 요청/);
    assert.match(teacherEntry, /매칭 승인/);
});

test('글짝 글은 선택한 범위에 따라 배정 상대 또는 활동의 두 학급에만 열린다', () => {
    const access = functionSource('assert_neighbor_student_post_access_v1');
    const feed = functionSource('get_neighbor_activity_feed_v1');
    const summary = functionSource('get_neighbor_student_activities_v1');
    for (const source of [access, feed]) {
        assert.match(source, /neighbor_exchange_matches/);
        assert.match(source, /partner_student_id/);
    }
    assert.match(feed, /shared\.student_id = v_student_id/);
    assert.match(summary, /match\.partner_student_id = published\.student_id/);
    assert.match(feed, /exchange_share_scope = 'space'/);
    assert.match(access, /neighbor_activity_classes/);
    assert.match(feed, /v_activity\.matched_at IS NULL/);
});

test('학생 글과 댓글은 폐쇄 공간에서 등록 이름으로 보이고 내부 학생 ID는 응답하지 않는다', () => {
    const request = functionSource('request_neighbor_post_share_v1');
    const detail = functionSource('get_neighbor_shared_post_v1');
    const comment = functionSource('save_neighbor_comment_v1');
    assert.match(migration, /SET public_author_name = left\(btrim\(student\.name\), 30\)/);
    assert.match(request, /left\(btrim\(student\.name\), 30\)/);
    assert.match(detail, /JOIN public\.students comment_student/);
    assert.match(comment, /v_student_name/);
    assert.doesNotMatch(`${request}\n${detail}\n${comment}`, /neighbor_public_author_name_v1/);
    assert.doesNotMatch(studentEntry, /이웃 작가/);
});

test('학생 활동 목록은 최초 피드 응답에 합치고 활동 글은 열 때만 전용 RPC 한 번으로 읽는다', () => {
    const gallery = functionSource('get_neighbor_space_feed_v1');
    const activityFeed = functionSource('get_neighbor_activity_feed_v1');
    assert.match(gallery, /'activities'/);
    assert.match(activityFeed, /LIMIT v_limit \+ 1/);
    assert.match(studentApi, /get_neighbor_activity_feed_v1/);
    assert.match(studentApi, /request_neighbor_activity_post_v1/);
    assert.doesNotMatch(`${teacherEntry}\n${studentEntry}`, /setInterval|postgres_changes/);
    assert.match(performance, /이웃 아지트 활동/);
});

test('교사 활동 생성·매칭안·승인·종료는 작업공간 RPC 한 번의 최신 응답으로 끝난다', () => {
    const action = functionSource('run_neighbor_teacher_action_v1');
    assert.match(action, /create_activity/);
    assert.match(action, /propose_exchange_matches/);
    assert.match(action, /review_exchange_matches/);
    assert.match(action, /run_neighbor_teacher_action_core_20261238/);
    assert.match(teacherEntry, /close_activity/);
    assert.match(action, /get_neighbor_teacher_workspace_v1/);
    assert.equal((teacherApi.match(/supabase\.rpc\(/g) || []).length, 5);
});

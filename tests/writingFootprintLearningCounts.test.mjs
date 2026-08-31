import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
    migration,
    smoke,
    dashboard,
    detailModal,
    accuracyMigration,
    accuracySmoke,
    dashboardCards,
    spellingManifest
] = await Promise.all([
    readFile('supabase/migrations/20261171_footprint_learning_counts_and_spelling_labels.sql', 'utf8'),
    readFile('tests/sql/20261171_footprint_learning_counts_and_spelling_labels.smoke.sql', 'utf8'),
    readFile('src/modules/writing/writing-footprint/TeacherWritingFootprintDashboard.jsx', 'utf8'),
    readFile('src/modules/writing/writing-footprint/StudentFootprintDetailModal.jsx', 'utf8'),
    readFile('supabase/migrations/20261209_class_footprint_accuracy_and_insights.sql', 'utf8'),
    readFile('tests/sql/20261209_class_footprint_accuracy_and_insights.smoke.sql', 'utf8'),
    readFile('src/modules/writing/writing-footprint/dashboardCards.js', 'utf8'),
    readFile('src/modules/writing/spelling-learning/manifest.js', 'utf8')
]);

test('학생별 학습 횟수는 다시쓰기 요청과 과제 수정 제출을 각각 센다', () => {
    assert.match(migration, /event\.event_type = 'writing\.rewrite_requested'/);
    assert.match(migration, /event\.event_type = 'post_resubmitted'/);
    assert.match(migration, /event\.metadata->>'writing_context' = 'assignment'/);
    assert.match(migration, /event\.class_id = p_class_id/g);
    assert.match(migration, /'rewrite_requests', COALESCE\(rewrite\.total, 0\)/);
    assert.match(migration, /'revision_submissions', COALESCE\(submission\.total, 0\)/);
    assert.match(smoke, /다시쓰기 요청 횟수가 증가하지 않았습니다/);
    assert.match(smoke, /수정 제출 횟수가 증가하지 않았습니다/);
});

test('학생별 현황과 상세 화면은 모호한 다듬기 대신 두 실제 횟수를 보여 준다', () => {
    assert.match(dashboard, />학습 횟수</);
    assert.match(dashboard, /다시쓰기 요청 \$\{num\(student\.rewrite_requests\)\}회/);
    assert.match(dashboard, /수정 제출 \$\{num\(student\.revision_submissions\)\}회/);
    assert.doesNotMatch(dashboard, /student\.revisions|>다듬기</);
    assert.match(detailModal, /title="학습 횟수"/);
    assert.match(detailModal, /student\.rewrite_requests/);
    assert.match(detailModal, /student\.revision_submissions/);
    assert.doesNotMatch(detailModal, /student\.revisions|title="다듬기"/);
});

test('맞춤법 발자국은 없는 detail 부모를 먼저 만든 뒤 통계를 넣는다', () => {
    assert.match(migration, /COALESCE\(v_base->'detail', '\{\}'::JSONB\)/);
    assert.match(migration, /jsonb_build_object\('spelling_labels', v_labels\)/);
    assert.match(migration, /stats\.class_id = p_class_id/);
    assert.match(migration, /stats\.event_date >= CURRENT_DATE - 30/);
    assert.match(smoke, /detail\.spelling_labels에 담기지 않았습니다/);
});

test('발자국 완료 시각은 과제 승인일과 자율 글 완료본 생성일을 한 기준으로 사용한다', () => {
    assert.match(accuracyMigration, /THEN COALESCE\(post\.approved_at, post\.updated_at, post\.created_at\)/);
    assert.match(accuracyMigration, /ELSE post\.created_at\s+END AS completed_at/);
    assert.match(accuracyMigration, /v_year_start \+ INTERVAL '11 months' - INTERVAL '1 day'/);
    assert.match(accuracyMigration, /count\(DISTINCT \(completed_at AT TIME ZONE 'Asia\/Seoul'\)::DATE\)/);
    assert.match(accuracyMigration, /idx_student_posts_class_completed_at[\s\S]*class_id,[\s\S]*COALESCE\(approved_at, updated_at, created_at\)[\s\S]*DESC/);
    assert.match(accuracySmoke, /과제 생성일 변경이 승인일 기준 발자국을 바꿨습니다/);
});

test('친구 교류는 자기 글을 제외하고 남김과 받음을 실제 이벤트 수로 센다', () => {
    assert.match(accuracyMigration, /comment\.student_id IS DISTINCT FROM post\.student_id/);
    assert.match(accuracyMigration, /reaction\.student_id IS DISTINCT FROM post\.student_id/);
    assert.match(accuracyMigration, /SELECT comment\.owner_student_id AS student_id, count\(\*\)::INTEGER AS comments_received/);
    assert.match(accuracySmoke, /자기 글 댓글·반응이 친구 교류에 포함됐습니다/);
});

test('학급 합계와 학생 행은 요청한 활동·피드백·포인트 분리 지표를 함께 제공한다', () => {
    for (const key of [
        'assignment_posts',
        'reading_logs',
        'diaries',
        'active_days',
        'activity_points_earned',
        'teacher_adjustment_points'
    ]) {
        assert.ok(accuracyMigration.includes(`'${key}'`), `${key} 집계 키가 없습니다.`);
    }
    assert.match(accuracyMigration, /count\(\*\) FILTER \(WHERE event\.event_type = 'feedback_received'\)/);
    assert.match(accuracyMigration, /WHERE amount > 0\s+AND activity_type NOT IN \('private_adjustment', 'starting_bonus'\)/);
    assert.match(dashboardCards, /label: '학급 활동일'/);
    assert.match(dashboardCards, /label: '과제 글'/);
    assert.match(dashboardCards, /label: '독서록'/);
    assert.match(dashboardCards, /label: '일기'/);
    assert.match(dashboardCards, /label: '활동 포인트'/);
    assert.match(dashboardCards, /label: '교사 조정'/);
    assert.match(dashboardCards, /title: '🎁 활동 포인트 획득처'/);
    assert.match(dashboard, /student\.feedbacks_received/);
    assert.match(dashboard, /student\.activity_points_earned/);
    assert.match(dashboard, /student\.teacher_adjustment_points/);
    assert.match(detailModal, /student\.feedbacks_received/);
    assert.match(detailModal, /student\.activity_points_earned/);
    assert.match(detailModal, /student\.teacher_adjustment_points/);
    assert.match(accuracySmoke, /글 유형 합계 또는 학급 활동일이 원자료와 다릅니다/);
    assert.match(accuracySmoke, /학생별 교사 피드백 횟수가 이벤트와 다릅니다/);
    assert.match(accuracySmoke, /활동 포인트와 교사 조정 포인트가 원장과 다릅니다/);
});

test('맞춤법 카드가 읽는 경로와 공개 RPC 응답 경로가 일치한다', () => {
    assert.match(spellingManifest, /rowsPath: 'detail\.spelling_labels'/);
    assert.match(accuracyMigration, /jsonb_set\(v_base, '\{spelling_labels\}', v_labels, TRUE\)/);
    assert.match(accuracySmoke, /v_after->'spelling_labels'/);
});

test('발자국 코어는 브라우저 역할에 숨기고 권한 검사 공개 RPC만 연다', () => {
    assert.match(accuracyMigration, /REVOKE ALL ON FUNCTION public\.get_class_writing_footprint_dashboard_core_v1\(UUID\)\s+FROM PUBLIC, anon, authenticated/);
    assert.match(accuracyMigration, /GRANT EXECUTE ON FUNCTION public\.get_class_writing_footprint_dashboard\(UUID\)\s+TO authenticated, service_role/);
    assert.match(accuracySmoke, /학급 발자국 내부 코어와 공개 RPC 권한 경계가 올바르지 않습니다/);
});

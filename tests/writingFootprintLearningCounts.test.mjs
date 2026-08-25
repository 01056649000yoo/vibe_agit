import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, smoke, dashboard, detailModal] = await Promise.all([
    readFile('supabase/migrations/20261171_footprint_learning_counts_and_spelling_labels.sql', 'utf8'),
    readFile('tests/sql/20261171_footprint_learning_counts_and_spelling_labels.smoke.sql', 'utf8'),
    readFile('src/modules/writing/writing-footprint/TeacherWritingFootprintDashboard.jsx', 'utf8'),
    readFile('src/modules/writing/writing-footprint/StudentFootprintDetailModal.jsx', 'utf8')
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

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, smoke, stats, hook] = await Promise.all([
    readFile('supabase/migrations/20261214_student_writing_footprint_insights.sql', 'utf8'),
    readFile('tests/sql/20261214_student_writing_footprint_insights.smoke.sql', 'utf8'),
    readFile('src/modules/writing/writing-footprint/StudentWritingFootprintStats.jsx', 'utf8'),
    readFile('src/modules/writing/writing-footprint/useMyWritingFootprint.js', 'utf8')
]);

test('학생 발자국은 실제 학생 연결과 자기 학급·학생 범위만 집계한다', () => {
    assert.match(migration, /student\.auth_id = auth\.uid\(\)/);
    assert.match(migration, /post\.class_id = v_class_id/);
    assert.match(migration, /post\.student_id = v_student_id/);
    assert.match(migration, /event\.class_id = v_class_id/g);
    assert.match(migration, /event\.student_id = v_student_id/g);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_my_writing_footprint_detail\(\) FROM PUBLIC, anon/);
});

test('학생 발자국은 완료 시각과 글 종류를 같은 완료 글 원본에서 센다', () => {
    assert.match(migration, /THEN COALESCE\(post\.approved_at, post\.updated_at, post\.created_at\)/);
    assert.match(migration, /ELSE post\.created_at\s+END AS completed_at/);
    assert.match(migration, /public\.writing_counts_as_completed/);
    for (const key of ['assignment_posts', 'reading_logs', 'diaries', 'other_self_posts']) {
        assert.ok(migration.includes(`'${key}'`), `${key} 집계가 없습니다.`);
    }
    assert.match(migration, /FROM level_posts[\s\S]*writing_context = 'assignment'/);
});

test('학생이 이해할 성장 정보는 학습 주기·최근 30일·포인트 출처를 분리한다', () => {
    for (const key of [
        'rewrite_requests',
        'revision_submissions',
        'feedbacks_received',
        'activity_points_earned',
        'teacher_adjustment_points',
        'starting_bonus_points',
        'avg_chars_change'
    ]) {
        assert.ok(migration.includes(`'${key}'`), `${key} 응답 키가 없습니다.`);
    }
    assert.match(migration, /event\.event_type = 'writing\.rewrite_requested'/);
    assert.match(migration, /event\.event_type = 'post_resubmitted'/);
    assert.match(migration, /event\.event_type = 'feedback_received'/);
    assert.match(migration, /v_today - 29/);
    assert.match(smoke, /학생 완료 글 또는 글 종류 집계가 원자료와 다릅니다/);
    assert.match(smoke, /학생 활동 포인트와 교사 조정 집계가 원장과 다릅니다/);
    assert.match(smoke, /학생이 받은 교사 피드백 횟수가 이벤트와 다릅니다/);
});

test('학생 화면은 순위 대신 자기 성장·글 종류·고친 기록을 쉬운 말로 보여 준다', () => {
    for (const label of [
        '내 성장 한눈에',
        '어떤 글을 썼나',
        '배우며 고친 기록',
        '최근 30일',
        '선생님 과제',
        '독서록',
        '일기',
        '받은 의견',
        '고쳐서 제출',
        '활동으로 모음'
    ]) {
        assert.ok(stats.includes(label), `${label} 학생 안내가 없습니다.`);
    }
    assert.doesNotMatch(stats, /학급 순위|반 평균|등수/);
});

test('발자국은 화면을 열 때 기존 상세 경로만 읽고 폴링·Realtime을 만들지 않는다', () => {
    assert.equal((hook.match(/supabase\.rpc\(/g) || []).length, 2);
    assert.match(hook, /get_my_writing_footprint_detail/);
    assert.match(hook, /get_my_point_spending_breakdown/);
    assert.doesNotMatch(hook, /setInterval|postgres_changes|\.channel\(/);
});

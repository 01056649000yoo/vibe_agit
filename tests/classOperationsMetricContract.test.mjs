import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [migration, cards, dashboard] = await Promise.all([
    readFile('supabase/migrations/20261172_class_operations_metric_contract.sql', 'utf8'),
    readFile('src/components/teacher/classOperationsCards.js', 'utf8'),
    readFile('src/components/teacher/ClassAnalysis.jsx', 'utf8'),
]);

test('운영 현황은 고쳐쓰기를 다시쓰기 요청과 수정 제출로 나눈다', () => {
    assert.match(cards, /label: '다시쓰기 요청'[\s\S]*?summary\.rewrite_requests/);
    assert.match(cards, /label: '수정 제출'[\s\S]*?summary\.revision_submissions/);
    assert.doesNotMatch(cards, /label: '고쳐쓰기'|summary\.revisions/);

    assert.match(migration, /event\.event_type = 'writing\.rewrite_requested'/);
    assert.match(migration, /event\.event_type = 'post_resubmitted'[\s\S]*?writing_context/);
    assert.match(migration, /'rewrite_requests'/);
    assert.match(migration, /'revision_submissions'/);
});

test('피드백은 분리할 수 없는 과거 원장에 맞춰 피드백 반영으로 표시한다', () => {
    assert.match(cards, /label: '피드백 반영'/);
    assert.match(cards, /AI 피드백·교사 의견 저장/);
    assert.match(cards, /summary\.feedback_updates/);
    assert.doesNotMatch(cards, /label: '받은 피드백'|summary\.feedbacks/);
    assert.match(migration, /event\.event_type = 'feedback_received'/);
});

test('작성 완료 글은 현재 제출 상태가 아닌 최초 제출 이력을 센다', () => {
    const historyStart = migration.indexOf('submitted_post_history AS MATERIALIZED');
    const periodStart = migration.indexOf('period_posts AS MATERIALIZED', historyStart);
    const history = migration.slice(historyStart, periodStart);

    assert.match(history, /post\.first_submitted_at/);
    assert.match(history, /submission\.first_submitted_event_at/);
    assert.match(history, /post\.is_returned IS TRUE/);
    assert.doesNotMatch(history, /WHERE post\.is_submitted IS TRUE/);
    assert.match(migration, /'submitted_posts', \(SELECT COUNT\(\*\)::INTEGER FROM period_posts\)/);
});

test('접속과 기간 이벤트는 인증 기록 보완 및 현재 활성 학생 범위를 사용한다', () => {
    assert.match(migration, /LEFT JOIN auth\.users auth_user ON auth_user\.id = student\.auth_id/);
    assert.match(migration, /GREATEST\(student\.last_login, auth_user\.last_sign_in_at\)/);
    assert.match(migration, /student\.is_active IS DISTINCT FROM FALSE/);
    assert.match(migration, /student\.deleted_at IS NULL OR student\.deleted_at > NOW\(\)/);
    assert.match(migration, /period_events AS MATERIALIZED[\s\S]*?JOIN active_roster student ON student\.id = event\.student_id/);
    assert.match(migration, /period_rewrite_requests AS MATERIALIZED[\s\S]*?JOIN active_roster student ON student\.id = event\.student_id/);
    assert.match(dashboard, /인증 서버의 최근 로그인 중 확인 가능한 최신 기록/);
    assert.match(dashboard, /기록 기능 도입 전 내역이 일부 빠질 수 있습니다/);
    assert.match(dashboard, /현재 활성 학생의 기간 기록만 집계합니다/);
});

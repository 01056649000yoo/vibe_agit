import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { NEIGHBOR_AGIT_LIMITS } from '../src/modules/community/neighbor-agit/policy.js';

const [migration, smoke, manifest, dashboard, app, api, entry] = await Promise.all([
    readFile('supabase/migrations/20261199_neighbor_agit_data_foundation.sql', 'utf8'),
    readFile('tests/sql/20261199_neighbor_agit_data_foundation.smoke.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/manifest.js', 'utf8'),
    readFile('src/components/student/DashboardMenu.jsx', 'utf8'),
    readFile('src/App.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/api.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8')
]);

const functionSource = (name) => {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const next = migration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
    return migration.slice(start, next < 0 ? migration.length : next);
};

test('학생 홈은 기존 bootstrap 한 번에 접근 가능 여부·공간·새 글 수만 합친다', () => {
    assert.match(migration, /get_student_home_bootstrap_core_20261199/);
    assert.match(migration, /v_base := public\.get_student_home_bootstrap_core_20261199\(\)/);
    assert.match(migration, /'neighbor_agit_available'/);
    assert.match(migration, /'neighbor_agit_space_id'/);
    assert.match(migration, /'neighbor_agit_new_count'/);
    assert.match(migration, /LEAST\(count\(\*\)::INTEGER, 99\)/);
    assert.doesNotMatch(dashboard, /supabase\.(?:from|rpc)|fetch\(/);
    assert.match(dashboard, /module\.studentDashboard\.visibilityKey/);
    assert.match(dashboard, /module\.studentDashboard\.badgeCountKey/);
});

test('학생 카드는 명시적 모듈 ON과 서버 접근 가능 신호를 모두 만족해야 보인다', () => {
    assert.match(manifest, /audience: 'both'/);
    assert.match(manifest, /core: false/);
    assert.match(manifest, /defaultEnabled: false/);
    assert.match(manifest, /visibilityKey: 'neighbor_agit_available'/);
    assert.match(manifest, /studentRoute: 'neighbor_agit'/);
    assert.match(app, /neighborAgitAvailable = enabledStudentModules\.some/);
    assert.match(app, /studentHomeBootstrap\?\.home\?\.neighbor_agit_available === true/);
    assert.match(app, /studentPageName !== 'neighbor_agit'[\s\S]*replaceStudentRoute\(STUDENT_HOME_ROUTE\)/);
});

test('단일 피드는 20편 시작·50편 절대 상한과 공개시각+공유 ID 커서를 사용한다', () => {
    const feed = functionSource('get_neighbor_space_feed_v1');
    assert.equal(NEIGHBOR_AGIT_LIMITS.initialFeedRows, 20);
    assert.equal(NEIGHBOR_AGIT_LIMITS.maximumFeedRows, 50);
    assert.match(feed, /LEAST\(GREATEST\(COALESCE\(p_limit, 20\), 1\), 50\)/);
    assert.match(feed, /\(shared\.published_at, shared\.id\) < \(p_cursor_at, p_cursor_id\)/);
    assert.match(feed, /ORDER BY shared\.published_at DESC, shared\.id DESC/);
    assert.match(feed, /LIMIT v_limit \+ 1/);
    assert.match(feed, /membership\.status = 'active'/);
    assert.match(feed, /shared\.status = 'published'/);
    assert.match(entry, /limit: NEIGHBOR_AGIT_LIMITS\.initialFeedRows/);
});

test('피드는 요약만, 전문은 글을 누를 때 전용 RPC 한 번으로 지연 조회한다', () => {
    const feed = functionSource('get_neighbor_space_feed_v1');
    const detail = functionSource('get_neighbor_shared_post_v1');
    const serialized = feed.slice(feed.indexOf('jsonb_build_object('), feed.indexOf(') AS item'));
    const detailJson = detail.slice(detail.indexOf('jsonb_build_object('), detail.indexOf(') INTO v_result'));
    assert.match(serialized, /'excerpt'/);
    assert.doesNotMatch(serialized, /'content'|'student_id'|'class_id'|'post_id'/);
    assert.match(detailJson, /'content'/);
    assert.doesNotMatch(detailJson, /'student_id'|'class_id'|'post_id'/);
    assert.equal((api.match(/supabase\.rpc\(/g) || []).length, 8);
    assert.match(api, /get_neighbor_space_feed_v1/);
    assert.match(api, /get_neighbor_shared_post_v1/);
    assert.match(entry, /onClick=\{\(\) => openDetail\(item\.shared_post_id\)\}/);
});

test('공개 이름은 실제 학생 이름·내부 ID 대신 공간별 안전 필명과 공개용 학급명만 쓴다', () => {
    assert.match(migration, /'이웃 작가 ' \|\| substring/);
    assert.match(migration, /shared\.public_author_name/);
    assert.match(migration, /membership\.public_class_name/);
    assert.doesNotMatch(functionSource('get_neighbor_space_feed_v1'), /student\.name/);
    assert.doesNotMatch(functionSource('get_neighbor_shared_post_v1'), /student\.name/);
});

test('학생 화면은 열 때만 읽고 폴링·Realtime·직접 테이블 조회를 만들지 않는다', () => {
    assert.match(manifest, /home: 'summary'/);
    assert.match(manifest, /load: 'on-open'/);
    assert.match(manifest, /realtime: 'none'/);
    assert.match(manifest, /maxInitialRows: 20/);
    for (const source of [api, entry]) {
        assert.doesNotMatch(source, /setInterval\s*\(|\.channel\(|postgres_changes|supabase\.from\(/);
    }
});

test('다른 공간·OFF·퇴장·숨김·ID 추측 차단을 실제 역할 스모크가 확인한다', () => {
    assert.match(smoke, /neighbor feed accepted a different space id/);
    assert.match(smoke, /neighbor feed ignored the class module OFF state/);
    assert.match(smoke, /neighbor feed ignored the teacher access OFF state/);
    assert.match(smoke, /hidden neighbor post remained visible/);
    assert.match(smoke, /guessed hidden neighbor detail was readable/);
    assert.match(smoke, /left class retained neighbor feed access/);
});

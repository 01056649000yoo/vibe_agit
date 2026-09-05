import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, smoke, dashboard, panel, panelCss, adminApi, previews] = await Promise.all([
    readFile('supabase/migrations/20261199_neighbor_agit_data_foundation.sql', 'utf8'),
    readFile('tests/sql/20261199_neighbor_agit_data_foundation.smoke.sql', 'utf8'),
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('src/components/admin/AdminNeighborAgitPanel.jsx', 'utf8'),
    readFile('src/components/admin/AdminNeighborAgitPanel.css', 'utf8'),
    readFile('src/modules/community/neighbor-agit/adminApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/NeighborAgitPreviews.jsx', 'utf8')
]);

const functionSource = (name) => {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    const next = migration.indexOf('\nCREATE OR REPLACE FUNCTION public.', start + 1);
    return migration.slice(start, next < 0 ? migration.length : next);
};

test('관리자 운영 묶음에 이웃 아지트 전용 탭을 두고 선택할 때만 지연 로딩한다', () => {
    // 2026-09-06에 `기능 공개` 한 탭을 우리반 아지트·이웃 아지트 두 탭으로 갈랐다.
    assert.match(dashboard, /\{ id: 'neighbor-agit', label: '이웃 아지트' \}/);
    assert.match(dashboard, /const AdminNeighborAgitPanel = React\.lazy/);
    assert.match(dashboard, /active=\{currentTab === 'neighbor-agit'\}/);
    assert.match(dashboard, /visited=\{visitedTabs\.has\('neighbor-agit'\)\}/);
    assert.match(dashboard, /<AdminNeighborAgitPanel \/>/);
    assert.doesNotMatch(dashboard, /label: '기능 공개'/);
});

test('관리자 현황은 전용 RPC 한 번으로 공간·학급·상호작용과 안전한 미리보기를 읽는다', () => {
    const summary = functionSource('get_neighbor_admin_dashboard_v1');
    assert.match(adminApi, /get_neighbor_admin_dashboard_v1/);
    assert.equal((adminApi.match(/supabase\.rpc\(/g) || []).length, 5);
    assert.match(summary, /assert_neighbor_admin_v1\(\)/);
    assert.match(summary, /LIMIT 20/);
    assert.match(summary, /'eligible_classes'/);
    assert.match(summary, /'preview_feed'/);
    assert.match(summary, /neighbor_public_author_name_v1/);
    assert.doesNotMatch(summary, /student\.name|student_name/);
    assert.match(panel, /새로고침/);
    assert.match(panel, /NeighborAgitTeacherPreview/);
    assert.match(panel, /NeighborAgitStudentPreview/);
    assert.match(previews, /aria-label="교사 화면 미리보기"/);
    assert.match(previews, /aria-label="학생 피드 미리보기"/);
});

test('내부 시험 공간은 관리자만 2~4개 학급을 한 트랜잭션으로 연결한다', () => {
    const createTrial = functionSource('create_neighbor_internal_trial_v1');
    assert.match(createTrial, /assert_neighbor_admin_v1\(\)/);
    assert.match(createTrial, /v_mode <> 'internal'/);
    assert.match(createTrial, /v_class_count NOT BETWEEN 2 AND 4/);
    assert.match(createTrial, /count\(DISTINCT class_id\)/);
    assert.match(createTrial, /student_access_enabled/);
    assert.match(createTrial, /FALSE/);
    assert.match(panel, /선택한 학급으로 내부 시험 공간 만들기/);
    assert.match(panel, /selectedClassIds\.length < 2/);
    assert.match(smoke, /admin internal trial did not connect two classes safely/);
});

test('정상 공개 스위치는 여섯 점검과 서버 확인 토큰을 요구하고 변경 이력을 남긴다', () => {
    const saveCheck = functionSource('set_neighbor_acceptance_check_v1');
    const changeRollout = functionSource('change_neighbor_rollout_v1');
    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.neighbor_rollout_events/);
    assert.match(saveCheck, /p_check_key <> ALL\(ARRAY\[/);
    assert.match(changeRollout, /neighbor_acceptance_ready_v1/);
    assert.match(changeRollout, /p_confirmation <> '전체 교사 Beta 공개'/);
    assert.match(changeRollout, /INSERT INTO public\.neighbor_rollout_events/);
    assert.match(panel, /PUBLIC_ROLLOUT_CONFIRMATION = '전체 교사 Beta 공개'/);
    assert.match(panel, /role="switch"/);
    assert.match(panel, /event\.target\.checked \? 'public_beta' : 'limited_beta'/);
    assert.match(panel, /acceptanceReady/);
    assert.match(panel, /window\.confirm/);
    assert.doesNotMatch(panel, /window\.prompt/);
    assert.match(smoke, /rollout opened without all acceptance checks/);
    assert.match(smoke, /rollout opened without the explicit confirmation phrase/);
});

test('관리 화면은 좁은 화면에서 한 열로 줄고 공개 스위치·체크박스 접근성을 유지한다', () => {
    assert.match(panelCss, /@media \(max-width: 760px\)/);
    assert.match(panelCss, /grid-template-columns:\s*1fr/);
    assert.match(panel, /type="checkbox"/);
    assert.match(panel, /htmlFor=\{`neighbor-acceptance-/);
    assert.match(panel, /aria-label="이웃 아지트 정상 공개 전환"/);
    assert.match(panel, /disabled=\{rolloutSwitchDisabled\}/);
    assert.match(panel, /aria-live="polite"/);
});

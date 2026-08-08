/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('학생 홈은 공용 bootstrap 외 직접 DB 조회를 만들지 않는다', async () => {
    const dashboard = await read('src/components/student/StudentDashboard.jsx');
    assert.doesNotMatch(dashboard, /supabase\.(?:from|rpc)\(/);
    assert.match(await read('src/modules/home/studentHomeApi.js'), /get_student_home_bootstrap_v1/);
});

test('학생 과제 목록과 글쓰기 화면은 Realtime 연결을 열지 않는다', async () => {
    for (const file of [
        'src/components/student/MissionList.jsx',
        'src/hooks/useMissionSubmit.js',
        'src/components/student/StudentDashboard.jsx',
        'src/hooks/useStudentSyncNotifications.js'
    ]) {
        const source = await read(file);
        assert.doesNotMatch(source, /\.channel\(|postgres_changes/, `${file}에 학생별 Realtime이 다시 들어왔습니다.`);
    }
});

test('학생 상시 알림은 WebSocket 대신 분산된 공용 홈 동기화를 쓴다', async () => {
    const app = await read('src/App.jsx');
    const dashboard = await read('src/components/student/StudentDashboard.jsx');
    assert.doesNotMatch(app, /\.channel\(|postgres_changes/);
    assert.doesNotMatch(dashboard, /useRealtimeNotifications/);
    assert.match(app, /240000[\s\S]*120000/);
    assert.match(app, /refreshStudentHome\(\{ force: true \}\)/);
});

test('친구 글 상세 화면은 고정 DB 폴링을 사용하지 않는다', async () => {
    for (const file of [
        'src/hooks/usePostInteractions.js',
        'src/components/student/PostDetailModal.jsx'
    ]) {
        const source = await read(file);
        assert.doesNotMatch(source, /setInterval\s*\(/, `${file}에 상세 화면 고정 폴링이 남아 있습니다.`);
        assert.match(source, /visibilitychange/);
    }
});

test('학생 설정은 짧은 고정 폴링을 사용하지 않는다', async () => {
    for (const file of [
        'src/modules/useEnabledModules.js',
        'src/modules/writing/editor-settings/WritingEditorSettingsContext.jsx'
    ]) {
        const source = await read(file);
        assert.doesNotMatch(source, /setInterval\s*\(/, `${file}에 고정 폴링이 남아 있습니다.`);
    }
});

test('교사 보관함은 미션별 count N+1을 사용하지 않는다', async () => {
    const source = await read('src/components/teacher/ArchiveManager.jsx');
    assert.doesNotMatch(source, /Promise\.all\s*\(\s*missions\.map/);
    assert.match(source, /get_teacher_archived_missions_page/);
});

test('성능 마이그레이션은 bootstrap·제출·권한 계약을 가진다', async () => {
    const migration = await read('supabase/migrations/20261006_student_scaling_harness.sql');
    assert.match(migration, /get_student_home_bootstrap_v1/);
    assert.match(migration, /submit_assignment_post_v1/);
    assert.match(migration, /get_teacher_archived_missions_page/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.writing_engine_submit_assignment/);
});

test('교사 첫 화면은 bootstrap 한 번으로 공통 데이터를 받는다', async () => {
    const authStore = await read('src/store/useAuthStore.js');
    const dashboardHook = await read('src/hooks/useTeacherDashboard.js');
    const missionHook = await read('src/hooks/useMissionManager.js');
    const migration = await read('supabase/migrations/20261007_teacher_app_bootstrap.sql');

    assert.match(authStore, /get_teacher_app_bootstrap_v1/);
    assert.match(dashboardHook, /if \(teacherBootstrap\) return;/);
    assert.match(missionHook, /if \(bootstrapProfile\) return;/);
    assert.match(migration, /LIMIT 100/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_teacher_app_bootstrap_v1/);
});

test('교사 과제 목록과 제출글에는 100개 상한이 있다', async () => {
    const source = await read('src/hooks/useMissionManager.js');
    const limits = source.match(/\.limit\(100\)/g) || [];
    assert.ok(limits.length >= 2, '과제 목록과 과제별 제출글에 각각 limit(100)이 필요합니다.');
});

test('학생·교사 과제 목록은 각각 전용 RPC 한 번을 우선 사용한다', async () => {
    assert.match(await read('src/components/student/MissionList.jsx'), /get_student_mission_list_v1/);
    assert.match(await read('src/hooks/useMissionManager.js'), /get_teacher_mission_overview_v1/);

    const migration = await read('supabase/migrations/20261008_mission_overview_scaling.sql');
    assert.match(migration, /idx_writing_missions_class_active_created/);
    assert.match(migration, /LEAST\(GREATEST\(COALESCE\(p_limit, 100\), 1\), 100\)/g);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_student_mission_list_v1/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_teacher_mission_overview_v1/);
});

test('학생 글쓰기 화면은 과제와 기존 글을 작업공간 RPC 한 번으로 우선 읽는다', async () => {
    const source = await read('src/hooks/useMissionSubmit.js');
    const migration = await read('supabase/migrations/20261008_mission_overview_scaling.sql');
    assert.match(source, /get_student_assignment_workspace_v1/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_student_assignment_workspace_v1/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_student_assignment_workspace_v1/);
});

test('승인·회수 성공 뒤 전체 목록을 다시 조회하지 않는다', async () => {
    const source = await read('src/hooks/useMissionManager.js');
    const section = source.slice(
        source.indexOf('const handleApprovePost'),
        source.indexOf('const handleBulkRequestRewrite')
    );
    assert.doesNotMatch(section, /fetchPostsForMission\(|fetchMissions\(/);
    assert.match(section, /setSubmissionCounts/);
});

test('등록된 콘텐츠는 성능 계약을 빠짐없이 선언한다', async () => {
    const registry = await read('src/modules/registry.js');
    const manifestImports = [...registry.matchAll(/from ['"](\.\/[^'"]+\/manifest)['"]/g)]
        .map((match) => `src/modules/${match[1].replace(/^\.\//, '')}.js`);
    assert.ok(manifestImports.length > 0);

    for (const manifestPath of manifestImports) {
        const source = await read(manifestPath);
        assert.match(source, /performance:\s*\{[^}]*home:[^}]*load:[^}]*writes:[^}]*realtime:[^}]*maxInitialRows:/s,
            `${manifestPath}에 신규 콘텐츠 성능 계약이 없습니다.`);
    }
});

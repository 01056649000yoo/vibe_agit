import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [
    supabaseClient,
    authStore,
    app,
    teacherNav,
    teacherDashboard,
    migration,
    shortLinksMigration,
    portableResultsMigration,
    myResultsMigration,
    myActivitiesMigration,
    labResultsApi,
    labResultsManifest,
    labResultsTool,
    writingToolRegistry,
    writingToolHost,
    labActivitiesApi,
    labActivitiesManifest,
    labActivitiesPage,
    moduleRegistry,
    dashboardMenu,
    packageJson
] = await Promise.all([
    readFile('src/lib/supabaseClient.js', 'utf8'),
    readFile('src/store/useAuthStore.js', 'utf8'),
    readFile('src/App.jsx', 'utf8'),
    readFile('src/constants/teacherNav.js', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('supabase/migrations/20261029_lab_teacher_sso.sql', 'utf8'),
    readFile('supabase/migrations/20261031_lab_short_links_permissions.sql', 'utf8'),
    readFile('supabase/migrations/20261101_lab_portable_results.sql', 'utf8'),
    readFile('supabase/migrations/20261102_my_lab_results.sql', 'utf8'),
    readFile('supabase/migrations/20261103_my_lab_activities.sql', 'utf8'),
    readFile('src/modules/writing/tools/lab-results/api.js', 'utf8'),
    readFile('src/modules/writing/tools/lab-results/manifest.js', 'utf8'),
    readFile('src/modules/writing/tools/lab-results/LabResultsTool.jsx', 'utf8'),
    readFile('src/modules/writing/tools/registry.js', 'utf8'),
    readFile('src/modules/writing/tools/WritingToolHost.jsx', 'utf8'),
    readFile('src/modules/writing/lab-activities/api.js', 'utf8'),
    readFile('src/modules/writing/lab-activities/manifest.js', 'utf8'),
    readFile('src/modules/writing/lab-activities/LabActivitiesPage.jsx', 'utf8'),
    readFile('src/modules/registry.js', 'utf8'),
    readFile('src/components/student/DashboardMenu.jsx', 'utf8'),
    readFile('package.json', 'utf8')
]);

test('아지트 인증은 연구소와 공유하는 루트 쿠키를 사용한다', () => {
    assert.match(packageJson, /"@supabase\/ssr"/);
    assert.match(supabaseClient, /createBrowserClient/);
    assert.match(supabaseClient, /SHARED_AUTH_COOKIE_NAME = 'sb-agit-auth-token'/);
    assert.match(supabaseClient, /path: '\/'/);
    assert.match(supabaseClient, /sameSite: 'lax'/);
    assert.doesNotMatch(supabaseClient, /domain:/i);
});

test('기존 로컬 세션은 새 쿠키 저장 성공 뒤에만 지운다', () => {
    const setSessionIndex = supabaseClient.indexOf('supabase.auth.setSession');
    const successIndex = supabaseClient.indexOf('if (!error && data.session)');
    const removeIndex = supabaseClient.indexOf('window.localStorage.removeItem(legacyStorageKey)');
    assert.ok(setSessionIndex > -1 && setSessionIndex < successIndex && successIndex < removeIndex);
    assert.match(authStore, /await migrateLegacyAuthSession\(\)/);
    assert.match(app, /await checkSessions\(\)/);
    assert.ok(app.indexOf('await checkSessions()') < app.indexOf('onAuthStateChange'));
    assert.doesNotMatch(supabaseClient, /console\.(?:log|warn|error)\([^\n]*(?:access_token|refresh_token)/);
});

test('교사 상단 메뉴는 글쓰기 바로 뒤에서 같은 탭의 /lab으로 이동한다', () => {
    const writingIndex = teacherNav.indexOf("id: 'writing'");
    const labIndex = teacherNav.indexOf("id: 'writing-lab'");
    const operationsIndex = teacherNav.indexOf("id: 'operations'");
    assert.ok(writingIndex > -1 && writingIndex < labIndex && labIndex < operationsIndex);
    assert.match(teacherNav, /label: '글쓰기 연구소'[\s\S]*launchHref: '\/lab\/dashboard'/);
    assert.match(teacherDashboard, /href=\{group\.launchHref\}/);
    assert.doesNotMatch(teacherDashboard, /target="_blank"/);
});

test('연구소 교사 준비 RPC는 실제 승인 상태를 확인하고 기존 자료를 덮어쓰지 않는다', () => {
    assert.match(migration, /v_role := public\.auth_user_role\(\)/);
    assert.match(migration, /v_role NOT IN \('TEACHER', 'ADMIN'\)/);
    assert.match(migration, /INSERT INTO writing_helper\.teacher_profiles/);
    assert.match(migration, /ON CONFLICT \(user_id\) DO NOTHING/);
    assert.match(migration, /lab_user_id = p_lab_user_id OR agit_user_id = p_lab_user_id/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.ensure_lab_teacher_profile_v1\(\)[\s\S]*FROM PUBLIC, anon/);
    assert.doesNotMatch(migration, /auth\.jwt|app_metadata/);
});

test('연구소 단축주소는 서버만 조회·생성하고 브라우저 직접 접근을 막는다', () => {
    assert.match(shortLinksMigration, /REVOKE ALL ON TABLE writing_helper\.short_links FROM PUBLIC, anon, authenticated/);
    assert.match(shortLinksMigration, /GRANT SELECT, INSERT ON TABLE writing_helper\.short_links TO service_role/);
    assert.doesNotMatch(shortLinksMigration, /GRANT[^;]*TO (?:anon|authenticated)/);
});

test('연구소 표준 결과 원장은 서버만 쓰고 학생은 본인 RPC로만 읽는다', () => {
    assert.match(portableResultsMigration, /CREATE TABLE IF NOT EXISTS writing_helper\.portable_results/);
    assert.match(portableResultsMigration, /REVOKE ALL ON TABLE writing_helper\.portable_results FROM PUBLIC, anon, authenticated/);
    assert.match(portableResultsMigration, /GRANT EXECUTE ON FUNCTION writing_helper\.upsert_portable_result_v1[\s\S]*TO service_role/);
    assert.match(myResultsMigration, /v_student_id UUID := public\.auth_student_id\(\)/);
    assert.match(myResultsMigration, /portable\.agit_student_id = v_student_id/);
    assert.match(myResultsMigration, /LIMIT v_limit \+ 1/);
    assert.match(myResultsMigration, /LEAST\(GREATEST\(coalesce\(p_limit, 20\), 1\), 50\)/);
    assert.match(myResultsMigration, /REVOKE ALL ON FUNCTION public\.get_my_lab_results_v1[\s\S]*FROM PUBLIC, anon/);
    assert.doesNotMatch(myResultsMigration, /auth\.jwt|app_metadata/);
});

test('글쓰기 연구소 결과 도구는 열 때만 본인 RPC를 호출하고 직접 선택한 내용만 넣는다', () => {
    assert.match(writingToolRegistry, /labResultsToolManifest/);
    assert.match(labResultsManifest, /performance: \{ home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 20 \}/);
    assert.match(labResultsApi, /supabase\.rpc\('get_my_lab_results_v1'/);
    assert.match(labResultsApi, /Math\.min\(Math\.max\(Number\(limit\) \|\| 20, 1\), 50\)/);
    assert.doesNotMatch(labResultsApi, /\.from\(|setInterval|\.channel\(/);
    assert.match(labResultsTool, /onClick=\{\(\) => void handleUseText/);
    assert.match(writingToolHost, /lazy\(manifest\.studentEntry\)/);
    assert.match(writingToolHost, /onInsertText=\{onInsertText\}/);
});

test('학생 연구소 메뉴는 홈 추가 조회 없이 열 때만 우리 반 활성 활동을 읽는다', () => {
    assert.match(myActivitiesMigration, /v_student_id UUID := public\.auth_student_id\(\)/);
    assert.match(myActivitiesMigration, /room\.agit_class_id = v_class_id/);
    assert.match(myActivitiesMigration, /room\.is_active IS TRUE/);
    assert.match(myActivitiesMigration, /room\.expires_at IS NULL OR room\.expires_at > NOW\(\)/);
    assert.match(myActivitiesMigration, /LIMIT v_limit \+ 1/);
    assert.match(myActivitiesMigration, /REVOKE ALL ON FUNCTION public\.get_my_lab_activities_v1[\s\S]*FROM PUBLIC, anon/);
    assert.doesNotMatch(myActivitiesMigration, /auth\.jwt|app_metadata/);

    assert.match(moduleRegistry, /labActivitiesManifest/);
    assert.match(labActivitiesManifest, /core: true/);
    assert.match(labActivitiesManifest, /studentRoute: 'lab_activities'/);
    assert.match(labActivitiesManifest, /performance: \{ home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 20 \}/);
    assert.match(dashboardMenu, /module\.studentDashboard[\s\S]*onNavigate\(module\.studentRoute\)/);
    assert.match(app, /lazy\(getModule\('lab-activities'\)\.studentEntry\)/);
    assert.match(app, /studentPageName === 'lab_activities'/);

    assert.match(labActivitiesApi, /supabase\.rpc\('get_my_lab_activities_v1'/);
    assert.doesNotMatch(labActivitiesApi, /\.from\(|setInterval|\.channel\(/);
    assert.match(labActivitiesPage, /limit: 20/);
    assert.match(labActivitiesPage, /window\.location\.assign\(`\/lab\/room\/\$\{/);
    assert.doesNotMatch(labActivitiesPage, /setInterval|\.channel\(|postgres_changes/);
});

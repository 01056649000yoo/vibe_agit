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
    packageJson
] = await Promise.all([
    readFile('src/lib/supabaseClient.js', 'utf8'),
    readFile('src/store/useAuthStore.js', 'utf8'),
    readFile('src/App.jsx', 'utf8'),
    readFile('src/constants/teacherNav.js', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('supabase/migrations/20261029_lab_teacher_sso.sql', 'utf8'),
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

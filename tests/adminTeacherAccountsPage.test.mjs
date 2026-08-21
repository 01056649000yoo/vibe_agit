import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, hook, dashboard] = await Promise.all([
    readFile('supabase/migrations/20261151_admin_teacher_accounts_page.sql', 'utf8'),
    readFile('src/hooks/useAdminTeacherAccountsPage.js', 'utf8'),
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8')
]);

test('관리자 교사 목록 RPC는 실제 관리자만 호출하고 검색·상태·페이지 상한을 서버가 적용한다', () => {
    assert.match(migration, /public\.auth_user_role\(\) <> 'ADMIN'/);
    assert.match(migration, /v_status NOT IN \('APPROVED', 'PENDING_NEW', 'PENDING_REVOKED'\)/);
    assert.match(migration, /LEFT\(BTRIM\(COALESCE\(p_search, ''\)\), 80\)/);
    assert.match(migration, /LEAST\(GREATEST\(COALESCE\(p_limit, 10\), 1\), 50\)/);
    assert.match(migration, /LIMIT v_limit OFFSET v_offset/);
    assert.match(migration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon/);
});

test('브라우저는 현재 페이지 RPC만 호출하고 profiles 전체 목록을 직접 읽지 않는다', () => {
    assert.match(hook, /rpc\('admin_get_teacher_accounts_page_v1'/);
    assert.match(hook, /p_limit: pageSize/);
    assert.match(hook, /p_offset: \(page - 1\) \* pageSize/);
    assert.match(hook, /SEARCH_DEBOUNCE_MS = 300/);
    assert.doesNotMatch(dashboard, /\.from\('profiles'\)/);
});

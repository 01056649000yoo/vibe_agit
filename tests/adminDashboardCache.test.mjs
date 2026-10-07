import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, usageHook, accountsHook, dashboard, usagePanel] = await Promise.all([
    readFile('supabase/migrations/20261373_admin_dashboard_cache_and_teacher_sort.sql', 'utf8'),
    readFile('src/hooks/useAdminUsage.js', 'utf8'),
    readFile('src/hooks/useAdminTeacherAccountsPage.js', 'utf8'),
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('src/components/admin/AdminUsagePanel.jsx', 'utf8')
]);

test('관리자 이용 현황은 2시간마다 미리 계산한 값을 읽고, 새로 계산할 때만 집계를 다시 돈다', () => {
    assert.match(migration, /cron\.schedule\('admin-dashboard-cache', '5 \*\/2 \* \* \*'/);
    // 미리 계산하는 기간은 화면 선택지와 같아야 한다(다르면 그 기간만 매번 느리다)
    const options = usageHook.match(/ACTIVITY_DAY_OPTIONS = \[([^\]]+)\]/)[1].replace(/\s/g, '');
    assert.match(migration.replace(/ARRAY\[([^\]]+)\]/g, (m, v) => `ARRAY[${v.replace(/\s/g, '')}]`), new RegExp(`FOREACH v_days IN ARRAY ARRAY\\[${options}\\]`));
    const dormant = usageHook.match(/DORMANT_DAYS = (\d+);/)[1];
    assert.match(migration, new RegExp(`admin_compute_dashboard_cache_v1\\(${dormant}, v_days\\)`));
    assert.match(usageHook, /rpc\('admin_get_dashboard_cache_v1'/);
    assert.doesNotMatch(usageHook, /rpc\('admin_get_(teacher_usage|usage_overview)'/);
    assert.match(usageHook, /p_refresh: recompute/);
    assert.match(usagePanel, /recompute: true/);
    assert.match(dashboard, /usageComputedLabel/);
});

test('가입 교사 목록은 서버가 정렬하고(가입 최신·오래된순) 옛 판 v1 은 지운다', () => {
    assert.match(migration, /DROP FUNCTION IF EXISTS public\.admin_get_teacher_accounts_page_v1/);
    assert.match(migration, /v_sort NOT IN \('login', 'joined_desc', 'joined_asc'\)/);
    for (const id of ['login', 'joined_desc', 'joined_asc']) assert.match(accountsHook, new RegExp(`id: '${id}'`));
    assert.match(accountsHook, /p_sort: sort/);
    assert.match(dashboard, /TEACHER_ACCOUNT_SORTS\.map/);
    assert.match(migration, /REVOKE ALL ON public\.admin_dashboard_cache FROM PUBLIC, anon, authenticated/);
});

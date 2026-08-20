import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [migration, panel, dashboard, recorder] = await Promise.all([
    readFile('supabase/migrations/20261147_admin_backup_status.sql', 'utf8'),
    readFile('src/components/admin/AdminBackupPanel.jsx', 'utf8'),
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('scripts/record-backup-status.sh', 'utf8')
]);

test('백업 원장은 브라우저에 직접 공개하지 않고 관리자 RPC로만 읽는다', () => {
    assert.match(migration, /ALTER TABLE public\.system_backup_runs ENABLE ROW LEVEL SECURITY/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.system_backup_runs FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /auth\.uid\(\) IS NULL OR public\.auth_user_role\(\) <> 'ADMIN'/);
    assert.match(migration, /LEAST\(GREATEST\(COALESCE\(p_limit, 20\), 1\), 50\)/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_get_backup_runs_v1\(INTEGER\)[\s\S]*TO authenticated, service_role/);
    assert.doesNotMatch(migration, /auth\.jwt|app_metadata/);
    assert.doesNotMatch(migration, /sync\.log|rehearsal\.log|\/Users\//);
});

test('호스트 기록기는 제한된 상태와 숫자만 SQL 변수로 전달한다', () => {
    assert.match(recorder, /case "\$JOB_TYPE" in daily\|restore/);
    assert.match(recorder, /case "\$STATUS" in RUNNING\|PASS\|FAIL/);
    assert.match(recorder, /case "\$DETAIL_CODE" in \*\[!a-z0-9_,:-\]\*/);
    assert.match(recorder, /-v run_key="\$RUN_KEY"/);
    assert.match(recorder, /ON CONFLICT \(run_key\) DO UPDATE SET/);
    assert.doesNotMatch(recorder, /service_role|SUPABASE.*KEY|password/i);
});

test('관리자 백업 화면은 탭을 열 때 한 번 읽고 지연 상태를 경고한다', () => {
    assert.match(dashboard, /id: 'backup', label: '💾 백업 상태'/);
    assert.match(dashboard, /currentTab === 'backup'/);
    assert.match(panel, /admin_get_backup_runs_v1/);
    assert.match(panel, /daily_stale_after_hours \|\| 26/);
    assert.match(panel, /restore_stale_after_days \|\| 40/);
    assert.match(panel, /15, 'minutes'/);
    assert.match(panel, /내장/);
    assert.match(panel, /Drive/);
    assert.match(panel, /외장 SSD/);
    assert.doesNotMatch(panel, /setInterval|postgres_changes|\.channel\(/);
});

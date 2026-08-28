import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [baseMigration, appMigration, panel, dashboard, healthHook, healthScript, recorder, appRecorder, appRegistry] = await Promise.all([
    readFile('supabase/migrations/20261147_admin_backup_status.sql', 'utf8'),
    readFile('supabase/migrations/20261196_backup_app_results.sql', 'utf8'),
    readFile('src/components/admin/AdminBackupPanel.jsx', 'utf8'),
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('src/components/admin/useAdminHealthSummary.js', 'utf8'),
    readFile('scripts/check-service-health.sh', 'utf8'),
    readFile('scripts/record-backup-status.sh', 'utf8'),
    readFile('scripts/record-backup-app-status.sh', 'utf8'),
    readFile('src/components/admin/backupApps.js', 'utf8')
]);

test('백업 원장과 앱별 결과는 브라우저에 직접 공개하지 않고 관리자 RPC로만 읽는다', () => {
    assert.match(baseMigration, /ALTER TABLE public\.system_backup_runs ENABLE ROW LEVEL SECURITY/);
    assert.match(baseMigration, /REVOKE ALL ON TABLE public\.system_backup_runs FROM PUBLIC, anon, authenticated/);
    assert.match(appMigration, /ALTER TABLE public\.system_backup_app_results ENABLE ROW LEVEL SECURITY/);
    assert.match(appMigration, /REVOKE ALL ON TABLE public\.system_backup_app_results FROM PUBLIC, anon, authenticated/);
    assert.match(appMigration, /auth\.uid\(\) IS NULL OR public\.auth_user_role\(\) <> 'ADMIN'/);
    assert.match(appMigration, /LEAST\(GREATEST\(COALESCE\(p_limit, 20\), 1\), 50\)/);
    assert.match(appMigration, /GRANT EXECUTE ON FUNCTION public\.admin_get_backup_runs_v1\(INTEGER\)[\s\S]*TO authenticated, service_role/);
    assert.doesNotMatch(appMigration, /auth\.jwt|app_metadata/);
    assert.doesNotMatch(appMigration, /sync\.log|rehearsal\.log|\/Users\//);
});

test('호스트 기록기는 제한된 상태·숫자·앱 키만 SQL 변수로 전달한다', () => {
    assert.match(recorder, /case "\$JOB_TYPE" in daily\|restore/);
    assert.match(recorder, /case "\$STATUS" in RUNNING\|PASS\|FAIL/);
    assert.match(recorder, /case "\$DETAIL_CODE" in \*\[!a-z0-9_,:-\]\*/);
    assert.match(recorder, /-v run_key="\$RUN_KEY"/);
    assert.match(recorder, /ON CONFLICT \(run_key\) DO UPDATE SET/);

    assert.match(appRecorder, /case "\$APP_KEY" in agit\|samlink\|jarvis/);
    assert.match(appRecorder, /case "\$STATUS" in PASS\|FAIL/);
    assert.match(appRecorder, /ON CONFLICT \(run_key, app_key\) DO UPDATE SET/);
    assert.doesNotMatch(recorder + appRecorder, /service_role|SUPABASE.*KEY|password/i);
});

test('앱 키 원본·DB 제약·호스트 기록기 세 곳을 한 번에 대조한다', () => {
    const registryKeys = [...appRegistry.matchAll(/key: '([^']+)'/g)].map((match) => match[1]);
    const migrationKeys = appMigration.match(/app_key IN \(([^)]+)\)/)?.[1]
        .match(/'([^']+)'/g)?.map((value) => value.slice(1, -1)) || [];
    const recorderKeys = appRecorder.match(/case "\$APP_KEY" in ([^)]+)/)?.[1].split('|') || [];

    assert.deepEqual(registryKeys, ['agit', 'samlink', 'jarvis']);
    assert.deepEqual(migrationKeys, registryKeys);
    assert.deepEqual(recorderKeys, registryKeys);
});

test('관리자 백업 화면은 3개 앱·공용 사본·복구를 한 화면에서 보여 준다', () => {
    assert.match(dashboard, /id: 'backup', label: '백업 상태'/);
    assert.match(dashboard, /currentTab === 'backup'/);
    assert.match(panel, /admin_get_backup_runs_v1/);
    assert.match(panel, /BACKUP_APPS\.map/);
    assert.match(panel, /3개 앱 통합 백업·복구 상태/);
    assert.match(panel, /앱별 기록 전/);
    assert.match(panel, /공용 사본/);
    assert.match(panel, /최근 실제 복구 검사/);
    assert.match(panel, /daily_stale_after_hours \|\| 26/);
    assert.match(panel, /restore_stale_after_days \|\| 40/);
    assert.match(panel, /15, 'minutes'/);
    for (const label of ['내장', 'Drive', '외장 SSD']) {
        assert.ok(panel.includes(label), `공용 사본 '${label}'이 없다`);
    }
    assert.doesNotMatch(panel, /setInterval|postgres_changes|\.channel\(/);
});

test('관리자 첫 화면과 5분 건강검진도 같은 앱별 판정을 재사용한다', () => {
    assert.match(healthHook, /admin_get_service_overview_v1/);
    assert.match(healthHook, /backupAppRecorded: backup\?\.daily_app_recorded/);
    assert.match(healthHook, /backupAttentionCount: backup\?\.attention_count/);
    assert.match(dashboard, /label: '앱 백업'/);
    assert.match(dashboard, /onOpen: \(\) => setCurrentTab\('backup'\)/);
    assert.match(dashboard, /backup: health\.summary\?\.backupAttentionCount \|\| 0/);
    assert.match(appMigration, /'backup', v_backup/);
    assert.match(healthScript, /system_backup_app_results/);
    assert.match(healthScript, /apps\.recorded <> 3 OR apps\.passed <> 3/);
});

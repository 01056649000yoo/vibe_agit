/* eslint-disable security/detect-non-literal-fs-filename -- fixed repository fixture paths */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(file, 'utf8');
const [migration, dashboard, panel, hook, scanner, plist, catalog] = await Promise.all([
    read('supabase/migrations/20261198_service_management_dashboard.sql'),
    read('src/components/admin/AdminDashboard.jsx'),
    read('src/components/admin/AdminServiceManagementPanel.jsx'),
    read('src/components/admin/useAdminServiceManagement.js'),
    read('scripts/scan-service-images.mjs'),
    read('ops/launchd/com.agit.service-vulnerability-scan.plist'),
    read('ops/service-management/services.json')
]);

test('서비스 관리 원장은 직접 공개하지 않고 관리자·호스트 RPC 경계를 나눈다', () => {
    for (const table of [
        'system_service_review_catalog', 'system_service_reviews', 'system_service_review_items',
        'system_service_scan_runs', 'system_service_scan_images'
    ]) {
        assert.ok(migration.includes(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`));
        assert.ok(migration.includes(`REVOKE ALL ON TABLE public.${table} FROM PUBLIC, anon, authenticated, service_role`));
    }
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.admin_get_service_management_v1\(INTEGER\) TO authenticated/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.record_service_scan_v1\(JSONB\) FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.record_service_scan_v1\(JSONB\) TO service_role/);
    assert.match(migration, /auth_user_role\(\) <> 'ADMIN'/);
    assert.doesNotMatch(migration, /raw_report_(path|json)|package_path|secret_(value|key)/i);
});

test('첫 완료 시각을 기준으로 3개월 뒤 점검일을 만들고 미확인 항목은 완료하지 못한다', () => {
    assert.match(migration, /next_due_at = v_completed \+ INTERVAL '3 months'/);
    assert.match(migration, /IF v_pending > 0 THEN[\s\S]*Every checklist item must be reviewed/);
    assert.match(migration, /CREATE UNIQUE INDEX IF NOT EXISTS idx_system_service_reviews_one_active/);
    assert.match(panel, /완료한 시각을 기준으로 다음 점검일이 3개월 뒤/);
    assert.match(panel, /아직 기준 점검이 없습니다/);
    assert.match(panel, /p_status: status/);
    assert.match(panel, /p_note: note\.trim\(\)/);
});

test('관리자 운영 메뉴에서 분기 체크리스트와 이미지별 CVE 추이를 함께 본다', () => {
    assert.match(dashboard, /id: 'maintenance', label: '서비스 관리'/);
    assert.match(dashboard, /<AdminServiceManagementPanel serviceManagement=\{serviceManagement\} \/>/);
    assert.match(dashboard, /visited=\{visitedTabs\.has\('maintenance'\)\}/);
    assert.match(dashboard, /label: '서비스 점검'/);
    assert.match(dashboard, /maintenance: serviceManagement\.data\?\.summary\?\.attention_count \|\| 0/);
    assert.match(hook, /admin_get_service_management_v1/);
    for (const label of ['분기 정기점검', 'Docker 이미지 CVE', 'CRITICAL / HIGH', '지금 확인할 항목']) {
        assert.ok(panel.includes(label), `${label} 요약이 없다`);
    }
    for (const text of ['공개 요청 경로', '수정 가능', '긴급', '월간 검사 추이']) {
        assert.ok(panel.includes(text), `${text} 표시가 없다`);
    }
});

test('호스트 검사는 Docker 소켓 없이 tar 입력을 쓰고 첫 강제 검사 전에는 기준을 만들지 않는다', () => {
    assert.match(scanner, /docker', 'save'|DOCKER, \['save'/);
    assert.match(scanner, /'image', '--input', `\/scan\/\$\{archiveName\}`/);
    assert.match(scanner, /TRIVY_IMAGE = 'aquasec\/trivy@sha256:[a-f0-9]{64}'/);
    assert.doesNotMatch(scanner, /docker\.sock|\/var\/run\/docker/);
    assert.match(scanner, /if \(!force && !latestSuccessful\)/);
    assert.match(scanner, /--force로 첫 검사를 실행/);
    assert.match(scanner, /gzipSync\(rawDocument/);
    assert.match(scanner, /record_service_scan_v1/);
    assert.doesNotMatch(scanner, /service_role|SUPABASE.*KEY|password/i);
});

test('월간 LaunchAgent는 매일 짧게 확인하되 DB의 30일 기준 전에는 실제 검사를 건너뛴다', () => {
    assert.match(plist, /<key>Hour<\/key>\s*<integer>2<\/integer>/);
    assert.match(plist, /<key>Minute<\/key>\s*<integer>10<\/integer>/);
    assert.match(plist, /scan-service-images\.mjs/);
    assert.doesNotMatch(plist, /RunAtLoad/);
    assert.match(scanner, /elapsedDays < config\.scanIntervalDays/);
    const parsed = JSON.parse(catalog);
    assert.equal(parsed.scanIntervalDays, 30);
    for (const service of ['agit-app', 'agit-db', 'writing-helper-lab-app', 'samlink-app', 'jarvis-frontend', 'classroom-tools']) {
        assert.ok(Object.hasOwn(parsed.services, service), `${service} 분류가 없다`);
    }
});

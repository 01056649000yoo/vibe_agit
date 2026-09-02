/* eslint-disable security/detect-non-literal-fs-filename -- fixed repository fixture paths */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (file) => readFile(file, 'utf8');
const [migration, ignoreMigration, dashboard, panel, hook, scanner, plist, catalog] = await Promise.all([
    read('supabase/migrations/20261198_service_management_dashboard.sql'),
    read('supabase/migrations/20261228_service_scan_ignored_packages.sql'),
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

test('이미지를 고쳐 막을 수 없는 취약점은 세지 않되, 몇 건인지는 남긴다', () => {
    const config = JSON.parse(catalog);

    // 목록에 넣으려면 이유를 함께 적어야 한다 — 조용히 늘어나면 안 되는 목록이다.
    assert.ok(Array.isArray(config.ignoredPackages) && config.ignoredPackages.length > 0);
    for (const entry of config.ignoredPackages) {
        assert.equal(typeof entry.package, 'string');
        assert.ok(entry.package.trim().length > 0);
        assert.ok(String(entry.reason || '').trim().length >= 10, `${entry.package}: 왜 세지 않는지 적어야 합니다.`);
    }
    // 커널 헤더는 컨테이너에서 실행되지 않는다(이번에 12건이 여기서 나왔다).
    assert.ok(config.ignoredPackages.some((entry) => entry.package === 'linux-libc-dev'));

    // 검사기는 이유 없는 항목을 거부하고, 뺀 건수를 따로 세어 기록한다
    assert.match(scanner, /entry\.reason.*trim\(\)\.length < 10|reason.*10자 이상/);
    assert.match(scanner, /const isIgnoredFinding =/);
    assert.match(scanner, /ignored_count: ignored/);
    assert.match(scanner, /ignored_count: totals\.ignored/);

    // 원장도 화면도 숨긴 건수를 함께 들고 다닌다 — 조용히 사라지지 않는다
    assert.match(ignoreMigration, /ADD COLUMN IF NOT EXISTS ignored_count INTEGER NOT NULL DEFAULT 0/);
    assert.match(ignoreMigration, /'scan_ignored_count', COALESCE\(\(v_latest_scan->>'ignored_count'\)::INTEGER, 0\)/);
    assert.match(panel, /이유를 적어 뺀 항목/);
    assert.match(panel, /image\.ignored_count/);

    // 커널 헤더를 빼는 이유가 마이그레이션에도 남아 있어야 다음 사람이 다시 캐지 않는다
    assert.match(ignoreMigration, /호스트 커널/);
});

test('검사기 이미지가 지워져 있어도 월간 검사가 멈추지 않는다', () => {
    // 2026-09-02: 배포의 도커 캐시 정리가 고정된 Trivy 이미지를 지워 검사가 `No such image` 로 죽었다.
    // 다이제스트 고정은 유지한 채, 쓰기 전에 먼저 내려받는다.
    assert.match(scanner, /run\(DOCKER, \['pull', '--quiet', TRIVY_IMAGE\]/);
    assert.match(scanner, /고정한 검사기 이미지를 준비하지 못했습니다/);
    assert.match(scanner, /const TRIVY_IMAGE = 'aquasec\/trivy@sha256:[a-f0-9]{64}'/);
});

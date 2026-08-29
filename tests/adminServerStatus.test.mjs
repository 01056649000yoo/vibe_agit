import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [resourceStatus, servicePanel, dashboard, healthScript, migration, accuracyMigration, currentMigration] = await Promise.all([
    readFile('src/components/admin/AdminResourceStatus.jsx', 'utf8'),
    readFile('src/components/admin/AdminServicePanel.jsx', 'utf8'),
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('scripts/check-service-health.sh', 'utf8'),
    readFile('supabase/migrations/20261158_system_memory_and_gateway_peaks.sql', 'utf8'),
    readFile('supabase/migrations/20261163_dashboard_metrics_accuracy.sql', 'utf8'),
    readFile('supabase/migrations/20261173_current_resource_and_traffic_windows.sql', 'utf8'),
]);

test('서버 운영 정보는 운영 탭의 `서버 상태` 한 곳에 모인다', () => {
    // 예전에는 `현황 > 서비스 현황` 과 `운영 > 백업 상태` 로 흩어져 있었다.
    assert.match(dashboard, /\{ id: 'service', label: '서버 상태' \},\s*\n\s*\{ id: 'maintenance', label: '서비스 관리' \},\s*\n\s*\{ id: 'backup', label: '백업 상태' \}/);
    assert.ok(!/\{ id: 'service', label: '서비스 현황' \}/.test(dashboard), '옛 이름이 남아 있다');
    // 링크가 깨지지 않도록 id 는 그대로 둔다.
    assert.match(dashboard, /active=\{currentTab === 'service'\}/);
});

test('자원 카드는 값과 함께 판단 기준을 보여 준다', () => {
    // 숫자만 있으면 "그래서 괜찮은가"를 운영자가 매번 스스로 판단해야 한다.
    for (const 문구 of [
        '실제 메모리 압박 신호가 감지됐습니다',
        '잔여 스왑만으로는 이상이 아닙니다',
        'kong 워커를 2에서 늘리세요',
        '도커 캐시부터 정리하세요',
    ]) {
        assert.ok(resourceStatus.includes(문구), `판단 문구가 없다: ${문구}`);
    }
    // 기준값이 흐려지지 않게 못 박는다.
    assert.match(resourceStatus, /dockerMemoryAlertOpen \|\| memPercent < 15 \? 'bad'/);
    assert.match(resourceStatus, /const swapTone = [\s\S]*?dockerMemoryAlertOpen \? 'bad'[\s\S]*?: 'good'/);
    assert.match(resourceStatus, /const hostSwapTone = [\s\S]*?hostMemoryAlertOpen \? 'bad'[\s\S]*?: 'good'/);
    assert.match(resourceStatus, /gatewayCpu > 70 \? 'bad' : gatewayCpu > 40 \? 'watch'/);
    assert.match(resourceStatus, /diskFree < 10 \? 'bad' : diskFree < 30 \? 'watch'/);
    // 기록이 없을 때 0으로 보이면 "정상"으로 오해한다.
    assert.match(resourceStatus, /none: \{[^}]*mark: '기록 없음'/);
    assert.match(servicePanel, /dockerMemoryAlertOpen=\{dockerMemoryAlertOpen\}/);
    assert.match(servicePanel, /hostMemoryAlertOpen=\{hostMemoryAlertOpen\}/);
});

test('맥·도커 현재값과 도커의 오늘 최악값을 5분마다 함께 남긴다', () => {
    // 하루 한 번(04:50)만 재면 가장 한가한 새벽만 보게 되어 수업 시간의 나쁜 순간을 놓친다.
    assert.match(healthScript, /record_system_resource_sample_v2/);
    assert.match(healthScript, /docker.*exec agit-db|"\$DOCKER" exec agit-db/);
    assert.match(healthScript, /agit-kong/);
    assert.match(healthScript, /memory_pressure -Q/);
    assert.match(healthScript, /sysctl vm\.swapusage/);
    // 여유가 적을수록·스왑과 CPU 는 클수록 나쁘다. 갱신 방향이 뒤집히면 값이 거짓이 된다.
    assert.match(migration, /vm_mem_available_min_mb = LEAST\(/);
    assert.match(migration, /vm_swap_used_max_mb = GREATEST\(/);
    assert.match(migration, /gateway_cpu_max_pct = GREATEST\(/);
    assert.match(currentMigration, /vm_mem_available_current_mb = EXCLUDED\.vm_mem_available_current_mb/);
    assert.match(currentMigration, /host_mem_available_pct = EXCLUDED\.host_mem_available_pct/);
    // 로그인한 교사·학생은 기록 RPC 를 부를 수 없다.
    assert.match(migration, /IF public\.auth_user_role\(\) IN \('TEACHER', 'STUDENT'\) THEN/);
    assert.match(currentMigration, /REVOKE ALL ON FUNCTION public\.record_system_resource_sample_v2[\s\S]*?FROM PUBLIC, anon, authenticated;/);
    assert.match(currentMigration, /resource_sampled_at = NOW\(\)/, '5분 현재값의 실제 표본 시각이 따로 남아야 한다');
});

test('잔여 스왑이 아니라 실제 메모리 압박 신호로 출처별 알림을 띄운다', () => {
    // 스왑된 차가운 페이지는 여유가 생겨도 남을 수 있다. 100MB 같은 총량 하나만으로 장애라 하면 안 된다.
    assert.match(healthScript, /VM_MEM_CRITICAL_PCT="\$\{VM_MEM_CRITICAL_PCT:-15\}"/);
    assert.match(healthScript, /VM_SWAP_NEAR_FULL_PCT="\$\{VM_SWAP_NEAR_FULL_PCT:-90\}"/);
    assert.match(healthScript, /VM_SWAP_OUT_ALERT_MB="\$\{VM_SWAP_OUT_ALERT_MB:-64\}"/);
    assert.match(healthScript, /VM_PSI_SOME_ALERT_PCT="\$\{VM_PSI_SOME_ALERT_PCT:-1\.0\}"/);
    assert.match(healthScript, /pswpout/);
    assert.match(healthScript, /\/proc\/pressure\/memory/);
    assert.match(healthScript, /report docker_memory_pressure true/);
    assert.match(healthScript, /report docker_memory_pressure false/);
    assert.match(healthScript, /report host_memory_pressure true/);
    assert.match(healthScript, /report host_memory_pressure false/);
    assert.doesNotMatch(healthScript, /SWAP_USED:-0\}" -gt 100/);
    assert.doesNotMatch(healthScript, /report memory_low true/);
    assert.match(healthScript, /report memory_low false/, '기존에 열린 통합 경고는 새 기준 전환 때 닫아야 한다');
});

test('조회 RPC 가 새 값을 함께 내려 준다', () => {
    // 화면이 읽는 두 자리(추세·최근 기록) 모두에 새 칸이 있어야 한다. 한쪽만 넣으면 카드가 빈다.
    const selects = migration.match(/vm_mem_total_mb, vm_mem_available_min_mb, vm_swap_used_max_mb,\s*\n\s*gateway_cpu_max_pct, gateway_mem_max_mb/g);
    assert.equal(selects?.length, 2, '추세와 최근 기록 두 곳 모두에 새 칸이 있어야 한다');
    const currentSelects = accuracyMigration.match(/vm_mem_total_mb, vm_mem_available_min_mb, vm_swap_used_max_mb,\s*\n\s*gateway_cpu_max_pct, gateway_mem_max_mb/g);
    assert.equal(currentSelects?.length, 2, '최신 조회 RPC도 추세와 최근 기록에 서버 자원 칸을 모두 내려야 한다');
    const rpcStart = currentMigration.indexOf('CREATE OR REPLACE FUNCTION public.admin_get_service_overview_v1');
    const trendStart = currentMigration.indexOf('SELECT COALESCE(jsonb_agg(to_jsonb(d)', rpcStart);
    const latestStart = currentMigration.indexOf('SELECT to_jsonb(m)', trendStart);
    const alertsStart = currentMigration.indexOf('SELECT COALESCE(jsonb_agg(to_jsonb(a)', latestStart);
    for (const [name, block] of [
        ['추세', currentMigration.slice(trendStart, latestStart)],
        ['최신값', currentMigration.slice(latestStart, alertsStart)],
    ]) {
        for (const field of ['resource_sampled_at', 'host_mem_available_pct', 'host_swap_used_mb']) {
            assert.ok(block.includes(field), `${name} SELECT에 ${field}가 없다`);
        }
    }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [resourceStatus, servicePanel, dashboard, healthScript, migration, accuracyMigration] = await Promise.all([
    readFile('src/components/admin/AdminResourceStatus.jsx', 'utf8'),
    readFile('src/components/admin/AdminServicePanel.jsx', 'utf8'),
    readFile('src/components/admin/AdminDashboard.jsx', 'utf8'),
    readFile('scripts/check-service-health.sh', 'utf8'),
    readFile('supabase/migrations/20261158_system_memory_and_gateway_peaks.sql', 'utf8'),
    readFile('supabase/migrations/20261163_dashboard_metrics_accuracy.sql', 'utf8'),
]);

test('서버 운영 정보는 운영 탭의 `서버 상태` 한 곳에 모인다', () => {
    // 예전에는 `현황 > 서비스 현황` 과 `운영 > 백업 상태` 로 흩어져 있었다.
    assert.match(dashboard, /\{ id: 'service', label: '서버 상태' \},\s*\n\s*\{ id: 'backup', label: '백업 상태' \}/);
    assert.ok(!/\{ id: 'service', label: '서비스 현황' \}/.test(dashboard), '옛 이름이 남아 있다');
    // 링크가 깨지지 않도록 id 는 그대로 둔다.
    assert.match(dashboard, /active=\{currentTab === 'service'\}/);
});

test('자원 카드는 값과 함께 판단 기준을 보여 준다', () => {
    // 숫자만 있으면 "그래서 괜찮은가"를 운영자가 매번 스스로 판단해야 한다.
    for (const 문구 of [
        '도커 메모리 할당을 올리세요',
        '메모리가 모자라 디스크로 밀어냈습니다',
        'kong 워커를 2에서 늘리세요',
        '도커 캐시부터 정리하세요',
    ]) {
        assert.ok(resourceStatus.includes(문구), `판단 문구가 없다: ${문구}`);
    }
    // 기준값이 흐려지지 않게 못 박는다.
    assert.match(resourceStatus, /memPercent < 15 \? 'bad' : memPercent < 30 \? 'watch'/);
    assert.match(resourceStatus, /swapUsed > 100 \? 'bad' : swapUsed > 0 \? 'watch'/);
    assert.match(resourceStatus, /gatewayCpu > 70 \? 'bad' : gatewayCpu > 40 \? 'watch'/);
    assert.match(resourceStatus, /diskFree < 10 \? 'bad' : diskFree < 30 \? 'watch'/);
    // 기록이 없을 때 0으로 보이면 "정상"으로 오해한다.
    assert.match(resourceStatus, /none: \{[^}]*mark: '기록 없음'/);
    assert.match(servicePanel, /<AdminResourceStatus latest=\{latest\} \/>/);
});

test('메모리와 게이트웨이는 5분마다 재서 그날 최악값을 남긴다', () => {
    // 하루 한 번(04:50)만 재면 가장 한가한 새벽만 보게 되어 수업 시간의 나쁜 순간을 놓친다.
    assert.match(healthScript, /record_system_peak_v1/);
    assert.match(healthScript, /docker.*exec agit-db|"\$DOCKER" exec agit-db/);
    assert.match(healthScript, /agit-kong/);
    // 여유가 적을수록·스왑과 CPU 는 클수록 나쁘다. 갱신 방향이 뒤집히면 값이 거짓이 된다.
    assert.match(migration, /vm_mem_available_min_mb = LEAST\(/);
    assert.match(migration, /vm_swap_used_max_mb = GREATEST\(/);
    assert.match(migration, /gateway_cpu_max_pct = GREATEST\(/);
    // 로그인한 교사·학생은 기록 RPC 를 부를 수 없다.
    assert.match(migration, /IF public\.auth_user_role\(\) IN \('TEACHER', 'STUDENT'\) THEN/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.record_system_peak_v1[\s\S]*?FROM PUBLIC, anon, authenticated;/);
    assert.match(accuracyMigration, /recorded_at = NOW\(\)/, '5분 최고치가 바뀌면 마지막 기록 시각도 바뀌어야 한다');
});

test('메모리가 모자라면 알림을 띄운다', () => {
    // 2026-08-23 에 여유 10%·스왑 100% 였는데 아무도 보지 않아 사람이 손으로 찾았다.
    assert.match(healthScript, /report memory_low true/);
    assert.match(healthScript, /report memory_low false/);
    assert.match(healthScript, /MEM_PCT" -lt 15 \] \|\| \[ "\$\{SWAP_USED:-0\}" -gt 100/);
});

test('조회 RPC 가 새 값을 함께 내려 준다', () => {
    // 화면이 읽는 두 자리(추세·최근 기록) 모두에 새 칸이 있어야 한다. 한쪽만 넣으면 카드가 빈다.
    const selects = migration.match(/vm_mem_total_mb, vm_mem_available_min_mb, vm_swap_used_max_mb,\s*\n\s*gateway_cpu_max_pct, gateway_mem_max_mb/g);
    assert.equal(selects?.length, 2, '추세와 최근 기록 두 곳 모두에 새 칸이 있어야 한다');
    const currentSelects = accuracyMigration.match(/vm_mem_total_mb, vm_mem_available_min_mb, vm_swap_used_max_mb,\s*\n\s*gateway_cpu_max_pct, gateway_mem_max_mb/g);
    assert.equal(currentSelects?.length, 2, '최신 조회 RPC도 추세와 최근 기록에 서버 자원 칸을 모두 내려야 한다');
});

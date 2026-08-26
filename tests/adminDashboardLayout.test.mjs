/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

/*
 * 관리자 화면은 탭이 13개까지 늘어나 한 줄에 평평하게 놓여 있었다(2026-08-21 정리).
 * 계정 관리·통계·콘텐츠 검수·서버 상태가 뒤섞여 찾는 데 시간이 걸렸다.
 * 앞으로 화면을 더할 때도 묶음 안에 넣도록 구조를 검사로 고정한다.
 */
test('관리자 화면은 성격별 묶음으로 나뉘고 모든 화면이 어느 한 묶음에 든다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');

    assert.match(dashboard, /const TAB_GROUPS = \[/);
    for (const group of ['teachers', 'status', 'review', 'ops']) {
        assert.ok(dashboard.includes(`id: '${group}'`), `'${group}' 묶음이 없다`);
    }

    // 화면을 그리는 조건(`currentTab === 'x'`)과 KeepAlivePanel 에 쓰인 이름을 모두 모아,
    // 묶음 정의에 빠진 것이 없는지 본다. 빠지면 눌러서 갈 수 없는 화면이 된다.
    const rendered = new Set([
        ...[...dashboard.matchAll(/currentTab === '([a-z]+)'/g)].map((m) => m[1]),
        ...[...dashboard.matchAll(/visitedTabs\.has\('([a-z]+)'\)/g)].map((m) => m[1])
    ]);
    const grouped = new Set([...dashboard.matchAll(/\{ id: '([a-z]+)', label: '[^']+' \}/g)].map((m) => m[1]));

    for (const tabId of rendered) {
        assert.ok(grouped.has(tabId), `'${tabId}' 화면이 어느 묶음에도 들어 있지 않다`);
    }
    assert.ok(grouped.size >= 13, `묶음에 담긴 화면이 ${grouped.size}개뿐이다`);
});

/*
 * 묶음으로 접으면 처리할 일이 있는지 한눈에 안 보일 위험이 생긴다.
 * 그래서 ①묶음 이름에 안쪽 합계 배지를 띄우고 ②위쪽 요약 카드를 눌러 바로 가게 했다.
 * 이 둘이 빠지면 "정리했는데 오히려 놓치는" 화면이 된다.
 */
test('처리할 일은 묶음 배지와 요약 카드 양쪽에서 보인다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');
    const overview = await read('src/components/admin/AdminDashboardOverview.jsx');

    assert.match(dashboard, /const tabBadges = useMemo\(/);
    assert.match(dashboard, /group\.tabs\.reduce\(\(sum, tab\) => sum \+ \(tabBadges\[tab\.id\] \|\| 0\), 0\)/);
    for (const key of ['pending', 'dormant', 'cleanup', 'feedback']) {
        assert.ok(dashboard.includes(`${key}:`), `'${key}' 배지 개수가 없다`);
    }

    // 요약 항목은 눌러서 그 일을 처리하는 화면으로 간다.
    assert.match(dashboard, /<AdminDashboardOverview groups=\{overviewGroups\}/);
    assert.match(overview, /group\.items\.map/);
    for (const tabId of ['service', 'pending', 'dormant', 'cleanup', 'feedback']) {
        assert.ok(dashboard.includes(`onOpen: () => setCurrentTab('${tabId}')`), `요약 카드에서 '${tabId}' 로 가는 길이 없다`);
    }
});

/*
 * 예전에는 탭을 벗어나면 화면이 사라져, 돌아올 때마다 서버를 처음부터 다시 읽었다.
 * 검수처럼 화면을 오가며 하는 일에서 그 기다림이 매번 반복됐다.
 */
test('한 번 연 화면은 살려 두어 다시 열 때 서버를 다시 읽지 않는다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');

    assert.match(dashboard, /const KeepAlivePanel = \(\{ active, visited, children \}\)/);
    assert.match(dashboard, /if \(!visited\) return null;/);
    assert.match(dashboard, /display: active \? 'block' : 'none'/);

    // 서버를 다시 읽는 패널은 모두 살려 두어야 한다.
    for (const tabId of ['students', 'dormant', 'cleanup', 'lab', 'backup', 'vocab', 'spelling', 'announcements']) {
        assert.ok(dashboard.includes(`visited={visitedTabs.has('${tabId}')}`), `'${tabId}' 화면이 살려 두기에서 빠졌다`);
    }
});

/* 현황 안의 이용 규모와 기존 조치·서버 카드를 첫 화면 운영 요약 한 곳으로 합친다. */
test('관리자 첫 화면은 조치·이용 현황·시스템 상태를 한 번에 보여 준다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');
    const overview = await read('src/components/admin/AdminDashboardOverview.jsx');

    for (const label of ['서버 조치 필요', '장기 미접속', '정리 후보 전체', '가입 선생님', '운영 학급', '등록 학생', '컨테이너', '디스크 여유']) {
        assert.ok(dashboard.includes(`label: '${label}'`), `첫 화면 요약에 '${label}' 이 없다`);
    }
    assert.match(dashboard, /currentTab === 'active' && <AdminDashboardOverview/);
    assert.match(overview, /오늘 확인할 운영 요약/);

    // 이제 맥 본체 현재값을 직접 재므로 상단에서도 도커 값으로 짐작하지 않고 따로 보여 준다.
    assert.match(dashboard, /label: '맥 메모리\/스왑'/);

    // 서비스 현황 패널과 **같은 RPC** 를 쓴다. 같은 값을 두 곳에서 따로 세면 숫자가 갈린다.
    const hook = await read('src/components/admin/useAdminHealthSummary.js');
    assert.match(hook, /admin_get_service_overview_v1/);
    assert.match(hook, /host_mem_available_pct/);
    assert.match(hook, /host_swap_used_mb/);
    assert.match(hook, /openAlertKeys: openAlerts\.map/);
    assert.match(dashboard, /openAlertKeys\?\.includes\('host_memory_pressure'\)/,
        '상단 맥 메모리 색도 5분 건강검진의 실제 압박 판정을 재사용해야 한다');
    // 상단은 곁눈질용이라 추이까지 받지 않는다.
    assert.match(hook, /p_trend_days: 1/);
});

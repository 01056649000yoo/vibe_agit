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
    /*
     * 예전에는 큰 묶음 단추에 그 안의 배지를 합쳐 띄웠다. 한 줄 탭으로 펴면서 묶음 단추가
     * 없어졌으므로, 이제는 **처리할 일이 있는 화면 자체가 맨 앞으로 나온다**(2026-08-28).
     * 지키려는 것은 같다 — 배지를 봐야 놓치지 않는다.
     */
    assert.match(dashboard, /const urgentTabs = TAB_GROUPS\.flatMap\(\(group\) => group\.tabs\)\.filter\(\(tab\) => \(tabBadges\[tab\.id\] \|\| 0\) > 0\)/);
    assert.match(dashboard, /지금 할 일/);
    // 할 일이 없으면 앞 칸이 사라지고 늘 같은 순서만 남는다.
    assert.match(dashboard, /urgentTabs\.length > 0 && \(/);
    assert.match(dashboard, /badge=\{tabBadges\[tab\.id\]\}/);
    for (const key of ['pending', 'dormant', 'feedback', 'backup']) {
        assert.ok(dashboard.includes(`${key}:`), `'${key}' 배지 개수가 없다`);
    }

    // 요약 항목은 눌러서 그 일을 처리하는 화면으로 간다.
    assert.match(dashboard, /<AdminDashboardOverview groups=\{overviewGroups\}/);
    assert.match(overview, /group\.items\.map/);
    for (const tabId of ['service', 'backup', 'pending', 'dormant', 'feedback']) {
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
    for (const tabId of ['students', 'dormant', 'lab', 'backup', 'vocab', 'spelling', 'announcements']) {
        assert.ok(dashboard.includes(`visited={visitedTabs.has('${tabId}')}`), `'${tabId}' 화면이 살려 두기에서 빠졌다`);
    }
});

/* 현황 안의 이용 규모와 기존 조치·서버 카드를 첫 화면 운영 요약 한 곳으로 합친다. */
test('관리자 첫 화면은 조치·이용 현황·시스템 상태를 한 번에 보여 준다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');
    const overview = await read('src/components/admin/AdminDashboardOverview.jsx');

    for (const label of ['서버 조치 필요', '장기 미접속', '가입 선생님', '운영 학급', '등록 학생', '컨테이너', '앱 백업', '디스크 여유']) {
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

test('관리자 첫 화면 맨 위에서 오늘 교사·학생 접속과 제출글을 바로 본다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');
    const overviewCss = await read('src/components/admin/AdminDashboardOverview.css');
    const healthHook = await read('src/components/admin/useAdminHealthSummary.js');

    for (const [label, field, unit] of [
        ['오늘 접속 교사', 'todayTeachers', '명'],
        ['오늘 접속 학생', 'todayStudents', '명'],
        ['오늘 제출글', 'todaySubmittedPosts', '편']
    ]) {
        assert.ok(dashboard.includes(`label: '${label}'`), `첫 화면에 '${label}' 카드가 없다`);
        const valueExpression = 'health.summary?.' + field
            + ' != null ? `${health.summary.' + field + '}' + unit + '`';
        assert.ok(dashboard.includes(valueExpression), `'${label}' 카드가 서버 집계 값을 쓰지 않는다`);
    }

    // 서버 상태 화면과 같은 RPC 결과를 재사용한다. 같은 숫자를 위한 별도 조회를 만들지 않는다.
    assert.match(healthHook, /todayTeachers: data\?\.today\?\.teachers \?\? null/);
    assert.match(healthHook, /todayStudents: data\?\.today\?\.students \?\? null/);
    assert.match(healthHook, /todaySubmittedPosts: data\?\.today\?\.posts \?\? null/);
    assert.match(dashboard, /id: 'today',[\s\S]*?id: 'actions'/, '오늘 현황이 첫 요약 묶음이어야 한다');
    assert.match(overviewCss, /admin-overview__group--today[\s\S]*?grid-column: 1 \/ -1/);
});

/*
 * 첫 화면 숫자는 기준이 제각각이다 — `지금까지 전체`와 `최근 30일`이 한 묶음 안에 섞여 있다.
 * 묶음 머리말 하나로는 알 수 없어 누적 숫자를 그 기간의 숫자로 잘못 읽었다(2026-08-28 지적).
 * 그래서 **모든 항목이 자기 기준을 달고 있어야** 한다. 새 항목이 기준 없이 붙는 것을 막는다.
 */
test('첫 화면 요약은 항목마다 무엇을 센 숫자인지 밝힌다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');
    const overview = await read('src/components/admin/AdminDashboardOverview.jsx');
    const overviewCss = await read('src/components/admin/AdminDashboardOverview.css');

    // 화면이 기준을 실제로 그린다(값 밑 작은 줄 + 읽어 주는 이름표).
    assert.match(overview, /item\.basis && <em>\{item\.basis\}<\/em>/);
    assert.match(overview, /기준 \$\{item\.basis\}/);
    assert.match(overviewCss, /\.admin-overview__metric-copy em/);

    // 요약 항목은 하나도 빠짐없이 기준을 단다(탭 목록은 숫자가 아니므로 제외한다).
    const groupsBlock = dashboard.match(/const overviewGroups = \[[\s\S]*?\n    \];/)?.[0] || '';
    assert.ok(groupsBlock, 'overviewGroups 를 찾지 못했다');
    const itemLines = groupsBlock.split('\n').filter((line) => /^\s*\{ id: '[^']+', label: /.test(line));
    assert.ok(itemLines.length >= 15, `요약 항목을 찾지 못했다(${itemLines.length}개)`);
    const missing = itemLines
        .filter((line) => !line.includes('basis:'))
        .map((line) => line.match(/label: (`[^`]+`|'[^']+')/)?.[1] || line.trim().slice(0, 40));
    assert.deepEqual(missing, [], `기준을 안 적은 요약 항목이 있다:\n  ${missing.join('\n  ')}`);

    // 누적과 기간을 섞어 놓은 묶음은 머리말에 한 기간만 적지 않는다.
    assert.match(dashboard, /title: '이용 현황',[\s\S]{0,300}description: '항목마다 기준이 다릅니다'/);
    assert.ok(dashboard.includes("basis: '지금까지 전체'"), '누적 항목에 누적이라고 적어야 한다');
    assert.match(dashboard, /basis: `최근 \$\{usage\.activityDays\}일`/);

    // 시스템 값은 기간이 아니라 잰 시각이 기준이다.
    assert.match(dashboard, /resourceSampledAt/);
    assert.match(dashboard, /sampledAtLabel \? `\$\{sampledAtLabel\}에 잰 값`/);
});

test('관리자 화면 탭은 한 줄에 모두 펴고 같은 생김새를 쓴다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');

    /*
     * 큰 묶음(1단) → 그 안의 화면(2단) 두 층이면 어느 화면이든 예외 없이 두 번을 눌러야 하고,
     * 1단만 단추처럼 생겨 눈에는 탭이 넷만 보였다. 화면은 열넷인데.
     */
    assert.match(dashboard, /const AdminTabButton = /);
    // 묶음을 눌러 첫 화면으로 넘기던 옛 동작이 되살아나면 다시 두 단계가 된다.
    assert.doesNotMatch(dashboard, /onClick=\{\(\) => setCurrentTab\(group\.tabs\[0\]\.id\)\}/);
    assert.doesNotMatch(dashboard, /const activeGroup = findTabGroup/);
    // 묶음은 구분선과 이름표로만 남는다.
    assert.match(dashboard, /restGroups\.map\(\(group, groupIndex\) =>/);
    assert.match(dashboard, /group\.tabs\.map\(tab => <AdminTabButton/);
});

test('탭 계산은 배지가 만들어진 뒤에 온다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');

    /*
     * `const` 는 끌어올려지지 않는다. 렌더 중에 선언보다 먼저 쓰면 그 자리에서 터져
     * **관리자 화면이 통째로 흰 화면이 된다**(2026-08-28 실제로 발생).
     * 빌드·ESLint·전체 회귀가 모두 통과했다 — 어느 것도 화면을 그려 보지 않기 때문이다.
     * 그래서 순서를 여기서 못 박는다.
     */
    const badgesAt = dashboard.indexOf('const tabBadges = useMemo(');
    const urgentAt = dashboard.indexOf('const urgentTabs = ');
    assert.ok(badgesAt > 0 && urgentAt > 0, '두 선언을 찾지 못했다');
    assert.ok(
        badgesAt < urgentAt,
        'urgentTabs 가 tabBadges 보다 먼저 있다 — 렌더 중에 터져 흰 화면이 된다'
    );
});

test('어느 관리자 메뉴에서도 고정 홈 버튼으로 첫 화면 상태를 복구한다', async () => {
    const dashboard = await read('src/components/admin/AdminDashboard.jsx');
    const homeButton = await read('src/components/admin/AdminHomeButton.jsx');
    const homeButtonCss = await read('src/components/admin/AdminHomeButton.css');

    assert.match(dashboard, /import AdminHomeButton from '\.\/AdminHomeButton';/);
    assert.match(dashboard, /<AdminHomeButton onGoHome=\{handleGoHome\} isHome=\{currentTab === 'active'\} \/>/);
    assert.match(dashboard, /const handleGoHome = \(\) => \{[\s\S]*?setCurrentTab\('active'\);[\s\S]*?setSearchTerm\(''\);[\s\S]*?setCurrentPage\(1\);[\s\S]*?setPendingGroup\('new'\);[\s\S]*?window\.scrollTo\(\{ top: 0,/);

    assert.match(homeButton, /aria-label="관리자 대시보드 홈으로 이동"/);
    assert.match(homeButton, /aria-current=\{isHome \? 'page' : undefined\}/);
    assert.match(homeButton, /<span>관리자 홈<\/span>/);
    assert.match(homeButtonCss, /position:\s*fixed/);
    assert.match(homeButtonCss, /bottom:\s*max\(18px, env\(safe-area-inset-bottom\)\)/);
    assert.match(homeButtonCss, /z-index:\s*1200/);
    assert.match(homeButtonCss, /:focus-visible/);
    assert.match(homeButtonCss, /@media \(max-width: 560px\)/);
});

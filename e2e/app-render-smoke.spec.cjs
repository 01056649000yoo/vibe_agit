// @ts-check
/*
 * 실제 앱 화면 렌더 스모크 — 로그인해야 보이는 교사·학생·관리자 화면을 운영 서버 없이 띄워
 * 메뉴를 하나씩 눌러 본다(2026-09-28).
 *
 * 왜: e2e/render-smoke.spec.cjs 는 DB 없는 미리보기(src/dev/)만 본다. 실제 대시보드는 로그인·학급·
 * 부트스트랩 RPC 가 있어야 그려지므로 거기서는 못 본다. 여기서는 Supabase 를 통째로 가짜로 바꿔
 * ① 잡히지 않은 예외 ② React·오류 방어막(ErrorBoundary 와 모듈별 경계)의 console.error ③ 빈 화면을 실패로 본다.
 * 판정 방식은 render-smoke 와 같다.
 *
 * 운영 서버에 안 가는 이유:
 *   - 개발 서버를 VITE_SUPABASE_URL=http://fake-supabase.test 로 띄운다(실행 방법 참조).
 *   - fake-supabase.test 요청은 전부 page.route 가 답한다(e2e/fixtures/app-smoke-fixtures.cjs).
 *   - localhost 와 글꼴 CDN 이 아닌 다른 호스트 요청은 abort 하고 "막은 요청"으로 기록한다.
 *   - Realtime 웹소켓은 routeWebSocket 으로 가로채 서버에 잇지 않는다.
 *
 * 메뉴 목록은 원본에서 읽는다 — 메뉴를 더하면 저절로 검사된다.
 *   교사: src/constants/teacherNav.js TEACHER_NAV_GROUPS
 *   설정: src/components/teacher/TeacherSettingsHub.jsx SETTINGS_ITEMS(+매니페스트 settingsEntry)
 *   학급운영도구: src/modules/registry.js 에 등록된 part:'tool' 매니페스트
 *   학생: src/components/student/studentNavigation.js STUDENT_BOTTOM_NAV_TABS
 *   관리자: src/components/admin/AdminDashboard.jsx TAB_GROUPS
 *
 * 실행(bash):
 *   npm run test:render   (가짜 Supabase 주소는 playwright.config.cjs 가 넣는다)
 *   npx playwright test e2e/app-render-smoke.spec.cjs --reporter=line < /dev/null
 *   ※ 이미 다른 설정으로 떠 있는 5173 개발 서버가 있으면 그것을 재사용하므로 먼저 끈다.
 * 픽스처 없이 기본값으로 답한 요청은 test-results/**\/app-smoke-requests.json 에 남는다.
 */
const { test, expect } = require('@playwright/test');
const { readFileSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const {
    SUPABASE_URL, ROLE_FIXTURES, buildSession, readRpcReturnKinds, defaultForReturnKind, LEGACY_STORAGE_KEY
} = require('./fixtures/app-smoke-fixtures.cjs');

const ROOT = path.join(__dirname, '..');
const readSource = (...parts) => readFileSync(path.join(ROOT, ...parts), 'utf8');

/* ── 메뉴 목록: 원본에서 읽기 ─────────────────────────────────────────────── */

// teacherNav.js 는 import 가 없는 순수 상수 파일이라 export 만 떼고 그대로 평가한다.
const TEACHER_NAV_GROUPS = new Function(
    `${readSource('src', 'constants', 'teacherNav.js').replace(/\bexport\s+/g, '')}\nreturn TEACHER_NAV_GROUPS;`
)();

const extractArrayLiteral = (source, declaration) => {
    const start = source.indexOf(declaration);
    if (start < 0) throw new Error(`${declaration} 를 찾지 못했다`);
    const open = source.indexOf('[', start);
    let depth = 0;
    for (let index = open; index < source.length; index += 1) {
        if (source[index] === '[') depth += 1;
        if (source[index] === ']') depth -= 1;
        if (depth === 0) return source.slice(open, index + 1);
    }
    throw new Error(`${declaration} 배열 끝을 찾지 못했다`);
};

const STUDENT_BOTTOM_NAV_TABS = new Function(`return ${extractArrayLiteral(
    readSource('src', 'components', 'student', 'studentNavigation.js'), 'STUDENT_BOTTOM_NAV_TABS'
)};`)();

const ADMIN_TAB_GROUPS = new Function(`return ${extractArrayLiteral(
    readSource('src', 'components', 'admin', 'AdminDashboard.jsx'), 'const TAB_GROUPS'
)};`)();

// 등록된 매니페스트 파일 → 설정 항목·학급운영도구 이름
const registrySource = readSource('src', 'modules', 'registry.js');
const MANIFESTS = [...registrySource.matchAll(/^import\s+\{\s*\w+\s*\}\s+from\s+'\.\/([^']+\/manifest)';/gm)]
    .map((match) => readSource('src', 'modules', `${match[1]}.js`));
const manifestName = (source) => source.match(/^\s*name:\s*'([^']+)'/m)?.[1];
const isAvailable = (source) => !/^\s*available:\s*false/m.test(source);

const TOOL_LABELS = MANIFESTS
    .filter((source) => /^\s*part:\s*'tool'/m.test(source) && /^\s*teacherEntry:/m.test(source) && isAvailable(source))
    .map(manifestName);

const settingsItemsLiteral = extractArrayLiteral(
    readSource('src', 'components', 'teacher', 'TeacherSettingsHub.jsx'), 'const SETTINGS_ITEMS'
);
const SETTINGS_LABELS = [
    ...[...settingsItemsLiteral.matchAll(/label:\s*'([^']+)'/g)].map((match) => match[1]),
    ...MANIFESTS
        .filter((source) => /^\s*settingsEntry:/m.test(source) && isAvailable(source))
        .map((source) => source.match(/settings:\s*\{[^}]*label:\s*'([^']+)'/)?.[1] || manifestName(source))
];

/* ── 앱 버그 후보(B) — 스펙은 초록으로 두고 여기에 이유를 남긴다 ─────────────────── */
// 키 = 화면 이름(테스트 제목의 `—` 뒤). 값 = 재현 조건과 파일:줄. 고치면 줄을 지운다.
const KNOWN_APP_BUGS = {
};

/* ── 판정 ─────────────────────────────────────────────────────────────────── */

// 화면 잘못이 아니라 바깥 사정·이미 알려진 것만 거른다. 거르는 이유를 한 줄씩 적는다.
const IGNORED_CONSOLE = [
    // 네트워크 계층 로그. 가짜 서버가 406(0행)·abort 로 답한 것까지 여기 찍힌다. 요청 기록에 따로 남긴다.
    /Failed to load resource/i,
    /Download the React DevTools/i,
];

// 정적 자원이라 "운영으로 샌 요청"으로 치지 않는다. 그래도 받지는 않고 abort 한다(오프라인에서도 같게 돈다).
const ALLOWED_EXTERNAL = [
    /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
    /^https:\/\/xn--9y2br3k43n\.kr\//, // 샘링크(URL 단축하기)는 도구 화면이 샘링크를 iframe 으로 띄운다(src/modules/tool/samlink/TeacherEntry.jsx)
    /^https:\/\/accounts\.google\.com\/gsi\/client/ // 구글 로그인 스크립트(index.html). 로그인 자체는 가짜 세션으로 대신한다
];
const RPC_RETURN_KINDS = readRpcReturnKinds();

const json = (route, status, body, headers = {}) => route.fulfill({
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers },
    body: body === undefined ? '' : JSON.stringify(body)
});

/**
 * 가짜 Supabase 를 붙인다. 반환하는 log 에 기본값으로 답한 요청·막은 요청을 모은다.
 */
const installFakeSupabase = async (page, roleKey) => {
    const fixture = ROLE_FIXTURES[roleKey];
    const session = buildSession(fixture.user);
    const log = { defaults: [], blocked: [], fixtures: [] };

    // 예전 localStorage 세션 자리에 넣으면 앱이 스스로 setSession → 공유 쿠키로 옮긴다(supabaseClient.js).
    await page.addInitScript(([key, value]) => {
        // 이 스크립트는 iframe 에도 돈다. 막힌 샘링크 iframe(오류 문서)은 cookie 를 읽으면 던지므로 맨 위 창에서만 한다.
        if (window !== window.top) return;
        if (!document.cookie.includes('sb-agit-auth-token')) window.localStorage.setItem(key, value);
        // 공지·동행 안내가 뜨는지는 이 스모크의 관심사가 아니다. 창이 떠도 판정은 같다.
    }, [LEGACY_STORAGE_KEY, JSON.stringify(session)]);

    await page.routeWebSocket(/fake-supabase\.test/, () => { /* 서버에 잇지 않는다 — Realtime 은 조용히 멈춘다 */ });

    await page.route(/^(?!http:\/\/localhost:5173\/)/, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!request.url().startsWith(SUPABASE_URL)) {
            if (ALLOWED_EXTERNAL.some((pattern) => pattern.test(request.url()))) return route.abort();
            if (/^(data|blob):/.test(request.url())) return route.continue();
            log.blocked.push(`${request.method()} ${url.origin}${url.pathname}`);
            return route.abort();
        }
        if (request.method() === 'OPTIONS') {
            return route.fulfill({ status: 204, headers: {
                'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
                'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,HEAD,OPTIONS'
            } });
        }
        const { pathname } = url;

        if (pathname.startsWith('/auth/v1/')) {
            if (pathname === '/auth/v1/user') return json(route, 200, fixture.user);
            if (pathname === '/auth/v1/token') return json(route, 200, session);
            if (pathname === '/auth/v1/logout') return json(route, 204);
            log.defaults.push(`AUTH ${request.method()} ${pathname}`);
            return json(route, 200, {});
        }

        if (pathname.startsWith('/rest/v1/rpc/')) {
            const name = pathname.slice('/rest/v1/rpc/'.length);
            const own = fixture.rpc?.[name];
            const value = typeof own === 'function' ? own(request.postDataJSON?.()) : own;
            if (value !== undefined) {
                log.fixtures.push(name);
                return json(route, 200, value);
            }
            const fallback = defaultForReturnKind(RPC_RETURN_KINDS.get(name));
            log.defaults.push(`RPC ${name} → ${fallback.kind}:${JSON.stringify(fallback.body ?? null)}`);
            return json(route, fallback.status, fallback.body);
        }

        if (pathname.startsWith('/rest/v1/')) {
            const table = pathname.slice('/rest/v1/'.length);
            const accept = request.headers()['accept'] || '';
            const prefer = request.headers()['prefer'] || '';
            const method = request.method();
            log.defaults.push(`TABLE ${method} ${table}${url.search ? `?${decodeURIComponent(url.searchParams.get('select') || '')}` : ''}`);
            const countHeaders = { 'content-range': '*/0' };
            if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...countHeaders, 'access-control-allow-origin': '*' } });
            const wantsObject = accept.includes('application/vnd.pgrst.object+json');
            // 실제 PostgREST 와 같게 답한다: 0행에 .single() 이면 406, 목록이면 [].
            if (wantsObject) {
                return json(route, 406, { code: 'PGRST116', details: 'The result contains 0 rows', hint: null,
                    message: 'JSON object requested, multiple (or no) rows returned' });
            }
            if (method === 'GET') return json(route, 200, [], countHeaders);
            if (prefer.includes('return=representation')) return json(route, method === 'POST' ? 201 : 200, []);
            return json(route, method === 'POST' ? 201 : 204);
        }

        if (pathname.startsWith('/functions/v1/')) {
            const name = pathname.slice('/functions/v1/'.length);
            const own = fixture.functions?.[name];
            if (own !== undefined) {
                log.fixtures.push(`fn:${name}`);
                return json(route, 200, own);
            }
            log.defaults.push(`FUNCTION ${name}`);
            return json(route, 200, {});
        }

        if (pathname.startsWith('/storage/v1/')) {
            log.defaults.push(`STORAGE ${request.method()} ${pathname}`);
            if (pathname.includes('/object/list/')) return json(route, 200, []);
            return json(route, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        }

        log.defaults.push(`OTHER ${request.method()} ${pathname}`);
        return json(route, 404, {});
    });

    return log;
};

const watchProblems = (page) => {
    const problems = [];
    // 어디서 터졌는지 알 수 있게 스택 앞 세 줄을 붙인다.
    page.on('pageerror', (error) => problems.push(`예외: ${error.message}\n${String(error.stack || '').split('\n').slice(1, 4).join('\n')}`));
    page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
        problems.push(`console.error: ${text.slice(0, 400)}`);
    });
    // 경고창(학생 연결 해제 안내 등)이 뜨면 기록하고 닫는다. 멈춰 있으면 다음 동작이 막힌다.
    page.on('dialog', (dialog) => {
        problems.push(`dialog(${dialog.type()}): ${dialog.message().slice(0, 200)}`);
        void dialog.dismiss().catch(() => {});
    });
    return problems;
};

/** 지연 로딩 조각과 첫 조회가 끝날 틈을 준다. 학생 화면은 주기 조회가 있어 networkidle 을 끝까지 믿지 않는다. */
const settle = async (page) => {
    await page.waitForLoadState('networkidle', { timeout: 8_000 }).catch(() => {});
    await page.waitForTimeout(700);
};

const assertScreen = async (page, problems, log, testInfo) => {
    await settle(page);
    const text = (await page.locator('#root').innerText()).trim();
    writeFileSync(testInfo.outputPath('app-smoke-requests.json'), JSON.stringify({
        title: testInfo.title,
        defaults: [...new Set(log.defaults)],
        blocked: [...new Set(log.blocked)],
        fixtures: [...new Set(log.fixtures)],
        problems
    }, null, 2));
    expect(log.blocked, `운영·외부 호스트로 나가려던 요청(막음):\n${log.blocked.join('\n')}`).toEqual([]);
    expect.soft(text.length, '화면에 글자가 하나도 없다(흰 화면)').toBeGreaterThan(0);
    expect(problems, problems.join('\n')).toEqual([]);
};

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const defineScreen = (screenName, body) => {
    const reason = KNOWN_APP_BUGS[screenName];
    const title = `화면이 오류 없이 그려진다 — ${screenName}`;
    if (reason) test.fixme(title, async () => { /* 앱 버그 후보: 보고서 참조 */ void reason; });
    else test(title, body);
};

/* ── 교사 ─────────────────────────────────────────────────────────────────── */

const openTeacher = async (page, roleKey = 'teacher') => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('navigation', { name: '교사 업무 메뉴' })).toBeVisible({ timeout: 20_000 });
};

const clickTeacherGroup = async (page, group) => {
    const button = page.getByRole('navigation', { name: '교사 업무 메뉴' })
        .locator('button.teacher-dashboard__nav-item')
        .filter({ hasText: new RegExp(`${escapeRegExp(group.label)}\\s*\\d*$`) });
    await expect(button).toHaveCount(1);
    await button.click();
    await expect(button).toHaveAttribute('aria-pressed', 'true');
};

const clickTeacherTab = async (page, group, tab) => {
    const tabButton = page.getByRole('tablist', { name: `${group.label} 세부 메뉴` })
        .getByRole('tab', { name: new RegExp(`^${escapeRegExp(tab.label)}`) });
    await expect(tabButton).toHaveCount(1);
    await tabButton.click();
    await expect(tabButton).toHaveAttribute('aria-selected', 'true');
};

test.describe('교사', () => {
    test('메뉴 목록을 원본에서 읽었다', () => {
        expect(TEACHER_NAV_GROUPS.length).toBeGreaterThan(5);
        expect(TOOL_LABELS.length).toBeGreaterThan(2);
        expect(SETTINGS_LABELS.length).toBeGreaterThan(2);
    });

    for (const group of TEACHER_NAV_GROUPS) {
        if (group.launchHref) continue; // 글쓰기 연구소는 다른 앱(/lab)으로 나가는 링크다
        if (group.id === 'settings' || group.id === 'tools') continue; // 아래에서 항목별로 본다
        for (const tab of group.tabs) {
            defineScreen(`교사 ${group.label} › ${tab.label}`, async ({ page }, testInfo) => {
                const problems = watchProblems(page);
                const log = await installFakeSupabase(page, 'teacher');
                await openTeacher(page);
                await clickTeacherGroup(page, group);
                if (group.tabs.length > 1) await clickTeacherTab(page, group, tab);
                await assertScreen(page, problems, log, testInfo);
            });
        }
    }

    const settingsGroup = TEACHER_NAV_GROUPS.find((group) => group.id === 'settings');
    for (const label of SETTINGS_LABELS) {
        defineScreen(`교사 설정 › ${label}`, async ({ page }, testInfo) => {
            const problems = watchProblems(page);
            const log = await installFakeSupabase(page, 'teacher');
            await openTeacher(page);
            await clickTeacherGroup(page, settingsGroup);
            const menu = page.locator('[aria-label="설정 메뉴"]');
            await expect(menu).toBeVisible();
            // 화면의 설정 목록과 원본에서 읽은 목록이 같은지 먼저 본다.
            const shown = (await menu.getByRole('button').allInnerTexts()).map((value) => value.trim());
            expect(shown.length).toBe(SETTINGS_LABELS.length);
            const item = menu.getByRole('button').filter({ hasText: label });
            await item.first().click();
            await assertScreen(page, problems, log, testInfo);
        });
    }

    const toolsGroup = TEACHER_NAV_GROUPS.find((group) => group.id === 'tools');
    for (const label of TOOL_LABELS) {
        defineScreen(`교사 학급운영도구 › ${label}`, async ({ page }, testInfo) => {
            const problems = watchProblems(page);
            const log = await installFakeSupabase(page, 'teacher');
            await openTeacher(page);
            await clickTeacherGroup(page, toolsGroup);
            const menu = page.locator('[aria-label="학급운영도구 목록"]');
            await expect(menu).toBeVisible();
            expect(await menu.getByRole('button').count()).toBe(TOOL_LABELS.length);
            await menu.getByRole('button').filter({ hasText: label }).first().click();
            await assertScreen(page, problems, log, testInfo);
        });
    }

    defineScreen('교사 머리말 단축 단추 › ▾ 로 알림장 고정 → 열기 → 새로고침해도 유지', async ({ page }, testInfo) => {
        // 2026-09-28: 우리 반 스크린 자리에 학급운영도구 하나를 고정한다(v1.14).
        const problems = watchProblems(page);
        const log = await installFakeSupabase(page, 'teacher');
        await openTeacher(page);
        const shortcut = page.locator('.teacher-tool-shortcut .teacher-class-board-shortcut');
        await expect(shortcut).toContainText('우리 반 스크린');
        const toggle = page.getByRole('button', { name: '단축 단추에 고정할 학급운영도구 고르기' });
        await toggle.click();
        const menu = page.getByRole('menu', { name: '단축 단추에 고정할 학급운영도구' });
        await expect(menu).toBeVisible();
        expect(await menu.getByRole('menuitemradio').count()).toBe(TOOL_LABELS.length);
        await expect(menu.getByRole('menuitemradio', { name: /우리 반 스크린/ })).toHaveAttribute('aria-checked', 'true');
        await testInfo.attach('pin-menu-open', { body: await page.screenshot(), contentType: 'image/png' });
        await menu.getByRole('menuitemradio', { name: /알림장/ }).click();
        await expect(menu).toBeHidden();
        await expect(shortcut).toContainText('알림장');
        await shortcut.click();
        await expect(page.locator('[aria-label="학급운영도구 목록"]')).toBeVisible();
        await expect(page.locator('[aria-label="학급운영도구 목록"] [aria-current="page"], [aria-label="학급운영도구 목록"] .is-active').first()).toContainText('알림장');
        await page.reload();
        await expect(page.locator('.teacher-tool-shortcut .teacher-class-board-shortcut')).toContainText('알림장');
        await assertScreen(page, problems, log, testInfo);
    });

    defineScreen('교사 머리말 단축 단추 › 급식판을 고정하면 누르자마자 전체화면 급식판', async ({ page }, testInfo) => {
        // 2026-09-28: 급식판 매니페스트 `tool.shortcutLaunch: 'fullscreen'` — 단축 단추로 열면 곧바로 전체화면.
        const problems = watchProblems(page);
        const log = await installFakeSupabase(page, 'teacher');
        await openTeacher(page);
        await page.getByRole('button', { name: '단축 단추에 고정할 학급운영도구 고르기' }).click();
        await page.getByRole('menuitemradio', { name: /밥 먹자/ }).click();
        const shortcut = page.locator('.teacher-tool-shortcut .teacher-class-board-shortcut');
        await expect(shortcut).toContainText('밥 먹자');
        await shortcut.click();
        const board = page.getByRole('dialog', { name: /급식/ });
        await expect(board).toBeVisible();
        await expect(board).toContainText('가상 비빔밥');
        // 닫으면 급식판 화면에 남고, 다시 저절로 열리지 않는다(요청은 한 번만 처리).
        await page.getByRole('button', { name: '전체화면 급식판 닫기' }).click();
        await expect(board).toBeHidden();
        await page.waitForTimeout(500);
        await expect(board).toBeHidden();
        // 학급운영도구 메뉴에서 직접 고르면 전체화면이 아니라 급식판 화면이 열린다.
        await page.locator('[aria-label="학급운영도구 목록"]').getByRole('button').filter({ hasText: '알림장' }).first().click();
        await page.locator('[aria-label="학급운영도구 목록"]').getByRole('button').filter({ hasText: '밥 먹자' }).first().click();
        await expect(page.getByRole('button', { name: '전체화면 보기' })).toBeVisible();
        await expect(board).toBeHidden();
        await assertScreen(page, problems, log, testInfo);
    });

    defineScreen('교사 학급 0개 첫 화면', async ({ page }, testInfo) => {
        const problems = watchProblems(page);
        const log = await installFakeSupabase(page, 'teacherNoClass');
        await openTeacher(page, 'teacherNoClass');
        await assertScreen(page, problems, log, testInfo);
    });
});

/* ── 학생 ─────────────────────────────────────────────────────────────────── */

test.describe('학생', () => {
    test('하단 메뉴 목록을 원본에서 읽었다', () => {
        expect(STUDENT_BOTTOM_NAV_TABS.length).toBeGreaterThan(3);
    });
    // 흔한 휴대폰 폭에서 하단 메뉴 칸이 모두 화면 안에 들어오는지 잰다(칸이 밀려나면 그 메뉴는 눌러 볼 수 없다).
    for (const width of [360, 390, 430]) {
        test(`학생 하단 메뉴가 ${width}px 폭 안에 모두 들어온다`, async ({ page }) => {
            await installFakeSupabase(page, 'student');
            await page.setViewportSize({ width, height: 800 });
            await page.goto('/', { waitUntil: 'domcontentloaded' });
            const nav = page.locator('.bottom-nav-container');
            await expect(nav).toBeVisible({ timeout: 20_000 });
            const overflow = await nav.locator('.nav-item').evaluateAll((items) => items
                .map((item) => ({ label: item.textContent.trim(), left: Math.round(item.getBoundingClientRect().left), right: Math.round(item.getBoundingClientRect().right) }))
                .filter((box) => box.left < 0 || box.right > window.innerWidth));
            expect(overflow, `화면 밖으로 밀린 칸: ${JSON.stringify(overflow)}`).toEqual([]);
        });
    }

    for (const tab of STUDENT_BOTTOM_NAV_TABS) {
        defineScreen(`학생 하단 메뉴 › ${tab.label}`, async ({ page }, testInfo) => {
            const problems = watchProblems(page);
            const log = await installFakeSupabase(page, 'student');
            // 하단 메뉴는 1024px 이하에서만 보인다(StudentBottomNav.jsx).
            await page.setViewportSize({ width: 390, height: 844 });
            await page.goto('/', { waitUntil: 'domcontentloaded' });
            const nav = page.locator('.bottom-nav-container');
            await expect(nav).toBeVisible({ timeout: 20_000 });
            await expect(nav.locator('.nav-item')).toHaveCount(STUDENT_BOTTOM_NAV_TABS.length);
            await settle(page);
            const item = nav.locator('.nav-item').filter({ hasText: tab.label });
            await expect(item).toHaveCount(1);
            await item.click();
            await expect(item).toHaveClass(/\bactive\b/);
            await assertScreen(page, problems, log, testInfo);
        });
    }

    defineScreen('학생 홈(넓은 화면)', async ({ page }, testInfo) => {
        const problems = watchProblems(page);
        const log = await installFakeSupabase(page, 'student');
        await page.setViewportSize({ width: 1440, height: 900 });
        await page.goto('/', { waitUntil: 'domcontentloaded' });
        await expect(page.getByText('가상 학생').first()).toBeVisible({ timeout: 20_000 });
        await assertScreen(page, problems, log, testInfo);
    });
});

/* ── 관리자 ───────────────────────────────────────────────────────────────── */

const openAdmin = async (page) => {
    await openTeacher(page, 'admin');
    await page.locator('button[aria-label$="계정 메뉴"]').click();
    await page.getByRole('menuitem', { name: /관리자/ }).click();
    await page.getByPlaceholder('관리자 비밀번호 입력').fill('fake-password');
    await page.getByRole('button', { name: '관리자 모드 열기' }).click();
    await expect(page.getByRole('navigation', { name: '교사 업무 메뉴' })).toHaveCount(0, { timeout: 15_000 });
};

test.describe('관리자', () => {
    test('관리자 탭 목록을 원본에서 읽었다', () => {
        expect(ADMIN_TAB_GROUPS.flatMap((group) => group.tabs).length).toBeGreaterThan(5);
    });

    for (const group of ADMIN_TAB_GROUPS) {
        for (const tab of group.tabs) {
            defineScreen(`관리자 ${group.label} › ${tab.label}`, async ({ page }, testInfo) => {
                const problems = watchProblems(page);
                const log = await installFakeSupabase(page, 'admin');
                await openAdmin(page);
                // 배지가 있는 탭은 앞줄(지금 할 일)로 옮겨 가므로 이름으로 찾는다.
                const button = page.getByRole('button', { name: new RegExp(`^${escapeRegExp(tab.label)}(\\s*\\d+)?$`) });
                await expect(button.first()).toBeVisible();
                await button.first().click();
                await expect(button.first()).toHaveAttribute('aria-current', 'page');
                await assertScreen(page, problems, log, testInfo);
            });
        }
    }
});

// @ts-check
/*
 * 홍보물용 앱 화면 캡처 — e2e/app-render-smoke.spec.cjs 와 같은 방식으로 가짜 Supabase 를 붙여
 * 로그인 뒤 보이는 실제 교사·학생 화면을 띄우고, 홍보 팜플렛에 넣을 스크린샷을 output/promo/shots 에 저장한다.
 *
 * 실행:
 *   1) 가짜 주소로 dev 서버를 먼저 띄운다:
 *      VITE_SUPABASE_URL=http://fake-supabase.test VITE_SUPABASE_ANON_KEY=dummy VITE_GOOGLE_CLIENT_ID=dummy npm run dev
 *   2) node scripts/capture-promo-shots.cjs
 */
const { chromium } = require('@playwright/test');
const { mkdirSync } = require('node:fs');
const path = require('node:path');
const {
    SUPABASE_URL, ROLE_FIXTURES, buildSession, readRpcReturnKinds, defaultForReturnKind, LEGACY_STORAGE_KEY
} = require('../e2e/fixtures/app-smoke-fixtures.cjs');

const OUT = path.join(__dirname, '..', 'output', 'promo', 'shots');
mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:5173';
const RPC_RETURN_KINDS = readRpcReturnKinds();

const ALLOWED_EXTERNAL = [
    /^https:\/\/fonts\.(googleapis|gstatic)\.com\//,
    /^https:\/\/xn--9y2br3k43n\.kr\//,
    /^https:\/\/accounts\.google\.com\/gsi\/client/
];

const json = (route, status, body, headers = {}) => route.fulfill({
    status,
    headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*', ...headers },
    body: body === undefined ? '' : JSON.stringify(body)
});

const installFakeSupabase = async (page, roleKey) => {
    const fixture = ROLE_FIXTURES[roleKey];
    const session = buildSession(fixture.user);
    await page.addInitScript(([key, value]) => {
        if (window !== window.top) return;
        if (!document.cookie.includes('sb-agit-auth-token')) window.localStorage.setItem(key, value);
    }, [LEGACY_STORAGE_KEY, JSON.stringify(session)]);
    await page.routeWebSocket(/fake-supabase\.test/, () => {});
    await page.route(/^(?!http:\/\/localhost:5173\/)/, async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!request.url().startsWith(SUPABASE_URL)) {
            if (ALLOWED_EXTERNAL.some((p) => p.test(request.url()))) return route.abort();
            if (/^(data|blob):/.test(request.url())) return route.continue();
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
            return json(route, 200, {});
        }
        if (pathname.startsWith('/rest/v1/rpc/')) {
            const name = pathname.slice('/rest/v1/rpc/'.length);
            const own = fixture.rpc?.[name];
            const value = typeof own === 'function' ? own(request.postDataJSON?.()) : own;
            if (value !== undefined) return json(route, 200, value);
            const fallback = defaultForReturnKind(RPC_RETURN_KINDS.get(name));
            return json(route, fallback.status, fallback.body);
        }
        if (pathname.startsWith('/rest/v1/')) {
            const accept = request.headers()['accept'] || '';
            const prefer = request.headers()['prefer'] || '';
            const method = request.method();
            const countHeaders = { 'content-range': '*/0' };
            if (method === 'HEAD') return route.fulfill({ status: 200, headers: { ...countHeaders, 'access-control-allow-origin': '*' } });
            if (accept.includes('application/vnd.pgrst.object+json')) {
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
            if (own !== undefined) return json(route, 200, own);
            return json(route, 200, {});
        }
        if (pathname.startsWith('/storage/v1/')) {
            if (pathname.includes('/object/list/')) return json(route, 200, []);
            return json(route, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
        }
        return json(route, 404, {});
    });
};

const settle = async (page) => {
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(900);
};

const shoot = async (page, name) => {
    await settle(page);
    await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    console.log('saved', name);
};

const escapeRegExp = (v) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const run = async () => {
    const browser = await chromium.launch();

    // ── 교사 화면 ──────────────────────────────────────────────
    const teacherCtx = await browser.newContext({ viewport: { width: 1440, height: 960 }, deviceScaleFactor: 2 });
    const tPage = await teacherCtx.newPage();
    await installFakeSupabase(tPage, 'teacher');
    await tPage.goto(BASE, { waitUntil: 'domcontentloaded' });
    await tPage.getByRole('navigation', { name: '교사 업무 메뉴' }).waitFor({ timeout: 20000 });
    await shoot(tPage, 'teacher-01-dashboard');

    // 학급운영도구 → 우리 반 스크린
    const clickGroup = async (label) => {
        const btn = tPage.getByRole('navigation', { name: '교사 업무 메뉴' })
            .locator('button.teacher-dashboard__nav-item')
            .filter({ hasText: new RegExp(`${escapeRegExp(label)}\\s*\\d*$`) });
        await btn.first().click();
        await tPage.waitForTimeout(400);
    };
    try {
        await clickGroup('학급운영도구');
        const menu = tPage.locator('[aria-label="학급운영도구 목록"]');
        await menu.waitFor({ timeout: 8000 });
        await menu.getByRole('button').filter({ hasText: '우리 반 스크린' }).first().click();
        await shoot(tPage, 'teacher-02-classboard');
    } catch (e) { console.log('classboard skip', e.message); }

    try {
        await clickGroup('학급운영도구');
        const menu = tPage.locator('[aria-label="학급운영도구 목록"]');
        await menu.waitFor({ timeout: 8000 });
        await menu.getByRole('button').filter({ hasText: '자리·역할 배치' }).first().click();
        await shoot(tPage, 'teacher-03-arrangement');
    } catch (e) { console.log('arrangement skip', e.message); }

    try {
        await clickGroup('우리반 아지트');
        await shoot(tPage, 'teacher-04-classagit');
    } catch (e) { console.log('classagit skip', e.message); }

    await teacherCtx.close();

    // ── 학생 화면(모바일) ─────────────────────────────────────
    const studentCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true });
    const sPage = await studentCtx.newPage();
    await installFakeSupabase(sPage, 'student');
    await sPage.goto(BASE, { waitUntil: 'domcontentloaded' });
    await sPage.locator('.bottom-nav-container').waitFor({ timeout: 20000 });
    await shoot(sPage, 'student-01-home');

    const tapTab = async (label, name) => {
        try {
            const nav = sPage.locator('.bottom-nav-container');
            const item = nav.locator('.nav-item').filter({ hasText: label });
            await item.first().click();
            await shoot(sPage, name);
        } catch (e) { console.log(name, 'skip', e.message); }
    };
    await tapTab('과제', 'student-02-missions');
    await tapTab('나의 아지트', 'student-03-myagit');
    await tapTab('아지트 놀이터', 'student-04-playground');
    await tapTab('친구 아지트', 'student-05-friends');

    await studentCtx.close();
    await browser.close();
    console.log('done');
};

run().catch((e) => { console.error(e); process.exit(1); });

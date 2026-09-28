// @ts-check
/*
 * 화면 렌더 스모크 — DB 없이 도는 개발 전용 미리보기를 전부 열어 본다(2026-09-28).
 *
 * 왜: tests/*.test.mjs 는 대부분 소스를 글자로 대조한다. 그래서 "빌드·검사는 통과했는데 화면이 하얗다"
 * (임포트 누락·선언 전 사용)는 원리상 못 잡는다. 여기서는 실제 브라우저로 그려 보고
 * ① 잡히지 않은 예외 ② React·오류 방어막의 console.error ③ 빈 화면을 실패로 본다.
 *
 * 미리보기 목록은 src/dev/devLabRegistry.js 에서 읽는다 — 새 미리보기를 등록하면 저절로 검사된다.
 * 실행: npx playwright test e2e/render-smoke.spec.cjs   (개발 서버는 playwright.config.cjs 가 띄운다)
 */
const { test, expect } = require('@playwright/test');
const { readFileSync } = require('node:fs');
const path = require('node:path');

const registry = readFileSync(path.join(__dirname, '..', 'src', 'dev', 'devLabRegistry.js'), 'utf8');
const devLabIds = [...registry.matchAll(/^\s*id:\s*'([^']+)'/gm)].map((match) => match[1]);

const PAGES = [
    ...devLabIds.map((id) => ({ name: `dev-lab:${id}`, url: `/?dev-lab=${id}` })),
    { name: 'ui-preview', url: '/?ui-preview=1' },
    { name: 'arrangement-preview', url: '/?arrangement-preview=1' },
    { name: 'class-board-preview', url: '/?class-board-preview=1' },
];

// 화면 잘못이 아니라 바깥 사정인 것만 거른다. 거르는 이유를 한 줄씩 적는다.
const IGNORED_CONSOLE = [
    /Failed to load resource/i, // 글꼴·이미지 같은 바깥 요청 실패. 네트워크 탓이지 그리기 오류가 아니다
    /Download the React DevTools/i,
];

test('미리보기 목록을 레지스트리에서 읽었다', () => {
    expect(devLabIds.length).toBeGreaterThan(10);
});

for (const pageDef of PAGES) {
    test(`화면이 오류 없이 그려진다 — ${pageDef.name}`, async ({ page }) => {
        const problems = [];
        page.on('pageerror', (error) => problems.push(`예외: ${error.message}`));
        page.on('console', (message) => {
            if (message.type() !== 'error') return;
            const text = message.text();
            if (IGNORED_CONSOLE.some((pattern) => pattern.test(text))) return;
            problems.push(`console.error: ${text.slice(0, 300)}`);
        });

        await page.goto(pageDef.url, { waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(500); // 지연 로딩 조각이 그려질 틈

        const text = (await page.locator('#root').innerText()).trim();
        expect.soft(text.length, '화면에 글자가 하나도 없다(흰 화면)').toBeGreaterThan(0);
        expect(problems, problems.join('\n')).toEqual([]);
    });
}

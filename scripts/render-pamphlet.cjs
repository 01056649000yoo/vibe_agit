// @ts-check
/* 홍보 팜플렛 HTML → 세로 긴 PNG. 실행: node scripts/render-pamphlet.cjs */
const { chromium } = require('@playwright/test');
const path = require('node:path');

const run = async () => {
    const file = 'file://' + path.join(__dirname, '..', 'output', 'promo', 'pamphlet.html');
    const browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 2 });
    await page.goto(file, { waitUntil: 'networkidle' });
    // 웹폰트 로딩 대기
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(600);
    const out = path.join(__dirname, '..', 'output', 'promo', 'pamphlet.png');
    await page.locator('.page').screenshot({ path: out });
    const box = await page.locator('.page').boundingBox();
    console.log('saved', out, box && `${Math.round(box.width)}x${Math.round(box.height)}`);
    await browser.close();
};
run().catch((e) => { console.error(e); process.exit(1); });

/**
 * 칭호 배지 최적화 — 512px PNG → 256px WebP.
 *
 * 배지 원본은 512×512 PNG(139~419KB)였는데 화면에서는 40~76px로만 쓴다.
 * 그래서 칭호 설명을 한 번 열면 작가 10장 약 3.3MB를 내려받았다. 학교 와이파이에서 체감된다.
 *
 * 새 의존성을 넣지 않으려고, 이미 깔려 있는 Playwright(Chromium)의 WebP 인코더를 쓴다.
 * 256px = 화면 최대 76px × DPR 3(모바일 고해상도)에 맞춘 값이다.
 *
 * 새 레벨 배지를 추가했을 때만 돌리면 된다:
 *   npm run badges:optimize
 *
 * PNG 원본은 저장소에 두지 않는다(변환 결과만 커밋). 원본이 필요하면 이 스크립트를
 * 돌리기 전 상태를 git 이력에서 꺼낸다 — 배지 도입 커밋 e5d87ce, dd2a5d0.
 */
import { chromium } from '@playwright/test';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DIR = path.resolve('public/assets/title-badges');
const SIZE = 256;
const QUALITY = 0.86;

const files = (await readdir(DIR)).filter((f) => f.endsWith('.png'));
if (files.length === 0) {
    console.log('변환할 PNG가 없다. 이미 WebP로 바뀐 상태다.');
    process.exit(0);
}

// Playwright 번들 브라우저는 `npx playwright install` 을 해야 생긴다.
// 그것 없이도 돌게 윈도우에 이미 있는 Edge·Chrome 을 먼저 쓴다 (둘 다 같은 Chromium 인코더).
const launchBrowser = async () => {
    for (const channel of ['msedge', 'chrome', undefined]) {
        try {
            return await chromium.launch(channel ? { channel } : {});
        } catch {
            // 다음 후보로
        }
    }
    throw new Error('Chromium 계열 브라우저를 찾지 못했다. `npx playwright install chromium` 후 다시 시도한다.');
};

const browser = await launchBrowser();
const page = await browser.newPage();

let before = 0;
let after = 0;

for (const file of files) {
    const buf = await readFile(path.join(DIR, file));
    before += buf.length;

    const encoded = await page.evaluate(async ({ b64, size, quality }) => {
        const img = new Image();
        img.src = `data:image/png;base64,${b64}`;
        await img.decode();

        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, size, size);

        const url = canvas.toDataURL('image/webp', quality);
        if (!url.startsWith('data:image/webp')) throw new Error('WebP 인코딩 실패');
        return url.split(',')[1];
    }, { b64: buf.toString('base64'), size: SIZE, quality: QUALITY });

    const bytes = Buffer.from(encoded, 'base64');
    const out = file.replace(/\.png$/, '.webp');
    await writeFile(path.join(DIR, out), bytes);
    after += bytes.length;
    console.log(`${file} → ${out}  ${(buf.length / 1024).toFixed(0)}KB → ${(bytes.length / 1024).toFixed(0)}KB`);
}

console.log(`\n합계 ${(before / 1024 / 1024).toFixed(2)}MB → ${(after / 1024).toFixed(0)}KB`);
console.log('PNG 원본은 git rm 으로 지운다.');
await browser.close();

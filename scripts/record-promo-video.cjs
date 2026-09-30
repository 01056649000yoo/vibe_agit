// @ts-check
/*
 * 홍보 영상 녹화 — video-scene.html 의 CSS 애니메이션을 Playwright 로 재생하며 녹화(webm) → mp4 변환.
 * 실행: node scripts/record-promo-video.cjs
 */
const { chromium } = require('@playwright/test');
const { execFileSync } = require('node:child_process');
const { readdirSync, renameSync, existsSync, mkdirSync } = require('node:fs');
const path = require('node:path');

const PROMO = path.join(__dirname, '..', 'output', 'promo');
const VID_DIR = path.join(PROMO, 'video-raw');
mkdirSync(VID_DIR, { recursive: true });

// 인자: --scene <html파일명> --size <WxH> --name <출력이름(확장자 없이)>
const arg = (flag, def) => {
    const i = process.argv.indexOf(flag);
    return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const SCENE = arg('--scene', 'video-scene.html');
const [W, H] = arg('--size', '1080x1920').split('x').map(Number);
const NAME = arg('--name', 'promo');

const findFfmpeg = () => {
    const base = path.join(process.env.HOME, 'Library', 'Caches', 'ms-playwright');
    const dir = readdirSync(base).find((d) => d.startsWith('ffmpeg-'));
    return path.join(base, dir, 'ffmpeg-mac');
};

const run = async () => {
    const file = 'file://' + path.join(PROMO, SCENE);
    const browser = await chromium.launch();
    const context = await browser.newContext({
        viewport: { width: W, height: H },
        recordVideo: { dir: VID_DIR, size: { width: W, height: H } }
    });
    const page = await context.newPage();
    await page.goto(file, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);

    const total = await page.evaluate(() => (window.__timeline || []).reduce((a, b) => a + b, 0));
    await page.evaluate(() => window.__start());
    // 애니메이션 총 길이 + 여유
    await page.waitForTimeout(total + 800);

    await page.close();
    await context.close(); // webm 파일 확정
    await browser.close();

    // 녹화된 webm 찾기
    const webm = readdirSync(VID_DIR).filter((f) => f.endsWith('.webm')).map((f) => path.join(VID_DIR, f))
        .sort((a, b) => a.localeCompare(b)).pop();
    if (!webm) throw new Error('webm 녹화 파일을 찾지 못했다');
    const stableWebm = path.join(PROMO, `${NAME}.webm`);
    renameSync(webm, stableWebm);

    // mp4 변환(H.264, 짝수 해상도, yuv420p — 어디서나 재생). 시스템 ffmpeg(libx264) 우선.
    const systemFfmpeg = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg'].find((p) => existsSync(p));
    const ffmpeg = systemFfmpeg || findFfmpeg();
    const mp4 = path.join(PROMO, `${NAME}.mp4`);
    execFileSync(ffmpeg, [
        '-y', '-i', stableWebm,
        '-movflags', '+faststart',
        '-pix_fmt', 'yuv420p',
        '-vf', `scale=${W}:${H}:force_original_aspect_ratio=decrease,pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,fps=30`,
        '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
        mp4
    ], { stdio: 'inherit' });

    console.log('done', mp4, `${W}x${H}`, 'total(ms)=', total);
};
run().catch((e) => { console.error(e); process.exit(1); });

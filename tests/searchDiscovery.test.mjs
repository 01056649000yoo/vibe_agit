/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const canonicalOrigin = 'https://xn--vz0ba242ncqcba79xhwx.site';

test('검색 대표 주소와 공개 메타데이터는 www 없는 운영 도메인 하나를 가리킨다', async () => {
  const [index, identity, store] = await Promise.all([
    read('index.html'),
    read('src/constants/serviceIdentity.js'),
    read('src/store/useAppStore.js'),
  ]);

  assert.match(index, new RegExp(`<link rel="canonical" href="${canonicalOrigin}/"`));
  assert.match(index, new RegExp(`<meta property="og:url" content="${canonicalOrigin}/"`));
  assert.match(index, new RegExp(`<meta property="og:image" content="${canonicalOrigin}/assets/og-image\\.webp\\?v=3"`));
  assert.doesNotMatch(index, /www\.xn--vz0ba242ncqcba79xhwx\.site/);
  assert.match(index, /<meta name="robots" content="index,follow"/);
  assert.match(index, /<title>끄적끄적 아지트 - 초등 학급 글쓰기 플랫폼<\/title>/);
  assert.match(identity, /SERVICE_PAGE_TITLE = '끄적끄적 아지트 - 초등 학급 글쓰기 플랫폼'/);
  assert.match(store, /document\.title = SERVICE_PAGE_TITLE/);
});

test('robots와 sitemap은 같은 대표 주소의 공개 메인만 수집 대상으로 선언한다', async () => {
  const [robots, sitemap] = await Promise.all([
    read('public/robots.txt'),
    read('public/sitemap.xml'),
  ]);

  assert.match(robots, /User-agent: \*\s+Allow: \//);
  assert.match(robots, /Disallow: \/admin/);
  assert.match(robots, /Disallow: \/api/);
  assert.match(robots, new RegExp(`Sitemap: ${canonicalOrigin}/sitemap\\.xml`));
  assert.match(sitemap, /<urlset xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9">/);
  assert.match(sitemap, new RegExp(`<loc>${canonicalOrigin}/</loc>`));
  assert.equal([...sitemap.matchAll(/<loc>/g)].length, 1);
  assert.doesNotMatch(sitemap, /\/admin|\/api|\/privacy|\/terms/);
});

test('자바스크립트 전에도 첫 화면의 서비스 설명과 공개 안내를 읽을 수 있다', async () => {
  const [index, identity, styles] = await Promise.all([
    read('index.html'),
    read('src/constants/serviceIdentity.js'),
    read('public/search-intro.css'),
  ]);
  const identityLine = identity.match(/SERVICE_IDENTITY_LINE = '([^']+)'/)?.[1];

  assert.ok(identityLine);
  assert.match(index, /<main class="search-intro"/);
  assert.ok(index.includes(identityLine));
  assert.match(index, /선생님 과제와 피드백으로 글쓰기 배우기/);
  assert.match(index, /href="\/learning-support-software"/);
  assert.doesNotMatch(index, /style="display:none;"/);
  assert.match(styles, /\.search-intro\s*\{/);
});

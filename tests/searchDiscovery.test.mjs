/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');
const readBinary = (relativePath) => readFile(path.join(root, relativePath));
const canonicalOrigin = 'https://xn--vz0ba242ncqcba79xhwx.site';
const pageTitle = '끄적끄적 아지트 | 초등 학급 글쓰기 지도 플랫폼';
const socialDescription = '선생님이 과제와 피드백으로 글쓰기를 지도하고, 학생은 과제·독서록·일기를 쓰며 친구들과 나눠요. 꾸준히 쓸수록 나만의 수호룡과 아지트도 함께 자라요.';
const socialImagePath = '/assets/landing-hero-reference.jpg?v=4';

const readJpegSize = (image) => {
  assert.equal(image.readUInt16BE(0), 0xffd8, '공유 이미지는 JPEG여야 한다');

  let offset = 2;
  while (offset + 8 < image.length) {
    if (image.readUInt8(offset) !== 0xff) {
      offset += 1;
      continue;
    }

    const marker = image.readUInt8(offset + 1);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return {
        height: image.readUInt16BE(offset + 5),
        width: image.readUInt16BE(offset + 7),
      };
    }

    offset += 2 + image.readUInt16BE(offset + 2);
  }

  assert.fail('공유 JPEG에서 크기 정보를 찾지 못했다');
};

test('검색·소셜 공유 메타데이터는 현재 서비스 문구와 메인 이미지를 함께 사용한다', async () => {
  const [index, identity, store, socialImage] = await Promise.all([
    read('index.html'),
    read('src/constants/serviceIdentity.js'),
    read('src/store/useAppStore.js'),
    readBinary('public/assets/landing-hero-reference.jpg'),
  ]);

  assert.match(index, new RegExp(`<link rel="canonical" href="${canonicalOrigin}/"`));
  assert.match(index, new RegExp(`<meta property="og:url" content="${canonicalOrigin}/"`));
  assert.ok(index.includes(`<meta property="og:image" content="${canonicalOrigin}${socialImagePath}"`));
  assert.ok(index.includes(`<meta name="twitter:image" content="${canonicalOrigin}${socialImagePath}"`));
  assert.doesNotMatch(index, /www\.xn--vz0ba242ncqcba79xhwx\.site/);
  assert.match(index, /<meta name="robots" content="index,follow"/);
  assert.ok(index.includes(`<title>${pageTitle}</title>`));
  assert.ok(identity.includes(`SERVICE_PAGE_TITLE = '${pageTitle}'`));
  assert.match(store, /document\.title = SERVICE_PAGE_TITLE/);
  assert.ok(index.includes(`<meta property="og:title" content="${pageTitle}"`));
  assert.ok(index.includes(`<meta name="twitter:title" content="${pageTitle}"`));
  assert.ok(index.includes(`<meta property="og:description" content="${socialDescription}"`));
  assert.ok(index.includes(`<meta name="twitter:description" content="${socialDescription}"`));
  assert.match(index, /<meta property="og:locale" content="ko_KR"/);
  assert.match(index, /<meta property="og:image:type" content="image\/jpeg"/);
  assert.match(index, /<meta property="og:image:width" content="1723"/);
  assert.match(index, /<meta property="og:image:height" content="913"/);
  assert.match(index, /<meta property="og:image:alt" content="책상에서 글을 쓰는 초록 수호룡과 끄적끄적 아지트 소개"/);
  assert.match(index, /<meta name="twitter:image:alt" content="책상에서 글을 쓰는 초록 수호룡과 끄적끄적 아지트 소개"/);
  assert.deepEqual(readJpegSize(socialImage), { width: 1723, height: 913 });
  assert.doesNotMatch(index, /assets\/og-image\.webp|우리 반 글쓰기 통합 플랫폼/);
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

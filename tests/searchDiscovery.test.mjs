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

/*
 * 2026-09-11: "주소를 넣으면 다른 페이지가 떴다가 로그인창으로 튕긴다"는 제보.
 * 튕긴 게 아니라 이 정적 덩어리가 첫 화면과 **다르게 생겨서** 다른 페이지로 보인 것이었다.
 * (전에는 글꼴 CSS 가 그리기를 막아 흰 화면 뒤에 가려져 있었다. 그걸 걷어내니 드러났다.)
 *
 * 정적 덩어리는 번들 밖 파일이라 LandingPage.css 를 가져다 쓸 수 없다. 값이 두 곳에 있으므로
 * **두 곳을 한꺼번에 보는 검사**를 여기 둔다 — 한쪽만 고치면 여기서 걸린다.
 */
test('자바스크립트 전 첫 화면은 진짜 첫 화면과 같은 모양이라 교체가 튀지 않는다', async () => {
  const [index, styles, landingMarkup, landingStyles, identity] = await Promise.all([
    read('index.html'),
    read('public/search-intro.css'),
    read('src/components/layout/LandingPage.jsx'),
    read('src/components/layout/LandingPage.css'),
    read('src/constants/serviceIdentity.js'),
  ]);

  const tidy = (value) => value.replace(/\s+/g, ' ').trim();
  // 규칙 한 덩이에서 속성 하나를 꺼낸다. 두 파일에서 같은 방법으로 꺼내야 견줄 수 있다.
  // 찾을 이름·속성은 이 검사 안에서 우리가 적은 값뿐이라 바깥 입력이 섞이지 않는다.
  const pick = (css, selector, property) => {
    // `landing-card` 처럼 클래스 하나도, `landing-promise h1` 처럼 자손도 받는다.
    const escaped = selector.replace(/ /g, '\\s+').replace(/-/g, '\\-');
    // eslint-disable-next-line security/detect-non-literal-regexp
    const block = css.match(new RegExp('\\.' + escaped + '\\s*\\{([^}]*)\\}'));
    if (!block) return null;
    // 주석을 먼저 걷어낸다. 규칙 사이에 설명이 끼면 바로 앞 `;` 을 못 찾아 값을 놓친다.
    const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
    // eslint-disable-next-line security/detect-non-literal-regexp
    const found = body.match(new RegExp('(?:^|;)\\s*' + property + '\\s*:\\s*([^;]+)'));
    return found ? tidy(found[1]) : null;
  };

  // [1] 큰 제목이 같은 말이어야 한다. 글이 다르면 교체 순간 문장이 바뀌어 보인다.
  const landingHeading = landingMarkup.match(/<h1 id="landing-promise-title">([\s\S]*?)<\/h1>/);
  const introHeading = index.match(/<h1 id="search-intro-title">([\s\S]*?)<\/h1>/);
  assert.ok(landingHeading, '첫 화면의 큰 제목을 찾지 못했습니다');
  assert.ok(introHeading, '정적 덩어리의 큰 제목을 찾지 못했습니다');
  assert.equal(tidy(introHeading[1]), tidy(landingHeading[1]), '정적 덩어리와 첫 화면의 큰 제목이 다릅니다');

  // [1-b] 전역 CSS 의 h1 은 그라데이션 글자라 그냥 두면 파랗게 뜬다. 진짜 화면처럼 꺼야 한다.
  //       (번들 CSS 는 자바스크립트 없이도 적용되므로 이 덩어리에도 걸린다.)
  for (const property of ['background', '-webkit-text-fill-color']) {
    const expected = pick(landingStyles, 'landing-promise h1', property);
    assert.ok(expected, `첫 화면 제목의 ${property} 를 찾지 못했습니다`);
    assert.equal(pick(styles, 'search-intro h1', property), expected, `정적 제목의 ${property} 가 다릅니다`);
  }

  // [2] 이 앱이 무엇인지 말하는 한 줄은 같은 원본을 쓴다.
  const identityLine = identity.match(/SERVICE_IDENTITY_LINE = '([^']+)'/)?.[1];
  assert.ok(identityLine);
  assert.ok(index.includes(identityLine), '정적 덩어리가 정체성 문구를 빠뜨렸습니다');
  assert.match(landingMarkup, /SERVICE_IDENTITY_LINE/);

  // [3] 같은 그림을 같은 비율로 미리 그려 둔다. 비율이 다르면 교체할 때 아래가 출렁인다.
  assert.match(index, /\/assets\/landing-hero-reference\.jpg/);
  const landingRatio = pick(landingStyles, 'landing-hero', 'aspect-ratio');
  assert.ok(landingRatio, '첫 화면 그림 비율을 찾지 못했습니다');
  assert.equal(pick(styles, 'search-intro__hero', 'aspect-ratio'), landingRatio, '그림 비율이 다릅니다');

  // [4] 상자 너비·모서리·바탕도 같아야 한 자리에 겹쳐 보인다.
  for (const property of ['width', 'border-radius', 'background']) {
    const expected = pick(landingStyles, 'landing-card', property);
    assert.ok(expected, `첫 화면 상자의 ${property} 를 찾지 못했습니다`);
    assert.equal(pick(styles, 'search-intro__card', property), expected, `상자의 ${property} 가 다릅니다`);
  }

  // [5] 들어가기 카드 자리를 미리 잡아 둔다. 비워 두면 진짜 버튼이 나타날 때 아래가 밀린다.
  assert.match(index, /class="search-intro__entry-grid" aria-hidden="true"/);
  const entryHeight = pick(landingStyles, 'entry-card', 'min-height');
  assert.ok(entryHeight, '진짜 들어가기 버튼의 높이를 찾지 못했습니다');
  assert.equal(pick(styles, 'search-intro__entry-card', 'min-height'), entryHeight, '자리맡이 높이가 다릅니다');
  // 로그인 오류 문구가 차지하던 자리도 남겨 둔다. 없으면 아래 칸이 통째로 위로 당겨진다.
  assert.match(index, /class="search-intro__entry-spacer"/);
  assert.equal(
    pick(styles, 'search-intro__entry-spacer', 'min-height'),
    pick(landingStyles, 'landing-login-error', 'min-height'),
    '오류 문구 자리의 높이가 다릅니다'
  );
  // 아직 누를 수 없다. 진짜 버튼처럼 만들면 눌러도 아무 일이 없어 고장으로 보인다.
  assert.doesNotMatch(index.slice(index.indexOf('search-intro')), /<button/);

  // [6] 정적 규칙이 진짜 화면까지 건드리면 안 된다 — 모두 .search-intro 아래로 좁혀 둔다.
  const leaked = (styles.match(/^[^@\s/}][^{]*\{/gm) || [])
    .map((line) => line.replace('{', '').trim())
    .filter((selector) => !selector.startsWith('.search-intro'));
  assert.deepEqual(leaked, [], '정적 CSS 가 .search-intro 밖으로 새어 나갑니다');
});

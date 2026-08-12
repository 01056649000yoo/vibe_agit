/* eslint-disable security/detect-non-literal-fs-filename */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('첫 로그인 화면은 핵심 문장과 두 로그인, 세 가지 아지트 경험으로 압축된다', async () => {
  const landing = await read('src/components/layout/LandingPage.jsx');

  assert.match(landing, /쓰고, 읽고, 키우며[\s\S]*함께 자라는 우리 반 아지트/);
  assert.match(landing, /학생으로 들어가기/);
  assert.match(landing, /선생님으로 들어가기/);
  assert.match(landing, /landingExperiences\.map/);
  assert.doesNotMatch(landing, /landing-brand-row|landing-brand-mark|글쓰기로 생각이 자라는 우리 반 공간/);
  assert.doesNotMatch(landing, /capability-grid|생각을 글로 써요|글쓰기를 지도해요|함께 고치며 자라요|재미있게 이어가요/);
});

test('첫 화면은 높이를 줄이고 세 경험을 스크롤 없는 3분할 선택 바로 보여준다', async () => {
  const [landing, styles, modal] = await Promise.all([
    read('src/components/layout/LandingPage.jsx'),
    read('src/components/layout/LandingPage.css'),
    read('src/components/layout/LandingFeatureModal.jsx'),
  ]);

  assert.match(styles, /\.landing-hero\s*\{[\s\S]*aspect-ratio: 1723 \/ 600/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.landing-hero\s*\{[\s\S]*aspect-ratio: 1723 \/ 560/);
  assert.match(styles, /\.entry-card\s*\{[\s\S]*min-height: 78px/);
  assert.match(styles, /\.landing-experience-grid\s*\{[\s\S]*grid-template-columns: repeat\(3,[\s\S]*gap: 0[\s\S]*overflow: hidden/);
  assert.match(styles, /\.landing-experiences-heading h2\s*\{[\s\S]*font-size: 1\.02rem/);
  assert.match(styles, /\.landing-experiences-heading span\s*\{[\s\S]*font-size: 0\.82rem/);
  assert.match(styles, /\.landing-experience-button\s*\{[\s\S]*min-height: 78px[\s\S]*border-right:/);
  assert.match(styles, /\.landing-experience-icon\s*\{[\s\S]*width: 42px[\s\S]*font-size: 1\.2rem/);
  assert.match(styles, /\.landing-experience-copy strong\s*\{[\s\S]*font-size: 0\.96rem/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.landing-experience-button\s*\{[\s\S]*min-height: 72px/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.landing-experiences-heading\s*\{[\s\S]*flex-direction: column/);
  assert.match(landing, /landing-experience-copy[\s\S]*experience\.shortLead[\s\S]*experience\.shortNoun/);
  assert.match(modal, /shortLead: '쓰고 다듬는'[\s\S]*shortNoun: '글'/);
  assert.doesNotMatch(landing, />＋</);
});

test('세 가지 키워드는 아지트 정체성과 상세 경험을 담은 하나의 모달로 연결된다', async () => {
  const modal = await read('src/components/layout/LandingFeatureModal.jsx');
  const experienceIds = [...modal.matchAll(/id: '(writing|reading|dragon)'/g)].map((match) => match[1]);
  const detailTitles = [...modal.matchAll(/\{ title: '([^']+)', description:/g)].map((match) => match[1]);

  assert.deepEqual(experienceIds, ['writing', 'reading', 'dragon']);
  assert.match(modal, /쓰고 다듬는 글/);
  assert.match(modal, /읽고 채우는 책장/);
  assert.match(modal, /활동으로 키우는 수호룡/);
  assert.equal(detailTitles.length, 9);
  assert.match(modal, /role="tablist"/);
  assert.match(modal, /role="dialog"[\s\S]*aria-modal="true"/);
  assert.match(modal, /<ModalPortal>[\s\S]*<ModalCloseButton/);
});

test('기능 소개 모달은 키보드 닫기·초점 순환·배경 스크롤 잠금과 초점 복귀를 지원한다', async () => {
  const modal = await read('src/components/layout/LandingFeatureModal.jsx');

  assert.match(modal, /event\.key === 'Escape'[\s\S]*onClose\(\)/);
  assert.match(modal, /event\.key !== 'Tab'/);
  assert.match(modal, /document\.body\.style\.overflow = 'hidden'/);
  assert.match(modal, /previouslyFocused[\s\S]*previouslyFocused\.focus\(\)/);
  assert.match(modal, /dialogRef\.current\.querySelectorAll\(focusableSelector\)/);
});

test('첫 화면 하단에는 학습지원소프트웨어 선정기준 안내 링크만 간결하게 남긴다', async () => {
  const [landing, styles] = await Promise.all([
    read('src/components/layout/LandingPage.jsx'),
    read('src/components/layout/LandingPage.css'),
  ]);

  assert.match(landing, /href="\/learning-support-software">학습지원소프트웨어 선정기준 안내/);
  assert.doesNotMatch(landing, /href="\/privacy"|href="\/terms"/);
  assert.match(styles, /\.landing-support-footer nav\s*\{[\s\S]*display: flex[\s\S]*justify-content: center/);
  assert.match(styles, /\.landing-support-footer a\s*\{[\s\S]*font-size: 0\.82rem[\s\S]*letter-spacing: -0\.01em/);
});

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
  const identity = await read('src/constants/serviceIdentity.js');
  const modal = await read('src/components/layout/LandingFeatureModal.jsx');

  assert.match(landing, /쓰고, 읽고, 키우며[\s\S]*함께 자라는 우리 반 아지트/);
  assert.match(landing, /학생으로 들어가기/);
  assert.match(landing, /선생님으로 들어가기/);
  assert.match(landing, /아지트에서는 이렇게 활동해요/);
  // 이 앱이 무엇인지 말하는 문장은 **눈에 보이는 자리**에 있어야 한다.
  // 예전에는 히어로 이미지의 alt 안에만 있어 화면에 `글쓰기` 가 한 번도 나오지 않았다(2026-08-28).
  assert.match(landing, /<p className="landing-promise-identity">\{SERVICE_IDENTITY_LINE\}<\/p>/);
  assert.match(identity, /초등/);
  assert.match(identity, /글쓰기/);
  assert.match(identity, /선생님이 지도/);
  // `아지트` 는 서비스 이름이자 학생 공간 이름이다. 처음 온 사람에게 뜻을 알려 준다.
  assert.match(identity, /AGIT_MEANING = '아지트는[^']*글쓰기 공간/);
  // 소개 카드는 ROADMAP 제품 3대 기둥과 같은 갈래를 쓴다. 셋 다 `쓰기`·`자라기` 로 끝나
  // 누르지 않아도 무엇을 하는 곳인지 남는다.
  assert.match(modal, /shortNoun: '글쓰기 배우기'/);
  assert.match(modal, /shortNoun: '스스로 쓰기'/);
  assert.match(modal, /shortNoun: '자라고 꾸미기'/);
  assert.doesNotMatch(modal, /shortNoun: '다양하게 쓰기'|shortNoun: '읽고 나누기'|shortNoun: '키우고 꾸미기'/);
  assert.match(landing, /landingExperiences\.map/);
  assert.doesNotMatch(landing, /landing-brand-row|landing-brand-mark|글쓰기로 생각이 자라는 우리 반 공간/);
  assert.doesNotMatch(landing, /capability-grid|생각을 글로 써요|글쓰기를 지도해요|함께 고치며 자라요|재미있게 이어가요/);
});

test('학생 코드 로그인은 아지트 안의 방문 단계로 남아 모든 뒤로가기가 첫 화면으로 복귀한다', async () => {
  const [app, studentLogin] = await Promise.all([
    read('src/App.jsx'),
    read('src/components/student/StudentLogin.jsx'),
  ]);

  assert.match(app, /const STUDENT_LOGIN_HISTORY_PAGE = 'student-login'/);
  assert.match(app, /handleOpenStudentLogin[\s\S]*history\.pushState\(\{ publicPage: STUDENT_LOGIN_HISTORY_PAGE \}, '', '\/'\)[\s\S]*setIsStudentLoginMode\(true\)/);
  assert.match(app, /handleStudentLoginBack[\s\S]*history\.state\?\.publicPage === STUDENT_LOGIN_HISTORY_PAGE[\s\S]*history\.back\(\)/);
  assert.match(app, /handlePublicPop[\s\S]*addEventListener\('popstate', handlePublicPop\)[\s\S]*removeEventListener\('popstate', handlePublicPop\)/);
  assert.match(app, /<StudentLogin[\s\S]*onBack=\{handleStudentLoginBack\}/);
  assert.match(app, /<LandingPage onStudentLoginClick=\{handleOpenStudentLogin\}/);
  assert.match(studentLogin, /<Button[\s\S]*type="button"[\s\S]*onClick=\{onBack\}[\s\S]*뒤로 가기/);
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
  assert.match(styles, /\.landing-experience-copy strong\s*\{[\s\S]*font-size: 0\.96rem[\s\S]*white-space: nowrap/);
  assert.match(styles, /\.landing-experience-button--dragon \.landing-experience-copy strong\s*\{[\s\S]*font-size: 0\.88rem[\s\S]*letter-spacing: -0\.04em/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.landing-experience-button\s*\{[\s\S]*min-height: 72px/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.landing-experience-button--dragon \.landing-experience-copy strong\s*\{[\s\S]*font-size: clamp\(0\.67rem, 3vw, 0\.73rem\)/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.landing-experiences-heading\s*\{[\s\S]*flex-direction: column/);
  assert.match(landing, /landing-experience-copy[\s\S]*experience\.shortLead[\s\S]*experience\.shortNoun/);
  assert.match(modal, /shortLead: '선생님과 함께'[\s\S]*shortNoun: '글쓰기 배우기'/);
  assert.doesNotMatch(landing, />＋</);
});

test('세 가지 키워드는 아지트 정체성과 상세 경험을 담은 하나의 모달로 연결된다', async () => {
  const modal = await read('src/components/layout/LandingFeatureModal.jsx');
  const experienceIds = [...modal.matchAll(/id: '(writing|reading|dragon)'/g)].map((match) => match[1]);
  const detailTitles = [...modal.matchAll(/\{ title: '([^']+)', description:/g)].map((match) => match[1]);

  assert.deepEqual(experienceIds, ['writing', 'reading', 'dragon']);
  assert.match(modal, /선생님과 함께 글쓰기 배우기/);
  assert.match(modal, /독서록·일기까지 스스로 쓰기/);
  assert.match(modal, /쓴 만큼 자라고 꾸미기/);
  assert.match(modal, /선생님이 과제와 연구소 활동으로 글쓰기를 지도/);
  assert.match(modal, /자유 글·시·보고서까지/);
  assert.match(modal, /글 개요 짜기·질문 만들기·좋은 질문 고르기·한줄모아 활동/);
  assert.match(modal, /그 결과를 글쓰기에서 참고해 이어 써요/);
  assert.doesNotMatch(modal, /한자 활용 문장|한자활용 문장/);
  assert.match(modal, /개인·학급·모둠 목표/);
  assert.match(modal, /어휘의 탑과 퀘스트·게임/);
  assert.match(modal, /shortLead: '쓴 만큼'[\s\S]*shortNoun: '자라고 꾸미기'/);
  assert.doesNotMatch(modal, /활동으로 키우는 수호룡/);
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

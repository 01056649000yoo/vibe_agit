import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('첫 로그인 화면은 핵심 문장과 두 로그인, 펼쳐 보는 수업 한 바퀴로 압축된다', async () => {
  const landing = await read('src/components/layout/LandingPage.jsx');
  const identity = await read('src/constants/serviceIdentity.js');

  // 2026-10-05 선생님 요청("무슨 앱인지 확 드러나지 않는다"): 제목이 수업 흐름과 `초등 글쓰기 교실` 을 바로 말한다.
  assert.match(landing, /과제 내고, 쓰고, 고치며[\s\S]*함께 자라는 초등 글쓰기 교실/);
  // 로그인 아래로 내리면 과제 → 쓰기 → 고쳐 주기 → 자라기 네 단계가 실제 화면을 옮긴 그림과 함께 보인다.
  const flow = await read('src/components/layout/LandingClassFlow.jsx');
  // 수업 한 바퀴는 처음엔 접혀 있고, 안내 단추를 누르면 펼쳐진다(접혀도 문서에는 남는다).
  assert.match(landing, /const \[flowOpen, setFlowOpen\] = useState\(false\)/);
  assert.match(landing, /aria-expanded=\{flowOpen\}[\s\S]*aria-controls="landing-flow"/);
  assert.match(landing, /<LandingClassFlow open=\{flowOpen\} \/>/);
  assert.match(flow, /hidden=\{!open\}/);
  // 10-05 선생님 요청: 교사의 글쓰기 도움(글쓰기 연구소)·학생 개별 활동(독서록·일기)도 흐름에 넣어 여섯 단계.
  assert.deepEqual([...flow.matchAll(/id: '(mission|lab|write|feedback|self|grow)'/g)].map((m) => m[1]), ['mission', 'lab', 'write', 'feedback', 'self', 'grow']);
  assert.match(flow, /글쓰기 연구소/);
  assert.match(flow, /독서록·일기/);
  assert.match(flow, /id="landing-flow"/);
  assert.match(landing, /학생으로 들어가기/);
  assert.match(landing, /선생님으로 들어가기/);
  // 2026-10-05 선생님 결정: `아지트에서는 이렇게 활동해요` 카드 세 개와 설명 줄은 지웠다(수업 한 바퀴가 대신한다).
  assert.doesNotMatch(landing, /아지트에서는 이렇게 활동해요|landingExperiences|LandingFeatureModal/);
  // 이 앱이 무엇인지 말하는 문장은 **눈에 보이는 자리**에 있어야 한다.
  // 예전에는 히어로 이미지의 alt 안에만 있어 화면에 `글쓰기` 가 한 번도 나오지 않았다(2026-08-28).
  assert.match(landing, /<p className="landing-promise-identity">\{SERVICE_IDENTITY_LINE\}<\/p>/);
  assert.match(identity, /초등/);
  assert.match(identity, /글쓰기/);
  assert.match(identity, /선생님이 지도/);
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

test('첫 화면 그림 비율·로그인 단추 높이는 정적 첫 화면과 맞춘 값을 지킨다', async () => {
  const styles = await read('src/components/layout/LandingPage.css');
  assert.match(styles, /\.landing-hero\s*\{[\s\S]*aspect-ratio: 1723 \/ 600/);
  assert.match(styles, /@media \(max-width: 720px\)[\s\S]*\.landing-hero\s*\{[\s\S]*aspect-ratio: 1723 \/ 560/);
  assert.match(styles, /\.entry-card\s*\{[\s\S]*min-height: 78px/);
  assert.doesNotMatch(styles, /landing-experience|landing-feature-modal/, '지운 소개 카드·모달의 스타일이 남으면 안 됨');
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

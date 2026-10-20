// 글꽃 전시관 1~5단계를 실제 브라우저로 조작해 보는 시뮬레이션(2026-10-20).
// 먼저 `npx vite --port 5188 --host 127.0.0.1` 로 개발 서버를 띄운 뒤 `node scripts/dev-sim/exhibition-5steps-sample.cjs` 로 돌린다. DB 는 쓰지 않는다(개발 미리보기 샘플).
const { chromium } = require('@playwright/test');
const results = []; const ok = (name, cond, extra='') => { results.push([cond ? 'PASS' : 'FAIL', name, extra]); console.log(cond ? 'PASS' : 'FAIL', name, extra); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1400 } });
  const errors = []; p.on('pageerror', (e) => errors.push('pageerror ' + e.message)); p.on('console', (m) => { if (m.type()==='error' && !/401|Failed to load resource/.test(m.text())) errors.push('console ' + m.text()); });
  p.on('dialog', (d) => d.accept());
  await p.goto('http://127.0.0.1:5188/?dev-lab=class-agit'); await p.waitForTimeout(3500);
  const step = async (name) => { await p.getByRole('tab', { name: new RegExp(name) }).click(); await p.waitForTimeout(700); };
  const stepSel = async () => (await p.locator('[role=tab][aria-selected=true]').first().textContent()).trim();
  // STEP 1
  ok('1단계 제목 표시', await p.getByText('STEP 01').count() > 0);
  const title = p.getByLabel('전시 제목'); await title.fill('시뮬레이션 전시'); 
  const intro = p.getByLabel('전시 소개'); await intro.fill('5단계 테스트 소개글');
  ok('1단계 제목 입력 반영', (await title.inputValue()) === '시뮬레이션 전시');
  const themes = p.locator('input[name="전시관 디자인"]'); ok('1단계 디자인 선택지', await themes.count() >= 4, String(await themes.count()));
  if (await themes.count() >= 2) await themes.nth(1).check();
  // 다음 단계 버튼
  await p.getByRole('button', { name: /전시실 구성 →/ }).click(); await p.waitForTimeout(800);
  ok('2단계로 이동', (await stepSel()).includes('전시실 구성'));
  // STEP 2
  ok('2단계 STEP 02 표시', await p.getByText('STEP 02').count() > 0);
  const roomsBefore = await p.locator('.class-agit-room-nav button').count();
  await p.getByRole('button', { name: '+ 전시실' }).click(); await p.waitForTimeout(500);
  const roomsAfter = await p.locator('.class-agit-room-nav button').count();
  ok('전시실 추가', roomsAfter === roomsBefore + 1, `${roomsBefore}->${roomsAfter}`);
  await p.getByLabel('전시실 주제').fill('두 번째 방'); await p.getByLabel('전시실 소개').fill('소개');
  ok('전시실 이름 변경', (await p.getByLabel('전시실 주제').inputValue()) === '두 번째 방');
  await p.getByRole('button', { name: '전시실 앞으로' }).click(); await p.waitForTimeout(400);
  const names = await p.locator('.class-agit-room-nav button').allTextContents(); console.log('rooms:', names.join(' | '));
  ok('전시실 순서 이동 후 탭 유지', names.length === roomsAfter);
  await p.getByRole('button', { name: /작품 담기 →/ }).click(); await p.waitForTimeout(1200);
  ok('3단계로 이동', (await stepSel()).includes('작품 담기'));
  // STEP 3
  const railCards = await p.locator('.class-agit-room-card').count(); ok('3단계 전시실 카드', railCards >= 2, String(railCards));
  // 첫 카드(두 번째 방이 앞으로 갔음) 선택 → 주제째 담기
  const activeTitle = async () => (await p.locator('.class-agit-works-target strong').textContent()).trim();
  console.log('active:', await activeTitle());
  const addBtn = p.getByRole('button', { name: /이 전시실에 \d+편 담기/ }).first();
  const label = await addBtn.textContent(); console.log('add label:', label);
  await addBtn.click(); await p.waitForTimeout(2500);
  const rail1 = await p.locator('.class-agit-room-card.is-active').textContent(); console.log('active card:', rail1);
  ok('주제째 담기로 카드에 주제 표시', /편/.test(rail1) && /우리의 작은 발견|마음을 담은 시/.test(rail1), rail1.slice(0,80));
  // 다른 전시실 선택
  await p.locator('.class-agit-room-card__head').nth(1).click(); await p.waitForTimeout(500);
  console.log('active2:', await activeTitle());
  const second = p.getByRole('button', { name: /이 전시실에 \d+편 담기/ }).nth(1); 
  await second.click(); await p.waitForTimeout(2500);
  const cards = await p.locator('.class-agit-room-card').allTextContents(); console.log(cards.map(c=>c.slice(0,70)).join('\n'));
  ok('두 전시실 모두 담김', cards.filter((c) => /[1-9]\d*\/20/.test(c)).length >= 2);
  // 일부만 골라 담기 + 빼기
  await p.getByRole('button', { name: '일부만 골라 담기' }).first().click(); await p.waitForTimeout(2000);
  ok('일부만 골라 담기: 미션 목록 숨김', await p.locator('.class-agit-mission-rail').count() === 0);
  const rm = p.getByRole('button', { name: /초안에서 빼기/ }); const rmCount = await rm.count(); ok('빼기 버튼 존재', rmCount > 0, String(rmCount));
  const totalBefore = (await p.locator('.class-agit-works-target span').textContent()); 
  if (rmCount) { await rm.first().click(); await p.waitForTimeout(700); }
  const totalAfter = (await p.locator('.class-agit-works-target span').textContent());
  ok('빼기로 전체 편수 감소', totalBefore !== totalAfter, `${totalBefore} -> ${totalAfter}`);
  await p.getByRole('button', { name: '← 주제 목록으로' }).click(); await p.waitForTimeout(500);
  // 정리
  await p.getByRole('button', { name: /순서·이동 정리/ }).click(); await p.waitForTimeout(800);
  ok('순서·이동 정리 화면', await p.getByRole('button', { name: /← 작품 담기로 돌아가기/ }).count() > 0);
  await p.getByRole('button', { name: /← 작품 담기로 돌아가기/ }).click(); await p.waitForTimeout(400);
  // STEP 4
  await p.getByRole('button', { name: /미리보기 →/ }).click(); await p.waitForTimeout(2500);
  ok('4단계로 이동', (await stepSel()).includes('미리보기'));
  ok('4단계 STEP 04', await p.getByText('STEP 04').count() > 0);
  await p.screenshot({ path: '/tmp/sim-step4.png' });
  // STEP 5
  await p.getByRole('button', { name: /외부 읽기 공유 →/ }).click(); await p.waitForTimeout(2000);
  ok('5단계로 이동', (await stepSel()).includes('외부 읽기 공유'));
  ok('5단계 STEP 05', await p.getByText('STEP 05').count() > 0);
  await p.screenshot({ path: '/tmp/sim-step5.png' });
  ok('콘솔 오류 없음', errors.length === 0, errors.slice(0,3).join(' || '));
  await b.close();
  console.log('\nSUMMARY', results.filter(r=>r[0]==='PASS').length, 'pass', results.filter(r=>r[0]==='FAIL').length, 'fail');
})().catch((e) => { console.error('SCRIPT ERROR', e.message); process.exit(1); });

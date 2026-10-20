// 글꽃 전시관 1~5단계를 실제 브라우저로 조작해 보는 시뮬레이션(2026-10-20).
// 먼저 `npx vite --port 5188 --host 127.0.0.1` 로 개발 서버를 띄운 뒤 `node scripts/dev-sim/exhibition-5steps-persistence.cjs` 로 돌린다. DB 는 쓰지 않는다(개발 미리보기 샘플).
const { chromium } = require('@playwright/test');
const R=[]; const ok=(n,c,x='')=>{R.push(c);console.log(c?'PASS':'FAIL',n,x)};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1700 } });
  const errors = []; p.on('pageerror', (e) => errors.push(e.message)); p.on('console',(m)=>{ if(m.type()==='error'&&!/401|Failed to load/.test(m.text())) errors.push(m.text()); }); p.on('dialog', (d) => d.accept());
  await p.goto('http://127.0.0.1:5188/?dev-lab=class-agit-persistence'); await p.waitForTimeout(3500);
  const panel = () => p.locator('[role=tabpanel]:not([hidden])').first();
  const selTab = async () => (await p.locator('.class-agit-steps [role=tab][aria-selected=true]').first().textContent()).trim();
  const status = async () => ((await p.locator('.class-agit-status').first().textContent().catch(()=>''))||'').trim();
  await p.getByRole('button', { name: '새 전시 만들기' }).click(); await p.waitForTimeout(2000);
  ok('워크벤치 열림 STEP 01', await p.getByText('STEP 01').count() > 0);
  // step 1
  await p.getByLabel('전시 제목').fill('저장 시뮬 전시'); await p.getByLabel('전시 소개').fill('저장·공개 흐름 테스트');
  const toggle = p.getByLabel('학급 학생 공개 켜기'); ok('학급 공개 토글 존재', await toggle.count() > 0);
  if (await toggle.count()) { await toggle.check(); await p.waitForTimeout(1200); ok('학급 공개 켜짐', await toggle.isChecked()); }
  console.log('status1:', await status());
  // next → 전시실 구성 (저장 후 이동)
  await p.getByRole('button', { name: /전시실 구성 →/ }).click(); await p.waitForTimeout(1800);
  ok('2단계 이동', (await selTab()).includes('전시실 구성'), await status());
  await p.getByRole('button', { name: '+ 전시실' }).click(); await p.waitForTimeout(400);
  await p.getByLabel('전시실 주제').fill('봄 이야기');
  await p.getByRole('button', { name: /작품 담기 →/ }).click(); await p.waitForTimeout(2000);
  ok('3단계 이동', (await selTab()).includes('작품 담기'), await status());
  // 주제째 담기
  const addBtns = p.getByRole('button', { name: /이 전시실에 \d+편 담기/ }); console.log('add buttons', await addBtns.count());
  if (await addBtns.count()) { await addBtns.first().click(); await p.waitForTimeout(2500); }
  console.log('cards:', (await p.locator('.class-agit-room-card').allTextContents()).map(s=>s.slice(0,60)).join(' || '));
  ok('담기 후 편수 표시', /[1-9]\d*\/20편|[1-9]\d*편/.test(await p.locator('.class-agit-room-card.is-active').textContent()));
  // 저장
  await p.getByRole('button', { name: '초안 저장', exact: true }).click(); await p.waitForTimeout(2000);
  console.log('status after save:', await status());
  ok('저장 후 변경 없음', /저장|초안/.test(await status()) && !/저장하지 않은/.test(await status()));
  // 4단계
  await p.getByRole('button', { name: /미리보기 →/ }).click(); await p.waitForTimeout(2500);
  ok('4단계 이동', (await selTab()).includes('미리보기'));
  console.log('step4 text:', (await panel().innerText()).replace(/\s+/g,' ').slice(0,260));
  // 5단계
  await p.getByRole('button', { name: /외부 읽기 공유 →/ }).click(); await p.waitForTimeout(2500);
  ok('5단계 이동', (await selTab()).includes('외부 읽기 공유'));
  const t5 = (await panel().innerText()).replace(/\s+/g,' '); console.log('step5 text:', t5.slice(0,900));
  await panel().screenshot({ path: '/tmp/sim-step5c.png' });
  // 공개
  const pub = p.getByRole('button', { name: /학급에 공개/ }); console.log('publish buttons', await pub.count(), (await pub.allTextContents()).join('|'));
  console.log('disabled?', await pub.first().isDisabled());
  await pub.first().click(); await p.waitForTimeout(1500);
  await p.screenshot({ path: '/tmp/sim-publish.png' });
  console.log('dialogs:', (await p.locator('dialog[open], [role=dialog], [role=alertdialog]').allInnerTexts()).map(x=>x.replace(/\s+/g,' ').slice(0,160)).join(' || '));
  await p.getByRole('button', { name: '진행하기' }).click(); await p.waitForTimeout(3500);
  const body = (await p.locator('main').first().innerText()).replace(/\s+/g,' ');
  console.log('status after publish:', await status());
  console.log('summary:', (body.match(/(비공개 초안[^·]{0,30}|공개 중[^·]{0,30}|학급 공개[^·]{0,30})/g)||[]).slice(0,3).join(' // '));
  ok('학급 공개 완료(비공개 초안 표시 사라짐)', !/비공개 초안 · 학생은 아직 볼 수 없어요/.test(body));
  const t5b=(await panel().innerText()).replace(/\s+/g,' '); console.log('step5 after:', t5b.slice(0,300));
  // 3단계로 돌아가 수정 → 5단계 공개판 갱신 안내
  await p.getByRole('tab', { name: /작품 담기/ }).click(); await p.waitForTimeout(1200);
  await p.locator('.class-agit-room-card__head').first().click(); await p.waitForTimeout(500);
  const add2 = p.getByRole('button', { name: /이 전시실에 \d+편 담기/ }); if (await add2.count()) { await add2.first().click(); await p.waitForTimeout(2500); }
  console.log('status after edit:', await status());
  ok('공개 뒤 수정하면 저장하지 않은 변경 표시', /저장하지 않은/.test(await status()));
  ok('콘솔·페이지 오류 없음', errors.length === 0, errors.slice(0,3).join(' || '));
  console.log('SUMMARY', R.filter(Boolean).length, 'pass', R.filter(x=>!x).length, 'fail');
  await b.close();
})().catch((e)=>{console.error('SCRIPT ERROR',e.message);process.exit(1)});

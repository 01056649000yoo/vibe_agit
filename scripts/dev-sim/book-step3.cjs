// 글꽃 책방 3단계(작품 담기)를 조작해 보는 시뮬레이션(2026-10-20). 사용법은 exhibition-5steps-sample.cjs 와 같다.
const { chromium } = require('@playwright/test');
const R=[]; const ok=(n,c,x='')=>{R.push(c);console.log(c?'PASS':'FAIL',n,x)};
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1440, height: 1700 } }); p.on('dialog', d=>d.accept());
  const errors=[]; p.on('pageerror', e=>errors.push(e.message)); p.on('console', m=>{ if(m.type()==='error'&&!/401|Failed to load/.test(m.text())) errors.push(m.text()); });
  await p.goto('http://127.0.0.1:5188/?dev-lab=class-agit-release'); await p.waitForTimeout(3500);
  await p.getByRole('button', { name: '교사 관리' }).click().catch(()=>{}); await p.waitForTimeout(1200);
  await p.getByRole('tab', { name: /글꽃 책방/ }).click().catch(()=>{}); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: '우리 반 문집 만들기' }).click(); await p.waitForTimeout(2000);
  await p.locator('.class-agit-steps [role=tab]').nth(2).click(); await p.waitForTimeout(2000);
  const rail = async () => (await p.locator('.class-agit-book-rail').innerText()).replace(/\s+/g,' ');
  ok('초기 0편 현황', /0\/300편|0\/\d+편/.test(await rail()), await rail());
  await p.getByRole('button', { name: /편 모두 담기/ }).first().click(); await p.waitForTimeout(2500);
  ok('주제째 담기 후 현황 갱신', /우리의 작은 발견 79편/.test(await rail()), await rail());
  // 일부만 골라 담기(첫 카드) → 빼기
  await p.getByRole('button', { name: '일부만 골라 담기' }).first().click(); await p.waitForTimeout(2000);
  ok('주제 목록으로 돌아가기 단추', await p.getByRole('button', { name: /← 주제 목록으로/ }).count() > 0);
  ok('미션 목록(왼쪽 레일) 숨김', await p.locator('.class-agit-mission-rail').count() === 0);
  const rows = p.getByRole('button', { name: /초안에서 빼기/ }); const n = await rows.count(); ok('한 편 빼기 단추', n > 0, String(n));
  await rows.first().click(); await p.waitForTimeout(600);
  ok('한 편 빼기 → 78편', /우리의 작은 발견 78편/.test(await rail()), await rail());
  await p.getByRole('button', { name: /이 주제에서 담은 78편 모두 빼기/ }).click(); await p.waitForTimeout(1200);
  await p.getByRole('button', { name: /78편 빼기/ }).click().catch(()=>{}); await p.waitForTimeout(800);
  ok('주제째 빼기 → 비어 있음', /아직 담은 글이 없어요/.test(await rail()), await rail());
  await p.getByRole('button', { name: /← 주제 목록으로/ }).click(); await p.waitForTimeout(600);
  // 학생째 담기 탭
  await p.getByRole('button', { name: '학생째 담기' }).click(); await p.waitForTimeout(1500);
  ok('학생째 담기 화면', await p.getByText(/학생/).count() > 0);
  await p.getByRole('button', { name: '주제째 담기' }).click(); await p.waitForTimeout(800);
  await p.getByRole('button', { name: /편 모두 담기/ }).first().click(); await p.waitForTimeout(2500);
  // 전시 작품 가져오기 탭
  await p.getByRole('tab', { name: /전시 작품 가져오기/ }).click(); await p.waitForTimeout(1800);
  console.log('exhibit tab text:', (await p.locator('.class-agit-book-exhibits').innerText().catch(()=>'(none)')).replace(/\s+/g,' ').slice(0,160));
  await p.getByRole('tab', { name: /학생 글에서 담기/ }).click(); await p.waitForTimeout(500);
  // 4단계
  await p.getByRole('button', { name: /목차 정하기 →/ }).last().click(); await p.waitForTimeout(2500);
  ok('4단계 목차에 글 표시', (await p.locator('.class-agit-steps [role=tab][aria-selected=true]').first().textContent()).includes('목차'));
  ok('콘솔 오류 없음', errors.length === 0, errors.slice(0,2).join('|'));
  // 모바일
  const m = await b.newPage({ viewport: { width: 390, height: 900 } }); m.on('dialog', d=>d.accept());
  await m.goto('http://127.0.0.1:5188/?dev-lab=class-agit-release'); await m.waitForTimeout(3500);
  await m.getByRole('button', { name: '교사 관리' }).click().catch(()=>{}); await m.waitForTimeout(1200);
  await m.getByRole('tab', { name: /글꽃 책방/ }).click().catch(()=>{}); await m.waitForTimeout(1200);
  await m.getByRole('button', { name: '우리 반 문집 만들기' }).click(); await m.waitForTimeout(2000);
  await m.locator('.class-agit-steps [role=tab]').nth(2).click(); await m.waitForTimeout(2000);
  ok('모바일 가로 넘침 없음', await m.evaluate(() => { const w = document.querySelector('.class-agit-management'); return w.scrollWidth - w.clientWidth; }) <= 2);
  console.log('SUMMARY', R.filter(Boolean).length, 'pass', R.filter(x=>!x).length, 'fail');
  await b.close();
})().catch((e)=>{console.error('SCRIPT ERROR',e.message);process.exit(1)});

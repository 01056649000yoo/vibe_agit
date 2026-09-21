import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

/*
 * 우리학급 스크린 위젯의 "글씨 맞춤 떨림"(2026-09-21 교사 제보 — 오늘의 급식이 떨린다).
 *
 * 원인: 자기가 크기를 바꾸는 요소를 자기가 ResizeObserver 로 감시했다.
 *   글씨 키움 → 내용 넘침 → 스크롤 막대 생김 → 안쪽 폭 줄어듦 → "크기 바뀜" 알림
 *   → 다시 맞춤 → 글씨 줄어듦 → 막대 사라짐 → 폭 늘어남 → 또 알림 → …
 * 급식 위젯은 `overflow:auto` 라 실제로 고리에 걸렸고, 자리배치는 `overflow:hidden` 이라
 * 우연히 안 걸렸을 뿐 같은 지뢰를 품고 있었다.
 *
 * 여기서 지키는 것은 둘이다.
 *   1. 맞춤 로직의 원본은 하나다 — 베끼면 차단기를 빠뜨린다(실제로 그랬다).
 *   2. 그 원본에는 고리를 끊는 장치가 들어 있다.
 */

const WIDGETS_DIR = 'src/modules/tool/class-board/widgets';
const SHARED_HOOK = `${WIDGETS_DIR}/useFittedWidgetBox.js`;

/* 제 사정(저장된 글씨 크기·대각선 크기조절)이 있어 아직 따로 두는 것. 옮길 때 이 목록에서 뺀다. */
const ALLOWED_OWN_FITTER = new Set([
  path.normalize(`${WIDGETS_DIR}/text/useFittedClassBoardText.js`),
]);

const collectFiles = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? collectFiles(full) : Promise.resolve([full]);
  }));
  return files.flat();
};

const shared = await readFile(SHARED_HOOK, 'utf8');
const widgetFiles = (await collectFiles(WIDGETS_DIR)).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));

test('맞춤 로직의 원본은 하나다 — 위젯이 제 손으로 ResizeObserver 를 달지 않는다', async () => {
  const offenders = [];
  for (const file of widgetFiles) {
    const normalized = path.normalize(file);
    if (normalized === path.normalize(SHARED_HOOK)) continue;
    if (ALLOWED_OWN_FITTER.has(normalized)) continue;
    const source = await readFile(file, 'utf8');
    if (source.includes('new ResizeObserver')) offenders.push(file);
  }
  assert.deepEqual(offenders, [],
    `위젯이 직접 ResizeObserver 를 답니다. 베끼면 고리 차단기를 빠뜨립니다 — ${SHARED_HOOK} 를 쓰세요.`);
});

test('급식·자리배치는 공용 훅을 쓴다', async () => {
  for (const file of [
    `${WIDGETS_DIR}/meal-board/useFittedMealDishes.js`,
    `${WIDGETS_DIR}/arrangement-board/useFittedArrangement.js`,
  ]) {
    const source = await readFile(file, 'utf8');
    assert.ok(source.includes('useFittedWidgetBox'), `${file} 가 공용 훅을 쓰지 않습니다.`);
    assert.ok(!source.includes('findLargestFittingTextSize'),
      `${file} 가 아직 제 손으로 탐색합니다 — 공용 훅에 맡기세요.`);
  }
});

test('공용 훅은 스스로 일으킨 크기 변화로는 다시 맞추지 않는다', () => {
  /*
   * 이 한 줄이 떨림을 끊는다. 없애면 급식 위젯이 다시 떤다.
   * 안쪽(client)이 아니라 바깥 상자(offset)를 견주는 것이 핵심 — 막대는 안쪽만 줄인다.
   */
  assert.ok(
    shared.includes('element.offsetWidth === lastBoxWidth && element.offsetHeight === lastBoxHeight'),
    '스스로 일으킨 크기 변화를 걸러내지 않습니다. 이러면 맞춤이 끝없이 돕니다.'
  );
  assert.ok(shared.includes('return;'), '걸러낸 뒤 빠져나오지 않습니다.');
});

test('재는 동안에는 넘침을 숨겨 잰 값이 흔들리지 않게 한다', () => {
  // 탐색 중 막대가 들락거리면 clientWidth 가 재는 사이에 달라져 결과가 튄다.
  // 정의만 있고 부르지 않으면 소용없다 — 부르는 자리까지 본다.
  assert.ok(shared.includes('const withFrozenOverflow'), '넘침을 숨기는 도구가 없습니다.');
  assert.ok(shared.includes('withFrozenOverflow(element, () => {'),
    '맞추는 동안 넘침을 숨기지 않습니다(도구만 있고 부르지 않습니다).');
  assert.ok(shared.includes("element.style.overflow = 'hidden'"), '넘침을 숨기는 부분이 없습니다.');
  assert.ok(shared.includes('element.style.overflow = savedOverflow'),
    '원래 넘침 설정을 되돌리지 않습니다 — 스크롤이 영영 막힙니다.');
  assert.ok(shared.includes('finally'), '탐색이 중간에 실패하면 넘침이 숨겨진 채 남습니다.');
});

test('글자 바닥(0.8rem)은 두 위젯 모두 지킨다', async () => {
  // 그 아래로 줄이면 태블릿·교실 뒷자리에서 아이가 못 읽는다(디자인 가이드).
  for (const file of [
    `${WIDGETS_DIR}/meal-board/useFittedMealDishes.js`,
    `${WIDGETS_DIR}/arrangement-board/useFittedArrangement.js`,
  ]) {
    const source = await readFile(file, 'utf8');
    assert.ok(source.includes('12.8'), `${file} 의 글자 바닥이 0.8rem 이 아닙니다.`);
  }
});

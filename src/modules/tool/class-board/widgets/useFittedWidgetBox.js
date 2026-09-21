import { useLayoutEffect, useRef } from 'react';
import { findLargestFittingTextSize } from './text/textScale';

/*
 * 위젯 내용을 상자에 가득 차게 맞춘다 — 급식·자리배치가 함께 쓴다.
 *
 * 왜 하나로 모았나(2026-09-21): 급식·자리배치·글상자가 같은 맞춤 로직을 각자 베껴 쓰고
 * 있었고, 베낄 때 **고리 차단기를 빠뜨려** 급식 위젯이 떨렸다. 원본을 하나로 모아 둔다.
 *
 * ⚠️ 떨림의 원인이었던 것 — 자기가 크기를 바꾸는 요소를 자기가 감시하면 고리가 닫힌다.
 *
 *    글씨를 키운다 → 내용이 넘친다 → 스크롤 막대가 생긴다 → 막대 너비만큼 안쪽 폭이
 *    줄어든다 → ResizeObserver 가 "크기 바뀜"으로 알린다 → 다시 맞춘다 → 글씨가 줄어
 *    막대가 사라진다 → 폭이 늘어난다 → 또 알린다 → …
 *
 *    화면에서는 글씨가 커졌다 작아졌다 하는 떨림으로 보인다. 급식 위젯이 `overflow:auto`
 *    라 실제로 이 고리에 걸렸다(자리배치는 `overflow:hidden` 이라 우연히 안 걸렸을 뿐이다).
 *
 * 그래서 두 겹으로 막는다.
 *   1) 재는 동안에는 넘침을 숨겨 둔다 — 탐색 중에 막대가 나타났다 사라지며 재는 값이
 *      흔들리는 것을 없앤다.
 *   2) ResizeObserver 는 **바깥 상자 크기가 실제로 달라졌을 때만** 다시 맞춘다. 맞춤이
 *      스스로 일으킨 안쪽 변화(막대 때문에 생긴 1~17px)는 무시한다.
 *
 * 글상자(`text/useFittedClassBoardText.js`)는 저장된 글씨 크기·대각선 크기조절 같은 제 사정이
 * 있어 아직 따로 둔다. 다만 같은 고리에 걸리지 않게 `shouldRefitClassBoardText` 로 이미
 * ResizeObserver 되맞춤을 막아 두었다. 옮길 때는 그 두 가지를 먼저 옮겨야 한다.
 */

/** 재는 동안만 넘침을 숨긴다. 막대가 들락거리면 잰 값이 흔들린다. */
const withFrozenOverflow = (element, measure) => {
  const savedOverflow = element.style.overflow;
  element.style.overflow = 'hidden';
  try {
    return measure();
  } finally {
    element.style.overflow = savedOverflow;
  }
};

/**
 * @param {string} signature 내용이 바뀌면 달라지는 값. 바뀔 때 다시 맞춘다.
 * @param {object} options
 * @param {string} options.property 넣어 줄 CSS 변수 이름 (예: `--class-board-meal-dish-size`)
 * @param {number} options.minSize 글자 바닥(px). 디자인 가이드상 0.8rem = 12.8px 아래로 내리지 않는다.
 * @param {number} [options.maxSize] 위 한계(px). 없으면 상자 크기에서 잡는다.
 */
export default function useFittedWidgetBox(signature, { property, minSize, maxSize }) {
  const elementRef = useRef(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    let animationFrame = 0;
    let active = true;
    // 직전에 맞춘 바깥 상자 크기. 이것이 그대로면 맞춤이 스스로 일으킨 변화라 무시한다.
    let lastBoxWidth = -1;
    let lastBoxHeight = -1;

    const applySize = (size) => {
      element.style.setProperty(property, `${Math.round(size * 4) / 4}px`);
    };

    const fit = () => {
      animationFrame = 0;
      if (!active) return;
      const { offsetWidth, offsetHeight } = element;
      if (offsetWidth <= 0 || offsetHeight <= 0) return;
      lastBoxWidth = offsetWidth;
      lastBoxHeight = offsetHeight;

      withFrozenOverflow(element, () => {
        const upperBound = maxSize || Math.max(minSize, element.clientWidth, element.clientHeight);
        const largest = findLargestFittingTextSize((candidate) => {
          applySize(candidate);
          return element.scrollWidth <= element.clientWidth
            && element.scrollHeight <= element.clientHeight;
        }, minSize, upperBound);
        applySize(largest);
      });
    };

    const schedule = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(fit);
    };

    schedule();

    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
        // 바깥 상자가 그대로인데 불린 것은 맞춤이 스스로 일으킨 변화다. 여기서 끊지 않으면 떤다.
        if (element.offsetWidth === lastBoxWidth && element.offsetHeight === lastBoxHeight) return;
        schedule();
      });
    resizeObserver?.observe(element);

    // 글꼴이 늦게 오면 글자 폭이 달라져 다시 맞춰야 한다.
    document.fonts?.ready?.then(() => { if (active) schedule(); });

    return () => {
      active = false;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [signature, property, minSize, maxSize]);

  return elementRef;
}

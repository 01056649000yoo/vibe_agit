import { useLayoutEffect, useRef } from 'react';
import { findLargestFittingTextSize } from '../text/textScale';

/*
 * 자리표·역할표를 위젯 상자에 가득 차게 맞춘다.
 *
 * 왜(2026-09-03): 처음에는 글씨를 상자 크기에만 비례시켰다(`cqmin`). 그런데 그 방식은
 * **내용이 얼마나 많은지를 모른다** — 24명이든 6명이든 같은 크기로 그리니
 * 사람이 많으면 아래가 잘려 다 안 보이고, 적으면 쓸데없이 작았다.
 * 여기서는 실제로 그려 본 뒤 **넘치지 않는 가장 큰 크기**를 찾는다.
 *
 * 이분 탐색은 텍스트·급식 위젯과 **같은 원본**(`text/textScale.js`)을 쓴다.
 * 자리 칸 높이·이름 크기·틈은 모두 이 한 값(`--arrange-fit-unit`)에서 나온다.
 */

// 디자인 가이드의 글자 바닥(0.8rem). 더 줄이면 뒷자리 아이가 못 읽는다.
// ⚠️ 그래도 안 들어가면 줄이지 않고 그대로 둔다 — 위젯을 키우라는 뜻이다(작게 뭉개는 것보다 낫다).
const MIN_UNIT_PX = 12.8;
const MAX_UNIT_PX = 96;

const applyUnit = (element, size) => {
  element.style.setProperty('--arrange-fit-unit', `${Math.round(size * 4) / 4}px`);
};

export default function useFittedArrangement(signature) {
  const elementRef = useRef(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    let animationFrame = 0;
    let active = true;

    const fit = () => {
      animationFrame = 0;
      if (element.clientWidth <= 0 || element.clientHeight <= 0) return;
      const largest = findLargestFittingTextSize((candidate) => {
        applyUnit(element, candidate);
        return element.scrollWidth <= element.clientWidth
          && element.scrollHeight <= element.clientHeight;
      }, MIN_UNIT_PX, MAX_UNIT_PX);
      applyUnit(element, largest);
    };

    const schedule = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(fit);
    };

    schedule();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(element);
    // 글꼴이 늦게 오면 글자 폭이 달라져 다시 맞춰야 한다.
    document.fonts?.ready?.then(() => { if (active) schedule(); });

    return () => {
      active = false;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [signature]);

  return elementRef;
}

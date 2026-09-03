import { useLayoutEffect, useRef } from 'react';
import { findLargestFittingTextSize } from '../text/textScale';

/*
 * 급식 이름을 위젯에 남은 자리에 가득 차게 키운다.
 *
 * 예전에는 위젯 크기에만 비례하는 글씨였다. 그래서 반찬이 적은 날에도 글씨가 작게 남아
 * 뒷자리에서 안 보였다. 여기서는 실제로 그려 본 뒤 넘치지 않는 가장 큰 크기를 찾는다.
 * 이분 탐색은 텍스트 위젯과 같은 원본(`text/textScale.js`)을 쓴다.
 *
 * 열 수·반찬 목록이 바뀌거나 위젯 크기가 바뀔 때만 다시 맞추고, 한 프레임에 한 번만 돈다.
 */

// 디자인 가이드의 글자 바닥(0.8rem). 더 줄이면 뒷자리 아이가 못 읽는다.
const MIN_DISH_SIZE_PX = 12.8;

const applyDishSize = (element, size) => {
  element.style.setProperty('--class-board-meal-dish-size', `${Math.round(size * 4) / 4}px`);
};

export default function useFittedMealDishes(signature) {
  const elementRef = useRef(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    let animationFrame = 0;
    let active = true;

    const fitDishes = () => {
      animationFrame = 0;
      if (element.clientWidth <= 0 || element.clientHeight <= 0) return;
      const maximumSize = Math.max(MIN_DISH_SIZE_PX, element.clientWidth, element.clientHeight);
      const maximumFittingSize = findLargestFittingTextSize((candidate) => {
        applyDishSize(element, candidate);
        return element.scrollWidth <= element.clientWidth
          && element.scrollHeight <= element.clientHeight;
      }, MIN_DISH_SIZE_PX, maximumSize);
      applyDishSize(element, maximumFittingSize);
    };

    const scheduleFit = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(fitDishes);
    };

    scheduleFit();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleFit);
    resizeObserver?.observe(element);
    document.fonts?.ready?.then(() => { if (active) scheduleFit(); });

    return () => {
      active = false;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [signature]);

  return elementRef;
}

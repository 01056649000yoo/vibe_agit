import { useLayoutEffect, useRef } from 'react';
import {
  CLASS_BOARD_TEXT_HEADING_RATIO,
  CLASS_BOARD_TEXT_MIN_BODY_PX,
  findLargestFittingTextSize,
  normalizeClassBoardTextBodySize,
  resolveClassBoardTextSizing,
  shouldRefitClassBoardText,
} from './textScale';

const roundQuarterPixel = (value) => Math.round(value * 4) / 4;

const applyTextSize = (element, bodySize) => {
  const normalizedBodySize = normalizeClassBoardTextBodySize(bodySize) || CLASS_BOARD_TEXT_MIN_BODY_PX;
  element.style.setProperty('--class-board-text-body-size', `${roundQuarterPixel(normalizedBodySize)}px`);
  element.style.setProperty(
    '--class-board-text-heading-size',
    `${roundQuarterPixel(normalizedBodySize * CLASS_BOARD_TEXT_HEADING_RATIO)}px`
  );
};

const fitsInside = (element) => element.scrollWidth <= element.clientWidth
  && element.scrollHeight <= element.clientHeight;

/** 재는 동안만 넘침을 숨긴다. 스크롤 막대가 들락거리면 잰 값이 흔들린다(useFittedWidgetBox 와 같은 차단기). */
const withFrozenOverflow = (element, measure) => {
  const savedOverflow = element.style.overflow;
  element.style.overflow = 'hidden';
  try {
    return measure();
  } finally {
    element.style.overflow = savedOverflow;
  }
};

/*
 * `step` 방식: 고른 크기(targetPx)를 넘지 않는 선에서, 상자에 들어가는 가장 큰 크기.
 * 글이 짧으면 고른 크기 그대로이고, 상자를 넘칠 때만 줄어든다. 상자 크기가 바뀔 때마다 다시 잰다.
 * 떨림을 막는 두 겹 — 재는 동안 넘침 숨기기, 바깥 상자가 실제로 바뀔 때만 다시 재기.
 */
const useStepFit = (elementRef, { heading, body, targetPx }) => {
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || !targetPx) return undefined;
    let animationFrame = 0;
    let active = true;
    let lastBoxWidth = -1;
    let lastBoxHeight = -1;

    const fit = () => {
      animationFrame = 0;
      if (!active) return;
      const { offsetWidth, offsetHeight } = element;
      if (offsetWidth <= 0 || offsetHeight <= 0) return;
      lastBoxWidth = offsetWidth;
      lastBoxHeight = offsetHeight;
      withFrozenOverflow(element, () => {
        applyTextSize(element, targetPx);
        if (fitsInside(element)) return;
        const fitting = findLargestFittingTextSize((candidate) => {
          applyTextSize(element, candidate);
          return fitsInside(element);
        }, CLASS_BOARD_TEXT_MIN_BODY_PX, targetPx);
        applyTextSize(element, fitting);
      });
    };

    const schedule = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(fit);
    };

    applyTextSize(element, targetPx);
    schedule();
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
        // 바깥 상자가 그대로인데 불린 것은 맞춤이 스스로 일으킨 변화다.
        if (element.offsetWidth === lastBoxWidth && element.offsetHeight === lastBoxHeight) return;
        schedule();
      });
    resizeObserver?.observe(element);
    document.fonts?.ready?.then(() => { if (active) schedule(); });

    return () => {
      active = false;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [elementRef, heading, body, targetPx]);
};

/* `fill` 방식: 상자에 꽉 차는 가장 큰 크기. 대각선 크기조절은 비례, 저장된 크기(bodySize)가 있으면 그것. */
const useFillFit = (elementRef, { heading, body, bodySize, enabled }) => {
  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element || !enabled) return undefined;
    const savedBodySize = normalizeClassBoardTextBodySize(bodySize);
    let animationFrame = 0;
    let active = true;
    let forceNextFit = false;
    let diagonalSession = '';
    let diagonalBaseSize = CLASS_BOARD_TEXT_MIN_BODY_PX;

    const fitText = () => {
      animationFrame = 0;
      const force = forceNextFit;
      forceNextFit = false;
      const frame = element.closest('[data-board-frame]');
      const resizeAxis = frame?.dataset.boardResizeAxis;
      if (!force && resizeAxis === 'both') {
        const nextSession = frame.dataset.boardResizeSession || '';
        const nextScale = Number(frame.dataset.boardResizeScale);
        if (diagonalSession !== nextSession) {
          diagonalSession = nextSession;
          diagonalBaseSize = Number.parseFloat(
            element.style.getPropertyValue('--class-board-text-body-size')
          ) || CLASS_BOARD_TEXT_MIN_BODY_PX;
        }
        if (Number.isFinite(nextScale) && nextScale > 0) {
          applyTextSize(element, Math.max(CLASS_BOARD_TEXT_MIN_BODY_PX, diagonalBaseSize * nextScale));
        }
        return;
      }
      if (savedBodySize) {
        applyTextSize(element, savedBodySize);
        return;
      }
      if (!shouldRefitClassBoardText(resizeAxis, force)) return;
      if (element.clientWidth <= 0 || element.clientHeight <= 0) return;
      const maximumSize = Math.max(
        CLASS_BOARD_TEXT_MIN_BODY_PX,
        element.clientWidth,
        element.clientHeight
      );
      const maximumFittingSize = findLargestFittingTextSize((candidate) => {
        applyTextSize(element, candidate);
        return element.scrollWidth <= element.clientWidth
          && element.scrollHeight <= element.clientHeight;
      }, CLASS_BOARD_TEXT_MIN_BODY_PX, maximumSize);
      applyTextSize(element, maximumFittingSize);
    };

    const scheduleFit = (force = false) => {
      forceNextFit = forceNextFit || force;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(fitText);
    };

    if (savedBodySize) applyTextSize(element, savedBodySize);
    else scheduleFit(true);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => scheduleFit(false));
    resizeObserver?.observe(element);
    document.fonts?.ready?.then(() => {
      if (active && !savedBodySize) scheduleFit(true);
    });

    return () => {
      active = false;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [elementRef, heading, body, bodySize, enabled]);
};

export default function useFittedClassBoardText(config = {}) {
  const elementRef = useRef(null);
  const { heading, body, bodySize } = config;
  const sizing = resolveClassBoardTextSizing(config);
  useStepFit(elementRef, { heading, body, targetPx: sizing.mode === 'step' ? sizing.targetPx : null });
  useFillFit(elementRef, { heading, body, bodySize, enabled: sizing.mode === 'fill' });
  return elementRef;
}

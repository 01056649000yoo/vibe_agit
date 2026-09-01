import { useLayoutEffect, useRef } from 'react';
import {
  CLASS_BOARD_TEXT_HEADING_RATIO,
  CLASS_BOARD_TEXT_MIN_BODY_PX,
  findLargestFittingTextSize,
  normalizeClassBoardTextBodySize,
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

export default function useFittedClassBoardText({ heading, body, bodySize }) {
  const elementRef = useRef(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
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
  }, [heading, body, bodySize]);

  return elementRef;
}

import { useLayoutEffect, useRef } from 'react';
import {
  CLASS_BOARD_TEXT_HEADING_RATIO,
  CLASS_BOARD_TEXT_MIN_BODY_PX,
  findLargestFittingTextSize,
  getTextFillRatio,
} from './textScale';

const roundQuarterPixel = (value) => Math.round(value * 4) / 4;

const applyTextSize = (element, bodySize) => {
  element.style.setProperty('--class-board-text-body-size', `${roundQuarterPixel(bodySize)}px`);
  element.style.setProperty(
    '--class-board-text-heading-size',
    `${roundQuarterPixel(bodySize * CLASS_BOARD_TEXT_HEADING_RATIO)}px`
  );
};

export default function useFittedClassBoardText({ heading, body, fontScale }) {
  const elementRef = useRef(null);

  useLayoutEffect(() => {
    const element = elementRef.current;
    if (!element) return undefined;
    let animationFrame = 0;
    let active = true;

    const fitText = () => {
      animationFrame = 0;
      if (element.clientWidth <= 0 || element.clientHeight <= 0) return;
      const maximumFittingSize = findLargestFittingTextSize((candidate) => {
        applyTextSize(element, candidate);
        return element.scrollWidth <= element.clientWidth
          && element.scrollHeight <= element.clientHeight;
      });
      applyTextSize(
        element,
        Math.max(CLASS_BOARD_TEXT_MIN_BODY_PX, maximumFittingSize * getTextFillRatio(fontScale))
      );
    };

    const scheduleFit = () => {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = requestAnimationFrame(fitText);
    };

    scheduleFit();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleFit);
    resizeObserver?.observe(element);
    document.fonts?.ready?.then(() => {
      if (active) scheduleFit();
    });

    return () => {
      active = false;
      if (animationFrame) cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
    };
  }, [heading, body, fontScale]);

  return elementRef;
}

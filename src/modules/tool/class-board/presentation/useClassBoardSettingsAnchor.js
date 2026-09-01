import { useCallback, useLayoutEffect, useRef, useState } from 'react';

const PANEL_GAP = 12;
const VIEWPORT_GAP = 10;
const PANEL_WIDTH = 340;
const MIN_PANEL_HEIGHT = 180;

export const calculateClassBoardSettingsAnchor = (frameRect, viewport = {}) => {
  if (!frameRect) return null;
  const viewportWidth = Math.max(0, Number(viewport.width) || 0);
  const viewportHeight = Math.max(0, Number(viewport.height) || 0);
  const left = Math.ceil(frameRect.right) + PANEL_GAP;
  const availableWidth = Math.max(0, Math.floor(viewportWidth - left - VIEWPORT_GAP));
  const width = Math.min(PANEL_WIDTH, availableWidth);
  const maximumTop = Math.max(VIEWPORT_GAP, viewportHeight - MIN_PANEL_HEIGHT - VIEWPORT_GAP);
  const top = Math.min(Math.max(VIEWPORT_GAP, Math.floor(frameRect.top)), maximumTop);
  return {
    top,
    left,
    width,
    maxHeight: Math.max(MIN_PANEL_HEIGHT, viewportHeight - top - VIEWPORT_GAP),
  };
};

const sameAnchor = (left, right) => (
  left?.instanceId === right?.instanceId
  && left?.top === right?.top
  && left?.left === right?.left
  && left?.width === right?.width
  && left?.maxHeight === right?.maxHeight
);

const findSelectedFrame = (root, instanceId) => Array.from(
  root?.querySelectorAll?.('[data-board-instance-id]') || []
).find((element) => element.dataset.boardInstanceId === instanceId) || null;

export default function useClassBoardSettingsAnchor({ contentRef, enabled, selectedInstanceId }) {
  const [anchor, setAnchor] = useState(null);
  const animationFrameRef = useRef(null);

  const measure = useCallback(() => {
    const frame = findSelectedFrame(contentRef.current, selectedInstanceId);
    const position = calculateClassBoardSettingsAnchor(frame?.getBoundingClientRect(), {
      width: window.innerWidth,
      height: window.innerHeight,
    });
    const next = position ? { instanceId: selectedInstanceId, ...position } : null;
    setAnchor((current) => sameAnchor(current, next) ? current : next);
  }, [contentRef, selectedInstanceId]);

  const scheduleMeasure = useCallback(() => {
    if (animationFrameRef.current !== null) return;
    animationFrameRef.current = window.requestAnimationFrame(() => {
      animationFrameRef.current = null;
      measure();
    });
  }, [measure]);

  useLayoutEffect(() => {
    if (!enabled || !selectedInstanceId) return undefined;
    scheduleMeasure();
    const frame = findSelectedFrame(contentRef.current, selectedInstanceId);
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleMeasure);
    if (frame) resizeObserver?.observe(frame);
    const followPointerDrag = (event) => {
      if (event.buttons !== 0) scheduleMeasure();
    };
    window.addEventListener('pointermove', followPointerDrag, { passive: true });
    window.addEventListener('pointerup', scheduleMeasure, { passive: true });
    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener('pointermove', followPointerDrag);
      window.removeEventListener('pointerup', scheduleMeasure);
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [contentRef, enabled, scheduleMeasure, selectedInstanceId]);

  return enabled && anchor?.instanceId === selectedInstanceId ? {
    top: `${anchor.top}px`,
    left: `${anchor.left}px`,
    width: `${anchor.width}px`,
    maxHeight: `${anchor.maxHeight}px`,
  } : null;
}

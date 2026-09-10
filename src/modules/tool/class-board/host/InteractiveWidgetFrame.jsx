import React, { useEffect, useRef, useState } from 'react';
import { WidgetHost } from './WidgetHost';
import {
  getDiagonalResizeScale,
  movePlacementByPixels,
  normalizePlacement,
  resizePlacementByPixels,
} from './boardPlacement';

const MOVE_START_THRESHOLD_PX = 3;

// 자리는 이 다섯 값이 전부다(boardPlacement.normalizePlacement). 값이 같으면 다시 그릴 일이 없다.
const placementSignature = (placement) => [
  placement?.x, placement?.y, placement?.width, placement?.height, placement?.pinned ? 1 : 0,
].join(':');

const placementStyle = (placement, zIndex) => ({
  left: `${placement.x}%`,
  top: `${placement.y}%`,
  width: `${placement.width}%`,
  height: `${placement.height}%`,
  zIndex,
});

const getRenderedTextBodySize = (frame) => {
  const text = frame?.querySelector('.class-board-text');
  if (!text) return null;
  const value = Number.parseFloat(text.style.getPropertyValue('--class-board-text-body-size'));
  return Number.isFinite(value) && value > 0 ? value : null;
};

const getPlacementChangeMeta = (instance, gesture, placement) => {
  if (gesture?.type !== 'resize-both') return { resizeAxis: gesture?.type?.replace('resize-', '') || null };
  const scale = getDiagonalResizeScale(gesture.startPlacement, placement);
  return {
    resizeAxis: 'both',
    ...(instance.widgetId === 'text' && gesture.startTextBodySize ? {
      textBodySize: gesture.startTextBodySize * scale,
    } : {}),
  };
};

export default function InteractiveWidgetFrame({
  instance,
  manifest,
  classId,
  assetUrl,
  selected,
  presentation,
  editable,
  onSelect,
  onPlacementChange,
}) {
  const normalized = normalizePlacement(instance.placement, manifest?.defaultPlacement?.placement);
  const [draftPlacement, setDraftPlacement] = useState(normalized);
  const [resizeAxis, setResizeAxis] = useState(null);
  const [resizeScale, setResizeScale] = useState(1);
  const [resizeSession, setResizeSession] = useState(0);
  const frameRef = useRef(null);
  const gestureRef = useRef(null);
  const latestPlacementRef = useRef(normalized);
  const clearResizeFrameRef = useRef(0);

  // 저장·취소처럼 바깥에서 자리가 바뀌면 여기 초안도 따라간다.
  // 예전에는 부모가 열쇠값에 자리를 넣어 위젯을 통째로 다시 만들었는데, 그러면 옮길 때마다
  // 사진을 다시 내려받고(만료된 주소면 깨진다) 타이머·스톱워치가 0으로 돌아갔다.
  const placementKey = placementSignature(normalized);
  useEffect(() => {
    if (gestureRef.current) return;
    setDraftPlacement((current) => {
      if (placementSignature(current) === placementKey) return current;
      latestPlacementRef.current = normalized;
      return normalized;
    });
    // normalized 는 렌더마다 새 객체라 값만 담은 placementKey 를 의존성으로 둔다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementKey]);

  useEffect(() => () => {
    if (clearResizeFrameRef.current) cancelAnimationFrame(clearResizeFrameRef.current);
  }, []);

  const select = () => onSelect?.(instance.instanceId);
  const scheduleResizeModeClear = () => {
    if (clearResizeFrameRef.current) cancelAnimationFrame(clearResizeFrameRef.current);
    clearResizeFrameRef.current = requestAnimationFrame(() => {
      clearResizeFrameRef.current = requestAnimationFrame(() => {
        clearResizeFrameRef.current = 0;
        setResizeAxis(null);
      });
    });
  };

  const beginGesture = (type, event) => {
    if (draftPlacement.pinned || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault();
    event.stopPropagation();
    select();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    if (clearResizeFrameRef.current) cancelAnimationFrame(clearResizeFrameRef.current);
    if (type === 'resize-x') setResizeAxis('x');
    else if (type === 'resize-y') setResizeAxis('y');
    else if (type === 'resize-both') {
      setResizeAxis('both');
      setResizeScale(1);
      setResizeSession((current) => current + 1);
    }
    latestPlacementRef.current = draftPlacement;
    gestureRef.current = {
      type,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPlacement: draftPlacement,
      bounds: frameRef.current?.parentElement?.getBoundingClientRect(),
      startTextBodySize: getRenderedTextBodySize(frameRef.current),
      changed: false,
    };
  };

  const continueGesture = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.preventDefault();
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (
      gesture.type === 'move'
      && !gesture.changed
      && Math.hypot(deltaX, deltaY) < MOVE_START_THRESHOLD_PX
    ) return;
    const next = gesture.type === 'move'
      ? movePlacementByPixels(gesture.startPlacement, deltaX, deltaY, gesture.bounds)
      : resizePlacementByPixels(
        gesture.startPlacement,
        deltaX,
        deltaY,
        gesture.bounds,
        gesture.type === 'resize-x' ? 'x' : gesture.type === 'resize-y' ? 'y' : 'both'
      );
    gesture.changed = gesture.changed
      || next.x !== gesture.startPlacement.x
      || next.y !== gesture.startPlacement.y
      || next.width !== gesture.startPlacement.width
      || next.height !== gesture.startPlacement.height;
    if (!gesture.changed) return;
    latestPlacementRef.current = next;
    if (gesture.type === 'resize-both') {
      setResizeScale(getDiagonalResizeScale(gesture.startPlacement, next));
    }
    setDraftPlacement(next);
  };

  const finishGesture = (event) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    gestureRef.current = null;
    if (gesture.changed) {
      onPlacementChange?.(
        instance.instanceId,
        latestPlacementRef.current,
        getPlacementChangeMeta(instance, gesture, latestPlacementRef.current)
      );
    }
    scheduleResizeModeClear();
  };

  const nudge = (type, event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || draftPlacement.pinned) return;
    event.preventDefault();
    const amount = event.shiftKey ? 2 : 0.5;
    const horizontal = event.key === 'ArrowLeft' ? -amount : event.key === 'ArrowRight' ? amount : 0;
    const vertical = event.key === 'ArrowUp' ? -amount : event.key === 'ArrowDown' ? amount : 0;
    const virtualBounds = { width: 100, height: 100 };
    const next = type === 'move'
      ? movePlacementByPixels(draftPlacement, horizontal, vertical, virtualBounds)
      : resizePlacementByPixels(draftPlacement, horizontal, vertical, virtualBounds, 'both');
    let placementMeta;
    if (type === 'resize') {
      const scale = getDiagonalResizeScale(draftPlacement, next);
      setResizeAxis('both');
      setResizeSession((current) => current + 1);
      setResizeScale(scale);
      placementMeta = {
        resizeAxis: 'both',
        ...(instance.widgetId === 'text' ? {
          textBodySize: (getRenderedTextBodySize(frameRef.current) || 0) * scale,
        } : {}),
      };
    }
    latestPlacementRef.current = next;
    setDraftPlacement(next);
    onPlacementChange?.(instance.instanceId, next, placementMeta);
    if (type === 'resize') scheduleResizeModeClear();
  };

  const togglePinned = (event) => {
    event.stopPropagation();
    select();
    const next = { ...draftPlacement, pinned: !draftPlacement.pinned };
    latestPlacementRef.current = next;
    setDraftPlacement(next);
    onPlacementChange?.(instance.instanceId, next);
  };

  const pointerHandlers = (type) => ({
    onPointerDown: (event) => beginGesture(type, event),
    onPointerMove: continueGesture,
    onPointerUp: finishGesture,
    onPointerCancel: finishGesture,
  });
  const contentDragProps = editable && !draftPlacement.pinned ? {
    'data-board-drag-surface': 'true',
    title: '마우스로 드래그해서 이동',
    ...pointerHandlers('move'),
  } : undefined;

  return (
    <div
      ref={frameRef}
      data-board-frame
      data-board-instance-id={instance.instanceId}
      data-board-resize-axis={resizeAxis || undefined}
      data-board-resize-scale={resizeAxis === 'both' ? resizeScale : undefined}
      data-board-resize-session={resizeAxis === 'both' ? resizeSession : undefined}
      aria-keyshortcuts={editable && selected ? 'Escape' : undefined}
      className={`class-board-widget-frame class-board-widget-frame--freeform${selected ? ' is-selected' : ''}${draftPlacement.pinned ? ' is-pinned' : ''}`}
      style={placementStyle(draftPlacement, instance.order)}
      onPointerDown={select}
    >
      {editable ? (
        <div className="class-board-widget-tools">
          <button
            type="button"
            className="class-board-widget-move"
            aria-label={`${manifest?.name || '위젯'} 이동`}
            title={draftPlacement.pinned ? '핀을 해제하면 이동할 수 있어요' : '드래그해서 이동'}
            disabled={draftPlacement.pinned}
            onKeyDown={(event) => nudge('move', event)}
            {...pointerHandlers('move')}
          >
            <span aria-hidden="true">⠿</span> {manifest?.name}
          </button>
          <button
            type="button"
            className="class-board-widget-pin"
            aria-label={draftPlacement.pinned ? '위젯 핀 해제' : '위젯 위치 고정'}
            aria-pressed={draftPlacement.pinned}
            title={draftPlacement.pinned ? '핀 해제' : '현재 위치에 핀 꽂기'}
            onClick={togglePinned}
          >{draftPlacement.pinned ? '📌' : '📍'}</button>
        </div>
      ) : null}
      <WidgetHost
        instance={instance}
        classId={classId}
        assetUrl={assetUrl}
        presentation={presentation}
        dragHandleProps={contentDragProps}
      />
      {editable && selected && !draftPlacement.pinned ? (
        <>
          <button type="button" className="class-board-resize class-board-resize--x" aria-label="위젯 가로 크기 조절" {...pointerHandlers('resize-x')} />
          <button type="button" className="class-board-resize class-board-resize--y" aria-label="위젯 세로 크기 조절" {...pointerHandlers('resize-y')} />
          <button
            type="button"
            className="class-board-resize class-board-resize--both"
            aria-label="위젯 가로세로 크기 조절"
            title="드래그해서 크기 조절"
            onKeyDown={(event) => nudge('resize', event)}
            {...pointerHandlers('resize-both')}
          />
        </>
      ) : null}
    </div>
  );
}

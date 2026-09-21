import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import useClassBoardAssetUrls from './useClassBoardAssetUrls';
import { getClassBoardWidget } from '../widgets/registry';
import {
  calculateClassBoardStageTransform,
  CLASS_BOARD_STAGE_HEIGHT,
  CLASS_BOARD_STAGE_WIDTH,
  isSameClassBoardStageTransform,
  measureClassBoardStageSize,
} from './boardStage';
import InteractiveWidgetFrame from './InteractiveWidgetFrame';
import { WidgetHost } from './WidgetHost';

const sortWidgets = (widgets, zone) => widgets
  .filter((widget) => widget.zone === zone && widget.visible !== false)
  .sort((left, right) => left.order - right.order || left.instanceId.localeCompare(right.instanceId));

export default function BoardCanvas({
  board,
  classId,
  presentation = false,
  editable,
  contentRef,
  selectedInstanceId = null,
  onSelect,
  onClearSelection,
  onPlacementChange,
  assetSeed = null,
}) {
  const interactionEnabled = editable ?? !presentation;
  const viewportRef = useRef(null);
  const [stageTransform, setStageTransform] = useState({ scale: 0, x: 0, y: 0 });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const sidebarId = useId();
  const sidebarWidgets = useMemo(
    () => sortWidgets(board?.widgets || [], 'sidebar'),
    [board?.widgets]
  );
  const hasSidebar = sidebarWidgets.length > 0;
  const imagePathKey = useMemo(() => (
    [...new Set((board?.widgets || []).map((widget) => widget?.config?.path).filter(Boolean))]
      .sort()
      .join('\n')
  ), [board?.widgets]);
  const imagePaths = useMemo(() => imagePathKey ? imagePathKey.split('\n') : [], [imagePathKey]);
  const {
    urls: assetUrls,
    error: assetError,
    loading: assetLoading,
    retry: retryAssets,
  } = useClassBoardAssetUrls(imagePaths, { boardId: board?.id || null, seed: assetSeed });

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    const measure = () => {
      // 소수점 흔들림을 먼저 끊고, 값이 그대로면 상태를 갈아 끼우지 않는다.
      // 새 객체를 그냥 넣으면 값이 같아도 스크린 전체가 다시 그려져 확대·축소 중에 떨린다.
      const { width, height } = measureClassBoardStageSize(viewport.getBoundingClientRect());
      const next = calculateClassBoardStageTransform(width, height);
      setStageTransform((previous) => (
        isSameClassBoardStageTransform(previous, next) ? previous : next
      ));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const renderContent = () => sortWidgets(board?.widgets || [], 'content').map((instance) => {
    const manifest = getClassBoardWidget(instance.widgetId);
    const selected = interactionEnabled && selectedInstanceId === instance.instanceId;
    return (
      <InteractiveWidgetFrame
        key={instance.instanceId}
        instance={instance}
        manifest={manifest}
        classId={classId}
        assetUrl={assetUrls.get(instance.config?.path) || ''}
        selected={selected}
        presentation={presentation}
        editable={interactionEnabled}
        onSelect={onSelect}
        onPlacementChange={onPlacementChange}
      />
    );
  });

  const renderSidebar = () => sidebarWidgets.map((instance) => (
    <div
      key={instance.instanceId}
      className="class-board-widget-frame class-board-widget-frame--sidebar"
    >
      {!presentation && interactionEnabled ? (
        <button type="button" className="class-board-widget-select" onClick={() => onSelect?.(instance.instanceId)}>
          <span>{getClassBoardWidget(instance.widgetId)?.icon} 현황 설정</span>
        </button>
      ) : null}
        <WidgetHost
          instance={instance}
          classId={classId}
          assetUrl={assetUrls.get(instance.config?.path) || ''}
          presentation={presentation}
        />
    </div>
  ));

  return (
    <div
      ref={viewportRef}
      className={`class-board-viewport${presentation ? ' is-presentation' : ''}`}
      data-board-stage-width={CLASS_BOARD_STAGE_WIDTH}
      data-board-stage-height={CLASS_BOARD_STAGE_HEIGHT}
    >
      {assetError ? (
        <div className="class-board-asset-alert" role="status">
          <span>🖼️ {assetError}</span>
          <button type="button" onClick={retryAssets} disabled={assetLoading}>
            {assetLoading ? '다시 받는 중…' : '다시 시도'}
          </button>
        </div>
      ) : null}
      <div
        className="class-board-viewport__surface"
        style={{
          transform: `translate(${stageTransform.x}px, ${stageTransform.y}px) scale(${stageTransform.scale})`,
          visibility: stageTransform.scale > 0 ? 'visible' : 'hidden',
        }}
      >
        <div className={`class-board-canvas${presentation ? ' is-presentation' : ''}${sidebarCollapsed || !hasSidebar ? ' is-sidebar-collapsed' : ''}`}>
          <div
            ref={contentRef}
            className="class-board-canvas__content"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) onClearSelection?.();
            }}
          >
            {renderContent()}
          </div>
          {hasSidebar ? (
            <aside className="class-board-canvas__sidebar">
              <button
                type="button"
                className="class-board-canvas__sidebar-toggle"
                aria-controls={sidebarId}
                aria-expanded={!sidebarCollapsed}
                onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
              >
                {sidebarCollapsed ? '📊 오늘 현황 펼치기' : '오늘 현황 접기'}
              </button>
              {!sidebarCollapsed ? <div id={sidebarId} className="class-board-canvas__sidebar-content">{renderSidebar()}</div> : null}
            </aside>
          ) : null}
        </div>
      </div>
    </div>
  );
}

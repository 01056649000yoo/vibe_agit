import React, { useEffect, useId, useMemo, useState } from 'react';
import { getClassBoardImageUrls } from '../classBoardImageApi';
import { getClassBoardWidget } from '../widgets/registry';
import InteractiveWidgetFrame from './InteractiveWidgetFrame';
import { WidgetHost } from './WidgetHost';

const EMPTY_URLS = new Map();

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
  onPlacementChange,
}) {
  const interactionEnabled = editable ?? !presentation;
  const [assetUrls, setAssetUrls] = useState(new Map());
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

  useEffect(() => {
    let active = true;
    if (imagePaths.length === 0) {
      return () => { active = false; };
    }
    void getClassBoardImageUrls(imagePaths)
      .then((urls) => { if (active) setAssetUrls(urls); })
      .catch(() => { if (active) setAssetUrls(new Map()); });
    return () => { active = false; };
  }, [imagePaths]);

  const renderContent = () => sortWidgets(board?.widgets || [], 'content').map((instance) => {
    const manifest = getClassBoardWidget(instance.widgetId);
    const selected = interactionEnabled && selectedInstanceId === instance.instanceId;
    return (
      <InteractiveWidgetFrame
        key={`${instance.instanceId}-${JSON.stringify(instance.placement)}`}
        instance={instance}
        manifest={manifest}
        classId={classId}
        assetUrl={(imagePaths.length > 0 ? assetUrls : EMPTY_URLS).get(instance.config?.path) || ''}
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
          assetUrl={(imagePaths.length > 0 ? assetUrls : EMPTY_URLS).get(instance.config?.path) || ''}
          presentation={presentation}
        />
    </div>
  ));

  return (
    <div className={`class-board-canvas${presentation ? ' is-presentation' : ''}${sidebarCollapsed || !hasSidebar ? ' is-sidebar-collapsed' : ''}`}>
      <div ref={contentRef} className="class-board-canvas__content">{renderContent()}</div>
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
  );
}

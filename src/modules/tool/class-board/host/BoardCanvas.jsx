import React, { useEffect, useMemo, useState } from 'react';
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

  const renderSidebar = () => sortWidgets(board?.widgets || [], 'sidebar').map((instance) => (
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
    <div className={`class-board-canvas${presentation ? ' is-presentation' : ''}`}>
      <div ref={contentRef} className="class-board-canvas__content">{renderContent()}</div>
      <aside className="class-board-canvas__sidebar">{renderSidebar()}</aside>
    </div>
  );
}

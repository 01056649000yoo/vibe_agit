import React, { useEffect, useMemo, useState } from 'react';
import { getClassBoardImageUrls } from '../classBoardImageApi';
import { getClassBoardWidget } from '../widgets/registry';
import { WidgetHost } from './WidgetHost';

const EMPTY_URLS = new Map();

const sortWidgets = (widgets, zone) => widgets
  .filter((widget) => widget.zone === zone && widget.visible !== false)
  .sort((left, right) => left.order - right.order || left.instanceId.localeCompare(right.instanceId));

export default function BoardCanvas({
  board,
  classId,
  presentation = false,
  selectedInstanceId = null,
  onSelect,
}) {
  const [assetUrls, setAssetUrls] = useState(new Map());
  const imagePaths = useMemo(() => (
    [...new Set((board?.widgets || []).map((widget) => widget?.config?.path).filter(Boolean))]
  ), [board?.widgets]);

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

  const renderZone = (zone) => sortWidgets(board?.widgets || [], zone).map((instance) => {
    const manifest = getClassBoardWidget(instance.widgetId);
    const selected = !presentation && selectedInstanceId === instance.instanceId;
    return (
      <div
        key={instance.instanceId}
        className={`class-board-widget-frame class-board-widget-frame--${instance.size}${selected ? ' is-selected' : ''}`}
      >
        {!presentation ? (
          <button type="button" className="class-board-widget-select" onClick={() => onSelect?.(instance.instanceId)}>
            <span>{manifest?.icon} {manifest?.name}</span>
            <small>{selected ? '설정 중' : '설정 열기'}</small>
          </button>
        ) : null}
        <WidgetHost
          instance={instance}
          classId={classId}
          assetUrl={(imagePaths.length > 0 ? assetUrls : EMPTY_URLS).get(instance.config?.path) || ''}
          presentation={presentation}
        />
      </div>
    );
  });

  return (
    <div className={`class-board-canvas${presentation ? ' is-presentation' : ''}`}>
      <div className="class-board-canvas__content">{renderZone('content')}</div>
      <aside className="class-board-canvas__sidebar">{renderZone('sidebar')}</aside>
    </div>
  );
}

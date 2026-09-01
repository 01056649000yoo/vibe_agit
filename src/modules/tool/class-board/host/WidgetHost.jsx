import React, { lazy, Suspense } from 'react';
import { getClassBoardWidgets } from '../widgets/registry';
import WidgetBoundary from './WidgetBoundary';

const entries = new Map(getClassBoardWidgets().map((manifest) => [
  manifest.id,
  {
    manifest,
    View: lazy(manifest.load),
    Settings: manifest.loadSettings ? lazy(manifest.loadSettings) : null,
  },
]));

export function WidgetHost({ instance, classId, assetUrl, presentation = false }) {
  const entry = entries.get(instance.widgetId);
  if (!entry || instance.visible === false) return null;
  const View = entry.View;
  return (
    <WidgetBoundary key={`${instance.instanceId}-${instance.version}`}>
      <Suspense fallback={<div className="class-board-widget-loading">위젯을 불러오는 중…</div>}>
        <View
          config={instance.config}
          classId={classId}
          assetUrl={assetUrl}
          presentation={presentation}
        />
      </Suspense>
    </WidgetBoundary>
  );
}

export function WidgetSettingsHost({ instance, classId, boardId, onChange }) {
  const entry = entries.get(instance?.widgetId);
  if (!entry?.Settings) return <p className="class-board-note">이 위젯에는 별도 설정이 없습니다.</p>;
  const Settings = entry.Settings;
  return (
    <WidgetBoundary key={`settings-${instance.instanceId}-${instance.version}`}>
      <Suspense fallback={<div className="class-board-widget-loading">설정을 불러오는 중…</div>}>
        <Settings config={instance.config} classId={classId} boardId={boardId} onChange={onChange} />
      </Suspense>
    </WidgetBoundary>
  );
}


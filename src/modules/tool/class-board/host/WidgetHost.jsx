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

export function WidgetHost({ instance, classId, assetUrl, presentation = false, dragHandleProps }) {
  const entry = entries.get(instance.widgetId);
  if (!entry || instance.visible === false) return null;
  const View = entry.View;
  return (
    <WidgetBoundary key={`${instance.instanceId}-${instance.version}`}>
      <Suspense fallback={<div className="class-board-widget-loading">위젯을 불러오는 중…</div>}>
        <View
          config={instance.config}
          /*
           * 위젯이 자기 것을 알아볼 수 있게 넘긴다. 타이머·스톱워치는 이 값으로 진행 상태를
           * 브라우저에 적어 두고, 화면을 옮기거나 전체 화면 탭에서 다시 그려도 이어 간다.
           */
          instanceId={instance.instanceId}
          classId={classId}
          assetUrl={assetUrl}
          presentation={presentation}
          dragHandleProps={dragHandleProps}
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

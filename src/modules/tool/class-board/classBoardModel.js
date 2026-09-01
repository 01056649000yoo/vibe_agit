import { getClassBoardWidget, getClassBoardWidgets } from './widgets/registry';
import { normalizePlacement } from './host/boardPlacement';

const randomId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const CLASS_BOARD_LAYOUT = Object.freeze({ version: 2, preset: 'freeform-7-3' });

export const createWidgetInstance = (widgetId, order = 10, placementIndex = 0) => {
  const manifest = getClassBoardWidget(widgetId);
  if (!manifest) throw new Error('지원하지 않는 위젯입니다.');
  const basePlacement = manifest.defaultPlacement.placement;
  const cascade = basePlacement ? Math.min(placementIndex, 6) * 2.5 : 0;
  return {
    instanceId: randomId(),
    widgetId: manifest.id,
    version: manifest.version,
    zone: manifest.defaultPlacement.zone,
    order,
    size: manifest.defaultPlacement.size,
    ...(basePlacement ? {
      placement: normalizePlacement({
        ...basePlacement,
        x: basePlacement.x + cascade,
        y: basePlacement.y + cascade,
      }, basePlacement),
    } : {}),
    visible: true,
    config: manifest.createDefaultConfig(),
  };
};

export const createDefaultClassBoard = (className = '') => ({
  id: null,
  title: `${className || '우리 반'} 오늘의 스크린`,
  layout: { ...CLASS_BOARD_LAYOUT },
  widgets: [
    createWidgetInstance('text', 10),
    createWidgetInstance('image', 20),
    createWidgetInstance('writing-status', 10),
  ],
  revision: null,
  isActive: true,
});

export const normalizeClassBoard = (board) => {
  let contentIndex = 0;
  const widgets = Array.isArray(board?.widgets)
    ? board.widgets.filter((widget) => Boolean(getClassBoardWidget(widget?.widgetId))).map((widget) => {
      const manifest = getClassBoardWidget(widget.widgetId);
      if (widget.zone !== 'content') return widget;
      const fallback = manifest.defaultPlacement.placement;
      const cascade = Math.min(contentIndex, 6) * 2.5;
      contentIndex += 1;
      return {
        ...widget,
        placement: normalizePlacement(widget.placement, {
          ...fallback,
          x: fallback.x + cascade,
          y: fallback.y + cascade,
        }),
      };
    })
    : [];
  return {
    ...board,
    layout: { ...CLASS_BOARD_LAYOUT },
    widgets,
  };
};

export const getAddableWidgets = (instances) => getClassBoardWidgets().filter((manifest) => (
  manifest.maxInstances === undefined
  || instances.filter((instance) => instance.widgetId === manifest.id).length < manifest.maxInstances
));

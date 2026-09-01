import { getClassBoardWidget, getClassBoardWidgets } from './widgets/registry';

const randomId = () => globalThis.crypto?.randomUUID?.()
  || `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const CLASS_BOARD_LAYOUT = Object.freeze({ version: 1, preset: 'split-8-4' });

export const createWidgetInstance = (widgetId, order = 10) => {
  const manifest = getClassBoardWidget(widgetId);
  if (!manifest) throw new Error('지원하지 않는 위젯입니다.');
  return {
    instanceId: randomId(),
    widgetId: manifest.id,
    version: manifest.version,
    zone: manifest.defaultPlacement.zone,
    order,
    size: manifest.defaultPlacement.size,
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

export const normalizeClassBoard = (board) => ({
  ...board,
  layout: board?.layout || { ...CLASS_BOARD_LAYOUT },
  widgets: Array.isArray(board?.widgets)
    ? board.widgets.filter((widget) => Boolean(getClassBoardWidget(widget?.widgetId)))
    : [],
});

export const getAddableWidgets = (instances) => getClassBoardWidgets().filter((manifest) => (
  manifest.maxInstances === undefined
  || instances.filter((instance) => instance.widgetId === manifest.id).length < manifest.maxInstances
));


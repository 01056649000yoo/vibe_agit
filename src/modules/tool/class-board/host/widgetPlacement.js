import { normalizeClassBoardTextBodySize } from '../widgets/text/textScale.js';

export const updateClassBoardWidgetPlacement = (board, instanceId, placement, metadata = {}) => {
  if (!board) return board;
  const textBodySize = normalizeClassBoardTextBodySize(metadata.textBodySize);
  return {
    ...board,
    widgets: board.widgets.map((widget) => {
      if (widget.instanceId !== instanceId) return widget;
      return {
        ...widget,
        placement,
        // 고른 크기(step) 글상자는 모서리로 끌어도 크기를 저장하지 않는다 — 상자에 맞춰 알아서 줄어든다.
        ...(widget.widgetId === 'text' && textBodySize && widget.config?.sizeMode !== 'step' ? {
          config: { ...widget.config, bodySize: textBodySize },
        } : {}),
      };
    }),
  };
};

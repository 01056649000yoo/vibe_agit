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
        ...(widget.widgetId === 'text' && textBodySize ? {
          config: { ...widget.config, bodySize: textBodySize },
        } : {}),
      };
    }),
  };
};

const sortLayerWidgets = (widgets, zone) => widgets
  .filter((widget) => widget.zone === zone && widget.visible !== false)
  .sort((left, right) => left.order - right.order || left.instanceId.localeCompare(right.instanceId));

export const getClassBoardWidgetLayerState = (board, instanceId) => {
  const selected = board?.widgets?.find((widget) => widget.instanceId === instanceId);
  if (!selected || selected.zone !== 'content') {
    return { position: 0, total: 0, canMoveBackward: false, canMoveForward: false };
  }
  const layers = sortLayerWidgets(board.widgets, selected.zone);
  const index = layers.findIndex((widget) => widget.instanceId === instanceId);
  return {
    position: index + 1,
    total: layers.length,
    canMoveBackward: index > 0,
    canMoveForward: index >= 0 && index < layers.length - 1,
  };
};

export const moveClassBoardWidgetLayer = (board, instanceId, direction) => {
  if (!board || ![-1, 1].includes(direction)) return board;
  const selected = board.widgets.find((widget) => widget.instanceId === instanceId);
  if (!selected || selected.zone !== 'content') return board;
  const layers = sortLayerWidgets(board.widgets, selected.zone);
  const index = layers.findIndex((widget) => widget.instanceId === instanceId);
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= layers.length) return board;

  const reordered = [...layers];
  const [moving] = reordered.splice(index, 1);
  reordered.splice(targetIndex, 0, moving);
  const orderById = new Map(reordered.map((widget, layerIndex) => [widget.instanceId, (layerIndex + 1) * 10]));
  return {
    ...board,
    widgets: board.widgets.map((widget) => (
      orderById.has(widget.instanceId) ? { ...widget, order: orderById.get(widget.instanceId) } : widget
    )),
  };
};

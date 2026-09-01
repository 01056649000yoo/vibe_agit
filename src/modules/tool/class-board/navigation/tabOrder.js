export const moveClassBoardTab = (items = [], sourceId, targetId) => {
  const sourceIndex = items.findIndex((item) => item.id === sourceId);
  const targetIndex = items.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return items;
  const next = [...items];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
};

export const sortClassBoards = (boards = []) => [...boards].sort((left, right) => (
  (Number(left?.displayOrder) || 0) - (Number(right?.displayOrder) || 0)
  || String(left?.id || '').localeCompare(String(right?.id || ''))
));

export const CLASS_BOARD_STAGE_WIDTH = 1600;
export const CLASS_BOARD_STAGE_HEIGHT = 900;

export const calculateClassBoardStageTransform = (width, height) => {
  const availableWidth = Math.max(0, Number(width) || 0);
  const availableHeight = Math.max(0, Number(height) || 0);
  if (availableWidth === 0 || availableHeight === 0) {
    return { scale: 0, x: 0, y: 0 };
  }
  const scale = Math.min(
    availableWidth / CLASS_BOARD_STAGE_WIDTH,
    availableHeight / CLASS_BOARD_STAGE_HEIGHT
  );
  return {
    scale,
    x: (availableWidth - CLASS_BOARD_STAGE_WIDTH * scale) / 2,
    y: (availableHeight - CLASS_BOARD_STAGE_HEIGHT * scale) / 2,
  };
};

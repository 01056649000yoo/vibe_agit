export const CLASS_BOARD_STAGE_WIDTH = 1600;
export const CLASS_BOARD_STAGE_HEIGHT = 900;

/*
 * 화면을 확대·축소하면 잰 값에 소수점 흔들림이 생긴다(2026-09-21 교사 제보 — 확대·축소하다
 * 보면 화면이 떨린다). `getBoundingClientRect()` 는 1234.4999… 같은 값을 주고, 그 값이
 * 렌더마다 미세하게 달라지면 ResizeObserver 가 계속 울린다. 그래서 두 겹으로 막는다.
 *   1) 재는 값을 정수로 끊는다(아래 `measureClassBoardStageSize`) — 소수점 아래 흔들림을 없앤다.
 *   2) 그래도 같은 값이면 상태를 갈아 끼우지 않는다(아래 `isSameClassBoardStageTransform`).
 *      ⚠️ 예전에는 잴 때마다 **새 객체**를 넣어, 값이 같아도 React 가 화면 전체를 다시 그렸다.
 *         스크린은 위젯을 모두 다시 그리므로 이것이 눈에 보이는 떨림이 된다.
 */
export const measureClassBoardStageSize = (rect) => ({
  width: Math.round(Number(rect?.width) || 0),
  height: Math.round(Number(rect?.height) || 0),
});

export const isSameClassBoardStageTransform = (a, b) => (
  !!a && !!b
  && a.scale === b.scale
  && a.x === b.x
  && a.y === b.y
);

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

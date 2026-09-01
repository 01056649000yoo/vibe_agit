export const CLASS_BOARD_STATUS_REFRESH_MS = 20_000;
export const CLASS_BOARD_STATUS_BACKOFF_MS = Object.freeze([30_000, 60_000, 120_000]);

export const getClassBoardStatusDelay = (failureCount) => (
  failureCount > 0
    ? CLASS_BOARD_STATUS_BACKOFF_MS[Math.min(failureCount - 1, CLASS_BOARD_STATUS_BACKOFF_MS.length - 1)]
    : CLASS_BOARD_STATUS_REFRESH_MS
);

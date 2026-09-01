export const CLASS_BOARD_MIN_WIDTH = 16;
export const CLASS_BOARD_MIN_HEIGHT = 16;

const round = (value) => Math.round(value * 10) / 10;
const clamp = (value, minimum, maximum) => Math.min(Math.max(value, minimum), maximum);

export const normalizePlacement = (placement = {}, fallback = {}) => {
  const width = clamp(Number(placement.width ?? fallback.width ?? 42), CLASS_BOARD_MIN_WIDTH, 100);
  const height = clamp(Number(placement.height ?? fallback.height ?? 36), CLASS_BOARD_MIN_HEIGHT, 100);
  return {
    x: round(clamp(Number(placement.x ?? fallback.x ?? 3), 0, 100 - width)),
    y: round(clamp(Number(placement.y ?? fallback.y ?? 4), 0, 100 - height)),
    width: round(width),
    height: round(height),
    pinned: Boolean(placement.pinned ?? fallback.pinned),
  };
};

export const movePlacementByPixels = (placement, deltaX, deltaY, bounds) => {
  const width = Math.max(1, bounds?.width || 1);
  const height = Math.max(1, bounds?.height || 1);
  return normalizePlacement({
    ...placement,
    x: placement.x + (deltaX / width) * 100,
    y: placement.y + (deltaY / height) * 100,
  }, placement);
};

export const resizePlacementByPixels = (placement, deltaX, deltaY, bounds, axis = 'both') => {
  const width = Math.max(1, bounds?.width || 1);
  const height = Math.max(1, bounds?.height || 1);
  const nextWidth = axis === 'y'
    ? placement.width
    : clamp(placement.width + (deltaX / width) * 100, CLASS_BOARD_MIN_WIDTH, 100 - placement.x);
  const nextHeight = axis === 'x'
    ? placement.height
    : clamp(placement.height + (deltaY / height) * 100, CLASS_BOARD_MIN_HEIGHT, 100 - placement.y);
  return normalizePlacement({ ...placement, width: nextWidth, height: nextHeight }, placement);
};


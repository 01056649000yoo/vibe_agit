export const TEXT_SCALE_OPTIONS = Object.freeze([
  { id: 'small', label: '작게', value: 0.8 },
  { id: 'normal', label: '보통', value: 1 },
  { id: 'large', label: '크게', value: 1.25 },
  { id: 'xlarge', label: '아주 크게', value: 1.5 },
]);

export const normalizeTextScale = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(1.5, Math.max(0.8, numeric));
};

const roundContainerUnit = (value) => Math.round(value * 1000) / 1000;

export const CLASS_BOARD_TEXT_HEADING_RATIO = 1.54;
export const CLASS_BOARD_TEXT_MIN_BODY_PX = 12;
export const CLASS_BOARD_TEXT_MAX_BODY_PX = 240;
export const CLASS_BOARD_TEXT_FIT_PRECISION_PX = 0.25;

export const getTextFillRatio = (value) => normalizeTextScale(value) / 1.5;

export const findLargestFittingTextSize = (
  fits,
  minimum = CLASS_BOARD_TEXT_MIN_BODY_PX,
  maximum = CLASS_BOARD_TEXT_MAX_BODY_PX,
  precision = CLASS_BOARD_TEXT_FIT_PRECISION_PX
) => {
  if (typeof fits !== 'function' || !fits(minimum)) return minimum;
  let lower = minimum;
  let upper = maximum;
  while (upper - lower > precision) {
    const candidate = (lower + upper) / 2;
    if (fits(candidate)) lower = candidate;
    else upper = candidate;
  }
  return Math.floor(lower / precision) * precision;
};

export const createResponsiveTextSize = (value, basePercent) => {
  const containerUnit = roundContainerUnit(normalizeTextScale(value) * basePercent);
  return `calc(${containerUnit}cqi + ${containerUnit}cqb)`;
};

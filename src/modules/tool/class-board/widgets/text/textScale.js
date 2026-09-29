export const normalizeTextScale = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(1.5, Math.max(0.8, numeric));
};

const roundContainerUnit = (value) => Math.round(value * 1000) / 1000;

export const CLASS_BOARD_TEXT_HEADING_RATIO = 1.54;
export const CLASS_BOARD_TEXT_MIN_BODY_PX = 12;
export const CLASS_BOARD_TEXT_MAX_BODY_PX = 900;
export const CLASS_BOARD_TEXT_FIT_PRECISION_PX = 0.25;

export const normalizeClassBoardTextBodySize = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  return Math.min(
    CLASS_BOARD_TEXT_MAX_BODY_PX,
    Math.max(CLASS_BOARD_TEXT_MIN_BODY_PX, Math.round(numeric * 4) / 4)
  );
};

export const shouldRefitClassBoardText = (_resizeAxis, force = false) => force;

export const findLargestFittingTextSize = (
  fits,
  minimum = CLASS_BOARD_TEXT_MIN_BODY_PX,
  maximum = 240,
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

/*
 * 글씨 크기 방식 (2026-09-29 선생님 제보 — 처음에 글씨가 너무 컸다가 상자를 줄여야 작아진다).
 *
 * - `step`(새 글상자 기본): 고른 계단 크기로 쓰고, 상자를 넘칠 때만 줄인다. 상자를 다시 키우면
 *   고른 크기까지만 돌아온다. 크기는 1600×900 논리 캔버스 기준 px 이다.
 * - `fill`: 상자에 꽉 차는 가장 큰 크기(2026-09-01 부터의 방식). `sizeMode` 가 없는 옛 글상자도
 *   이 방식으로 보여 만들어 둔 화면이 바뀌지 않는다.
 */
export const CLASS_BOARD_TEXT_SIZE_STEPS = Object.freeze([
  Object.freeze({ id: 'small', label: '작게', bodyPx: 28 }),
  Object.freeze({ id: 'medium', label: '보통', bodyPx: 36 }),
  Object.freeze({ id: 'large', label: '크게', bodyPx: 48 }),
  Object.freeze({ id: 'xlarge', label: '아주 크게', bodyPx: 64 }),
]);
export const CLASS_BOARD_TEXT_DEFAULT_STEP = 'large';

export const resolveClassBoardTextSizing = (config = {}) => {
  if (config?.sizeMode !== 'step') return { mode: 'fill', targetPx: null };
  const step = CLASS_BOARD_TEXT_SIZE_STEPS.find((item) => item.id === config.sizeStep)
    || CLASS_BOARD_TEXT_SIZE_STEPS.find((item) => item.id === CLASS_BOARD_TEXT_DEFAULT_STEP);
  return { mode: 'step', stepId: step.id, targetPx: step.bodyPx };
};

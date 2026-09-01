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

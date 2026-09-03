/*
 * 급식 이름을 몇 열로 세울지. 화면·설정창·저장 검증이 이 목록 하나를 함께 쓴다.
 *
 * 열이 적을수록 한 칸이 넓어져 글씨가 더 커진다. 반찬이 적은 날은 2열, 많은 날은 3열이
 * 보기 좋아 교사가 고른다. 저장 검증(20261227)도 여기 있는 값만 받는다.
 */

export const MEAL_COLUMN_CHOICES = Object.freeze([
  Object.freeze({ value: '2', label: '2열 (글씨 큼)' }),
  Object.freeze({ value: '3', label: '3열 (반찬 많을 때)' }),
]);

export const DEFAULT_MEAL_COLUMNS = '2';

export const normalizeMealColumns = (value) => (
  MEAL_COLUMN_CHOICES.some((choice) => choice.value === String(value))
    ? String(value)
    : DEFAULT_MEAL_COLUMNS
);

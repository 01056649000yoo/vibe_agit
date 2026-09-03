/*
 * 급식 이름을 몇 열로 세울지. 화면·설정창·저장 검증이 이 목록 하나를 함께 쓴다.
 *
 * 급식 이름 아래에 알레르기 줄이 붙기 때문에, 열을 줄이면 칸은 넓어지지만 줄 수가 늘어
 * 오히려 글씨가 작아지기도 한다. 어느 쪽이 잘 보이는지는 그날 메뉴에 달려서 교사가 고른다.
 * 저장 검증(20261229)도 여기 있는 값만 받는다.
 */

export const MEAL_COLUMN_CHOICES = Object.freeze([
  Object.freeze({ value: '2', label: '2열' }),
  Object.freeze({ value: '3', label: '3열' }),
]);

export const DEFAULT_MEAL_COLUMNS = '2';

export const normalizeMealColumns = (value) => (
  MEAL_COLUMN_CHOICES.some((choice) => choice.value === String(value))
    ? String(value)
    : DEFAULT_MEAL_COLUMNS
);

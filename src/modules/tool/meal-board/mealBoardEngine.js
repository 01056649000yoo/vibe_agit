// 서울 기준 오늘과 `9월 2일 화요일` 표기는 급식판·알림장이 함께 쓰므로 src/utils/seoulDate.js가 원본이다.
// 급식 쪽 이름은 부르는 곳이 많아 그대로 두고 여기서 다시 내보낸다.
import { formatSeoulDate, getSeoulDateString } from '../../../utils/seoulDate.js';

export { getSeoulDateString };
export const formatMealDate = formatSeoulDate;

export function summarizeRoster(students = []) {
  return (Array.isArray(students) ? students : []).reduce((summary, student) => {
    summary.total += 1;
    if (String(student?.note || '').trim()) summary.withNote += 1;
    else summary.withoutNote += 1;
    return summary;
  }, { total: 0, withNote: 0, withoutNote: 0 });
}

/**
 * 전체화면 급식판의 보기 설정.
 *
 * 교실마다 프로젝터 크기와 뒷자리까지의 거리가 달라 "알맞은 글자 크기"가 하나로 정해지지 않는다.
 * 그래서 선생님이 직접 고르고, 고른 값은 그 브라우저에 남겨 다음에 열 때 그대로 쓴다.
 * 화면에 어떻게 보일지에 대한 취향일 뿐이라 DB 가 아니라 브라우저에 저장한다.
 */
export const MEAL_VIEW_STORAGE_KEY = 'meal-fullscreen-view-v1';

/** 글자 크기 단계. scale 은 기본 크기에 곱하는 값이다. */
export const MEAL_TEXT_STEPS = [
  { id: 'normal', label: '보통', scale: 1 },
  { id: 'large', label: '크게', scale: 1.15 },
  { id: 'xlarge', label: '더 크게', scale: 1.3 },
  { id: 'xxlarge', label: '가장 크게', scale: 1.5 }
];

export const MEAL_COLUMN_OPTIONS = [2, 3];

export const DEFAULT_MEAL_VIEW = { textStep: 'normal', columns: 3 };

/** 저장된 값이 깨졌거나 예전 판이어도 화면이 망가지지 않게 기본값으로 되돌린다. */
export function normalizeMealView(value) {
  const source = value && typeof value === 'object' ? value : {};
  const step = MEAL_TEXT_STEPS.find((option) => option.id === source.textStep);
  const columns = Number(source.columns);
  return {
    textStep: step ? step.id : DEFAULT_MEAL_VIEW.textStep,
    columns: MEAL_COLUMN_OPTIONS.includes(columns) ? columns : DEFAULT_MEAL_VIEW.columns
  };
}

export function mealTextScale(textStep) {
  const step = MEAL_TEXT_STEPS.find((option) => option.id === textStep);
  return step ? step.scale : 1;
}

const normalizeSchoolMatchKey = (value) => String(value || '')
  .trim()
  .replace(/\s+/g, '')
  .replace(/초등학교$/, '초')
  .toLocaleLowerCase('ko-KR');

export function findUniqueSchoolMatch(schoolName, schools = []) {
  const target = normalizeSchoolMatchKey(schoolName);
  if (!target) return null;
  const matches = (Array.isArray(schools) ? schools : [])
    .filter((school) => normalizeSchoolMatchKey(school?.schoolName) === target);
  return matches.length === 1 ? matches[0] : null;
}

export function schoolSelectionFromWorkspace(school) {
  if (!school?.officeCode || !school?.schoolCode) return null;
  return {
    officeCode: String(school.officeCode),
    schoolCode: String(school.schoolCode),
    schoolName: String(school.schoolName || ''),
    address: String(school.address || ''),
    region: '',
    schoolKind: '초등학교'
  };
}

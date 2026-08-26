const SEOUL_TIME_ZONE = 'Asia/Seoul';

export function getSeoulDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function formatMealDate(dateString) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateString || ''))) return '';
  const [year, month, day] = dateString.split('-').map(Number);
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: SEOUL_TIME_ZONE,
    month: 'long',
    day: 'numeric',
    weekday: 'long'
  }).format(new Date(Date.UTC(year, month - 1, day, 3)));
}

export function getMealAllergenCodes(meals = []) {
  return [...new Set(
    (Array.isArray(meals) ? meals : [])
      .flatMap((meal) => Array.isArray(meal?.dishes) ? meal.dishes : [])
      .flatMap((dish) => Array.isArray(dish?.allergenCodes) ? dish.allergenCodes : [])
      .map(Number)
      .filter((code) => Number.isInteger(code) && code >= 1 && code <= 19)
  )].sort((a, b) => a - b);
}

export function getStudentMealMatches(student, mealCodes) {
  const mealSet = mealCodes instanceof Set ? mealCodes : new Set(mealCodes || []);
  return (Array.isArray(student?.allergenCodes) ? student.allergenCodes : [])
    .map(Number)
    .filter((code) => mealSet.has(code));
}

export function summarizeRoster(students = [], mealCodes = []) {
  const mealSet = new Set(mealCodes);
  return (Array.isArray(students) ? students : []).reduce((summary, student) => {
    const matches = getStudentMealMatches(student, mealSet);
    summary.total += 1;
    if (student.confirmationStatus === 'unconfirmed') summary.unconfirmed += 1;
    if (student.confirmationStatus === 'confirmed_none') summary.confirmedNone += 1;
    if (student.confirmationStatus === 'has_items') summary.hasItems += 1;
    if (matches.length > 0) summary.mealMatches += 1;
    return summary;
  }, { total: 0, unconfirmed: 0, confirmedNone: 0, hasItems: 0, mealMatches: 0 });
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

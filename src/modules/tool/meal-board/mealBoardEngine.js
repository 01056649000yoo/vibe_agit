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

export function summarizeRoster(students = []) {
  return (Array.isArray(students) ? students : []).reduce((summary, student) => {
    summary.total += 1;
    if (String(student?.note || '').trim()) summary.withNote += 1;
    else summary.withoutNote += 1;
    return summary;
  }, { total: 0, withNote: 0, withoutNote: 0 });
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

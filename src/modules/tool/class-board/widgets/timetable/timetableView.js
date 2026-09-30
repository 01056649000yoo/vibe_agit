import {
  isDayChanged,
  lastFilledPeriod,
  nextSchoolDay,
  normalizeCells,
  resolveTimetableDay,
  TIMETABLE_DAYS,
  weekStartOf,
  dayIndexOf,
  addDays,
} from '../../../class-timetable/timetableModel.js';

/*
 * 스크린 `시간표` 위젯이 무엇을 그릴지 정한다(화면 밖에서도 검사할 수 있게 순수 함수로).
 * weeks 는 서버에서 받은 주 목록(처음엔 이번 주·다음 주, 화살표로 옮기면 필요한 주가 더해진다).
 * today 는 'YYYY-MM-DD', hour 는 서울 시각의 시(0~23), shift 는 화살표로 옮긴 칸 수
 * (하루 보기는 수업일 단위, 이번 주 보기는 주 단위, 2026-09-30 선생님 요청 — 어제·그제·내일·모레를 바로 보기).
 * 아직 받지 않은 주가 필요하면 { kind: 'need-week', weekStart } 를 돌려준다 — 위젯이 그 주를 한 번 더 읽는다.
 */

const isSchoolDay = (date, includeSaturday) => {
  const index = dayIndexOf(date);
  return index <= 4 || (index === 5 && includeSaturday);
};

const weekOf = (weeks, date) => (Array.isArray(weeks) ? weeks : []).find((week) => week?.weekStart === weekStartOf(date)) || null;

/** 지난 수업일(주말·쉬는 토요일은 건너뛴다). */
const previousSchoolDay = (date, includeSaturday) => {
  let previous = addDays(date, -1);
  for (let guard = 0; guard < 7 && !isSchoolDay(previous, includeSaturday); guard += 1) previous = addDays(previous, -1);
  return previous;
};

/** 수업일 단위로 n칸 옮긴다(음수면 뒤로). */
export const moveSchoolDays = (date, steps, includeSaturday = false) => {
  let current = date;
  for (let index = 0; index < Math.abs(steps); index += 1) {
    current = steps > 0 ? nextSchoolDay(current, includeSaturday) : previousSchoolDay(current, includeSaturday);
  }
  return current;
};

const DAY_WORDS = Object.freeze({ '-2': '그제', '-1': '어제', 0: '오늘', 1: '내일', 2: '모레' });

/** 오늘과의 달력 날짜 차이로 부르는 말. 사흘 넘게 떨어지면 날짜만 보인다(빈 말). */
export const relativeDayWord = (today, date) => {
  const diff = Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${today}T00:00:00Z`)) / 86_400_000);
  return Object.prototype.hasOwnProperty.call(DAY_WORDS, String(diff)) ? Reflect.get(DAY_WORDS, String(diff)) : '';
};

/** 하루치: 그날 마지막 수업 교시까지, 없으면 안내. `바뀐 시간표`는 그날 칸이 실제로 바뀐 때만. */
const buildDay = (weeks, date, label) => {
  if (!weekOf(weeks, date)) return { kind: 'need-week', weekStart: weekStartOf(date), date, label };
  const day = resolveTimetableDay(weeks, date);
  if (!day?.hasTimetable) return { kind: 'empty', reason: 'no-timetable', date, label };
  const rows = lastFilledPeriod(day.cells);
  if (rows === 0) return { kind: 'empty', reason: 'no-class', date, label };
  const changed = Boolean(day.week.saved)
    && (isDayChanged(normalizeCells(day.week.cells), day.week.base?.cells || null, day.dayIndex)
      || Number(day.week.lunchAfter) !== Number(day.week.base?.lunchAfter));
  return { kind: 'day', date, label, cells: day.cells.slice(0, rows), rows, lunchAfter: day.lunchAfter, changed };
};

/** 오늘(쉬는 날이면 다음 수업일). */
const firstSchoolDay = (today, saturday) => (isSchoolDay(today, saturday)
  ? { date: today, label: '오늘' }
  : { date: nextSchoolDay(today, saturday), label: '다음 수업일' });

export const pickTimetableView = ({ view = 'auto', switchHour = 13, today, hour, weeks, shift = 0 }) => {
  if (!today) return { kind: 'empty', reason: 'loading' };
  const saturday = Boolean(weekOf(weeks, today)?.includeSaturday);
  const labelFor = (date, fallback) => (shift === 0 ? fallback : relativeDayWord(today, date));

  if (view === 'week') {
    // 주말(토요일 수업이 없는 토요일·일요일)에는 다음 주를 보여 준다. 화살표는 주 단위.
    const baseDate = isSchoolDay(today, saturday) || dayIndexOf(today) < 5 ? today : addDays(weekStartOf(today), 7);
    const weekStart = addDays(weekStartOf(baseDate), shift * 7);
    const week = weekOf(weeks, weekStart);
    if (!week) return { kind: 'need-week', weekStart };
    if (!week.cells) return { kind: 'empty', reason: 'no-timetable' };
    const cells = normalizeCells(week.cells);
    const days = week.includeSaturday ? TIMETABLE_DAYS : TIMETABLE_DAYS.slice(0, 5);
    const rows = Math.max(0, ...days.map((_, index) => lastFilledPeriod(cells.at(index))));
    return {
      kind: 'week',
      weekStart: week.weekStart,
      days,
      cells,
      rows,
      lunchAfter: Number(week.lunchAfter) || 4,
      todayIndex: week.weekStart === weekStartOf(today) ? dayIndexOf(today) : -1,
      changed: Boolean(week.saved),
    };
  }

  // 오늘·내일 한 번에(2026-09-30 선생님 요청). 오늘이 쉬는 날이면 다음 수업일과 그다음 수업일. 화살표는 둘을 함께 옮긴다.
  if (view === 'pair') {
    const start = firstSchoolDay(today, saturday);
    const firstDate = moveSchoolDays(start.date, shift, saturday);
    const secondDate = nextSchoolDay(firstDate, saturday);
    const firstLabel = labelFor(firstDate, start.label);
    const secondLabel = shift === 0
      ? (start.label === '오늘' && secondDate === addDays(today, 1) ? '내일' : '다음 수업일')
      : relativeDayWord(today, secondDate);
    const days = [buildDay(weeks, firstDate, firstLabel), buildDay(weeks, secondDate, secondLabel)];
    const missing = days.find((day) => day.kind === 'need-week');
    if (missing) return { kind: 'need-week', weekStart: missing.weekStart };
    if (days.every((day) => day.kind === 'empty' && day.reason === 'no-timetable')) {
      return { kind: 'empty', reason: 'no-timetable' };
    }
    return { kind: 'pair', days };
  }

  const wantsTomorrow = view === 'tomorrow' || (view === 'auto' && hour >= switchHour);
  let label = '오늘';
  let date = today;
  if (wantsTomorrow) {
    date = nextSchoolDay(today, saturday);
    label = date === addDays(today, 1) ? '내일' : '다음 수업일';
  } else if (!isSchoolDay(today, saturday)) {
    // 오늘이 쉬는 날이면 다음 수업일을 보여 준다.
    date = nextSchoolDay(today, saturday);
    label = '다음 수업일';
  }
  const moved = moveSchoolDays(date, shift, saturday);
  return buildDay(weeks, moved, labelFor(moved, label));
};

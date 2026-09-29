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
 * weeks 는 서버가 준 이번 주·다음 주. today 는 'YYYY-MM-DD', hour 는 서울 시각의 시(0~23).
 */

const isSchoolDay = (date, includeSaturday) => {
  const index = dayIndexOf(date);
  return index <= 4 || (index === 5 && includeSaturday);
};

const weekOf = (weeks, date) => (Array.isArray(weeks) ? weeks : []).find((week) => week?.weekStart === weekStartOf(date)) || null;

export const pickTimetableView = ({ view = 'auto', switchHour = 13, today, hour, weeks }) => {
  if (!today) return { kind: 'empty', reason: 'loading' };
  const saturday = Boolean(weekOf(weeks, today)?.includeSaturday);

  if (view === 'week') {
    // 주말(토요일 수업이 없는 토요일·일요일)에는 다음 주를 보여 준다.
    const date = isSchoolDay(today, saturday) || dayIndexOf(today) < 5 ? today : addDays(weekStartOf(today), 7);
    const week = weekOf(weeks, date);
    if (!week?.cells) return { kind: 'empty', reason: 'no-timetable' };
    const cells = normalizeCells(week.cells);
    const days = week.includeSaturday ? TIMETABLE_DAYS : TIMETABLE_DAYS.slice(0, 5);
    const rows = Math.max(0, ...days.map((_, index) => lastFilledPeriod(cells[index])));
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
  const day = resolveTimetableDay(weeks, date);
  if (!day?.hasTimetable) return { kind: 'empty', reason: 'no-timetable', date, label };
  const rows = lastFilledPeriod(day.cells);
  if (rows === 0) return { kind: 'empty', reason: 'no-class', date, label };
  // `바뀐 시간표` 표시는 그날 칸이 기초 시간표와 다를 때만 붙인다(그 주의 다른 요일만 바뀌었으면 붙이지 않음).
  const changed = Boolean(day.week.saved)
    && (isDayChanged(normalizeCells(day.week.cells), day.week.base?.cells || null, day.dayIndex)
      || Number(day.week.lunchAfter) !== Number(day.week.base?.lunchAfter));
  return { kind: 'day', date, label, cells: day.cells.slice(0, rows), rows, lunchAfter: day.lunchAfter, changed };
};

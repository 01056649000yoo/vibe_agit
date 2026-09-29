import { ALL_CURRICULUM_NAMES } from './curriculumSubjects.js';

/*
 * 학급 시간표의 규칙 — 도구 화면과 스크린 위젯이 같이 쓴다. 서버(20261357_class_timetable.sql)와 같은 약속:
 *   칸은 6일(월~토) × 8교시, 한 칸은 null 또는 { s: 과목(20자), m: 메모(30자) }.
 *   점심시간은 `lunchAfter` 교시 뒤(1~7). 교시 시각은 받지 않는다(선생님 결정).
 *   주는 월요일로 부른다(`YYYY-MM-DD`).
 */

export const TIMETABLE_PERIODS = 8;
export const TIMETABLE_DAYS = Object.freeze([
    Object.freeze({ id: 'mon', label: '월' }),
    Object.freeze({ id: 'tue', label: '화' }),
    Object.freeze({ id: 'wed', label: '수' }),
    Object.freeze({ id: 'thu', label: '목' }),
    Object.freeze({ id: 'fri', label: '금' }),
    Object.freeze({ id: 'sat', label: '토' }),
]);
export const MAX_SUBJECT_LENGTH = 20;
export const MAX_MEMO_LENGTH = 30;
export const DEFAULT_LUNCH_AFTER = 4;
export const LUNCH_AFTER_CHOICES = Object.freeze([1, 2, 3, 4, 5, 6, 7]);

export const createEmptyCells = () => Array.from({ length: TIMETABLE_DAYS.length }, () => Array(TIMETABLE_PERIODS).fill(null));

const cleanText = (value, max) => String(value ?? '').replace(/\s+/gu, ' ').trim().slice(0, max);

/** 한 칸을 서버 약속 모양으로. 과목·메모가 모두 비면 null. */
export const normalizeCell = (cell) => {
    if (!cell || typeof cell !== 'object') return null;
    const s = cleanText(cell.s, MAX_SUBJECT_LENGTH);
    const m = cleanText(cell.m, MAX_MEMO_LENGTH);
    if (!s && !m) return null;
    return m ? { s, m } : { s };
};

/** 어떤 모양이 와도 6 × 8 로 맞춘다. */
export const normalizeCells = (cells) => TIMETABLE_DAYS.map((_, day) => Array.from(
    { length: TIMETABLE_PERIODS },
    (_unused, period) => normalizeCell(Array.isArray(cells) && Array.isArray(cells[day]) ? cells[day][period] : null),
));

const cellAt = (cells, day, period) => (Array.isArray(cells) && Array.isArray(cells[day]) ? cells[day][period] ?? null : null);

export const setCell = (cells, day, period, value) => normalizeCells(cells).map((row, rowIndex) => (
    rowIndex === day ? row.map((cell, index) => (index === period ? normalizeCell(value) : cell)) : row
));

/** 칸 옮기기: 두 칸을 맞바꾼다(빈 칸으로 옮기면 옮겨진다). */
export const swapCells = (cells, from, to) => {
    const next = normalizeCells(cells);
    const source = cellAt(next, from.day, from.period);
    const target = cellAt(next, to.day, to.period);
    return setCell(setCell(next, from.day, from.period, target), to.day, to.period, source);
};

const cellKey = (cell) => {
    const normalized = normalizeCell(cell);
    return normalized ? `${normalized.s}\u0000${normalized.m || ''}` : '';
};

export const isCellChanged = (cells, base, day, period) => cellKey(cellAt(cells, day, period)) !== cellKey(cellAt(base, day, period));

/** 서버의 class_timetable_changed_cells 와 같은 셈. */
export const countChangedCells = (cells, base) => {
    let count = 0;
    for (let day = 0; day < TIMETABLE_DAYS.length; day += 1) {
        for (let period = 0; period < TIMETABLE_PERIODS; period += 1) {
            if (isCellChanged(cells, base, day, period)) count += 1;
        }
    }
    return count;
};

/** 그날 마지막으로 채운 교시(1부터). 비었으면 0. */
export const lastFilledPeriod = (dayCells) => {
    const list = Array.isArray(dayCells) ? dayCells : [];
    for (let index = TIMETABLE_PERIODS - 1; index >= 0; index -= 1) {
        if (normalizeCell(list[index])) return index + 1;
    }
    return 0;
};

/* ── 날짜 ─────────────────────────────────────────────────────────────────
 * 'YYYY-MM-DD' 를 UTC 자정으로 읽어 요일을 센다(기기 시간대와 무관하게 같은 답).
 */
const parse = (date) => new Date(`${date}T00:00:00Z`);
const format = (value) => value.toISOString().slice(0, 10);

export const addDays = (date, days) => {
    const value = parse(date);
    value.setUTCDate(value.getUTCDate() + days);
    return format(value);
};

/** 월=0 … 일=6 */
export const dayIndexOf = (date) => (parse(date).getUTCDay() + 6) % 7;

export const weekStartOf = (date) => addDays(date, -dayIndexOf(date));

/** 다음 수업일: 금요일 다음은 다음 주 월요일. 토요일 수업을 켜면 토요일도 수업일이다. */
export const nextSchoolDay = (date, includeSaturday = false) => {
    let next = addDays(date, 1);
    for (let guard = 0; guard < 7; guard += 1) {
        const index = dayIndexOf(next);
        if (index <= 4 || (index === 5 && includeSaturday)) return next;
        next = addDays(next, 1);
    }
    return next;
};

const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

export const formatTimetableDate = (date) => {
    const value = parse(date);
    return `${value.getUTCMonth() + 1}월 ${value.getUTCDate()}일 (${DAY_LABELS[dayIndexOf(date)]})`;
};

/** '9월 5주 · 9/28~10/2' 처럼. 주는 그 주 월요일이 든 달로 센다. */
export const formatWeekLabel = (weekStart) => {
    const start = parse(weekStart);
    const end = parse(addDays(weekStart, 4));
    const nth = Math.floor((start.getUTCDate() - 1) / 7) + 1;
    return `${start.getUTCMonth() + 1}월 ${nth}주 · ${start.getUTCMonth() + 1}/${start.getUTCDate()}~${end.getUTCMonth() + 1}/${end.getUTCDate()}`;
};

/** 서버가 준 주 목록에서 그 날짜가 든 주를 찾아 그날 칸을 꺼낸다. */
export const resolveTimetableDay = (weeks, date) => {
    const week = (Array.isArray(weeks) ? weeks : []).find((item) => item?.weekStart === weekStartOf(date));
    if (!week) return null;
    const dayIndex = dayIndexOf(date);
    const cells = normalizeCells(week.cells);
    return {
        date,
        dayIndex,
        week,
        lunchAfter: Number(week.lunchAfter) || DEFAULT_LUNCH_AFTER,
        cells: dayIndex <= 5 ? cells[dayIndex] : Array(TIMETABLE_PERIODS).fill(null),
        hasTimetable: Boolean(week.cells),
    };
};

/* ── 과목 ─────────────────────────────────────────────────────────────────── */

/** 학급 이름에서 학년을 짐작한다("3학년 1반" → 3). 모르면 null. */
export const guessGradeFromClassName = (name) => {
    const match = String(name || '').match(/([1-6])\s*학년/u);
    return match ? Number(match[1]) : null;
};

/** 칸에 쓰인 과목 중 교육과정 목록에 없는 것 = 선생님이 직접 적은 과목(단추로 남긴다). */
export const collectCustomSubjects = (...cellsList) => {
    const found = new Set();
    cellsList.forEach((cells) => normalizeCells(cells).forEach((row) => row.forEach((cell) => {
        if (cell?.s && !ALL_CURRICULUM_NAMES.has(cell.s)) found.add(cell.s);
    })));
    return [...found].sort((left, right) => left.localeCompare(right, 'ko'));
};

/*
 * 좁은 칸(스크린 `이번 주` 표)에서 쓰는 줄임말. 교실에서 흔히 부르는 말로 줄인다. 목록에 없으면 이름 그대로.
 */
const SHORT_SUBJECT_NAMES = Object.freeze({
    '창의적 체험활동': '창체',
    '자율·자치활동': '자율',
    동아리활동: '동아리',
    진로활동: '진로',
    '바른 생활': '바른',
    '슬기로운 생활': '슬기',
    '즐거운 생활': '즐거운',
});

export const shortSubjectName = (subject) => {
    const name = String(subject || '');
    return Object.prototype.hasOwnProperty.call(SHORT_SUBJECT_NAMES, name) ? Reflect.get(SHORT_SUBJECT_NAMES, name) : name;
};

/** 그 요일 칸이 기초 시간표와 다른가(주간 시간표에서 그날만 바뀌었는지 볼 때). */
export const isDayChanged = (cells, base, day) => {
    for (let period = 0; period < TIMETABLE_PERIODS; period += 1) {
        if (isCellChanged(cells, base, day, period)) return true;
    }
    return false;
};

/*
 * 과목 색. 교육과정 과목은 늘 같은 색, 직접 적은 과목은 이름으로 정해지는 색.
 * 값은 CSS 의 `.class-timetable-subject--N` (0~9)에 있다.
 */
const FIXED_SUBJECT_COLORS = Object.freeze({
    국어: 0, 수학: 1, 사회: 2, 과학: 3, 영어: 4, 체육: 5, 음악: 6, 미술: 7, 도덕: 8, 실과: 9,
    '바른 생활': 8, '슬기로운 생활': 3, '즐거운 생활': 6, '창의적 체험활동': 2,
    '자율·자치활동': 2, 동아리활동: 2, 진로활동: 2,
});

export const subjectColorIndex = (subject) => {
    const name = String(subject || '');
    if (Object.prototype.hasOwnProperty.call(FIXED_SUBJECT_COLORS, name)) return Reflect.get(FIXED_SUBJECT_COLORS, name);
    let hash = 0;
    for (const char of name) hash = (hash * 31 + char.codePointAt(0)) % 997;
    return hash % 10;
};

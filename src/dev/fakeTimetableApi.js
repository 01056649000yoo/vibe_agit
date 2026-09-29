import {
    addDays,
    countChangedCells,
    normalizeCells,
    setCell,
    createEmptyCells,
    weekStartOf,
} from '../modules/tool/class-timetable/timetableModel.js';

/*
 * 학급 시간표 실험실용 메모리 서버. 20261357_class_timetable.sql 과 같은 약속으로 움직인다:
 *   기초 시간표는 적용 시작 주마다 판, 주간 시간표는 그 주에만, 기초와 같으면 주간 줄을 두지 않음,
 *   칸 NULL 이면 되돌리기, 지난 기록은 최신순 20개. DB 없이 화면만 본다(저장은 이 탭 메모리에만).
 */

const clone = (value) => JSON.parse(JSON.stringify(value));

// 실험실은 `처음 상태로` 때 resetKey 를 바꿔 넘겨 새 서버를 만든다(값 자체는 쓰지 않는다).
export const createFakeTimetableApi = ({ today, scene = 'filled', latencyMs = 250 } = {}) => {
    const thisWeek = weekStartOf(today);
    const bases = new Map();
    const weeks = new Map();
    let failNext = scene === 'error';

    if (scene === 'filled' || scene === 'changed') {
        const plan = [
            ['국어', '수학', '과학', '체육', '영어', '창의적 체험활동'],
            ['수학', '국어', '사회', '음악', '미술', '미술'],
            ['국어', '영어', '수학', '도덕', '과학'],
            ['사회', '국어', '체육', '수학', '음악', '동아리활동'],
            ['과학', '과학', '국어', '수학', '체육'],
        ];
        let cells = createEmptyCells();
        plan.forEach((subjects, day) => subjects.forEach((s, period) => { cells = setCell(cells, day, period, { s }); }));
        bases.set(addDays(thisWeek, -28), { effectiveFrom: addDays(thisWeek, -28), grade: 3, lunchAfter: 4, includeSaturday: false, cells, updatedAt: `${thisWeek}T00:00:00Z` });
        if (scene === 'changed') {
            let changed = setCell(cells, 2, 4, { s: '생존수영', m: '외부강사 · 수영장' });
            changed = setCell(changed, 2, 5, { s: '생존수영', m: '외부강사 · 수영장' });
            weeks.set(thisWeek, { weekStart: thisWeek, lunchAfter: 4, includeSaturday: false, cells: changed, changedCells: 2, updatedAt: `${today}T01:00:00Z` });
            weeks.set(addDays(thisWeek, -14), { weekStart: addDays(thisWeek, -14), lunchAfter: 5, includeSaturday: false, cells, changedCells: 0, updatedAt: `${today}T01:00:00Z` });
        }
    }

    const baseFor = (week) => [...bases.values()]
        .filter((base) => base.effectiveFrom <= week)
        .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] || null;

    const resolve = (week) => {
        const base = baseFor(week);
        const saved = weeks.get(week) || null;
        return clone({
            weekStart: week,
            saved: Boolean(saved),
            updatedAt: saved?.updatedAt || null,
            changedCells: saved?.changedCells || 0,
            base,
            cells: saved?.cells || base?.cells || null,
            lunchAfter: saved?.lunchAfter || base?.lunchAfter || null,
            includeSaturday: saved?.includeSaturday ?? base?.includeSaturday ?? false,
        });
    };

    const respond = (build) => new Promise((resolvePromise, reject) => {
        window.setTimeout(() => {
            if (failNext) { failNext = false; reject(new Error('실험실: 일부러 낸 오류입니다.')); return; }
            resolvePromise({ version: 1, ...build() });
        }, latencyMs);
    });

    const latestBase = () => clone([...bases.values()].sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))[0] || null);

    return {
        get(_classId, weekStart = null, count = 1) {
            const start = weekStartOf(weekStart || today);
            return respond(() => ({
                today,
                thisWeek,
                latestBase: latestBase(),
                weeks: Array.from({ length: Math.min(Math.max(count, 1), 2) }, (_, index) => resolve(addDays(start, index * 7))),
            }));
        },
        saveBase(_classId, draft) {
            return respond(() => {
                const effectiveFrom = weekStartOf(draft.effectiveFrom || today);
                bases.set(effectiveFrom, { ...clone(draft), effectiveFrom, cells: normalizeCells(draft.cells), updatedAt: new Date().toISOString() });
                return { base: clone(bases.get(effectiveFrom)) };
            });
        },
        saveWeek(_classId, { weekStart, cells, lunchAfter = null, includeSaturday = null }) {
            return respond(() => {
                const week = weekStartOf(weekStart);
                if (cells === null) {
                    weeks.delete(week);
                    return { week: resolve(week) };
                }
                const base = baseFor(week);
                const lunch = lunchAfter || base?.lunchAfter || 4;
                const saturday = includeSaturday ?? base?.includeSaturday ?? false;
                const changedCells = countChangedCells(cells, base?.cells || null);
                if (base && changedCells === 0 && lunch === base.lunchAfter && saturday === base.includeSaturday) {
                    weeks.delete(week);
                } else {
                    weeks.set(week, { weekStart: week, lunchAfter: lunch, includeSaturday: saturday, cells: normalizeCells(cells), changedCells, updatedAt: new Date().toISOString() });
                }
                return { week: resolve(week) };
            });
        },
        getLog() {
            return respond(() => ({
                weeks: [...weeks.values()]
                    .sort((left, right) => right.weekStart.localeCompare(left.weekStart))
                    .slice(0, 20)
                    .map(({ weekStart, updatedAt, changedCells }) => ({ weekStart, updatedAt, changedCells })),
                nextCursor: null,
                bases: [...bases.values()]
                    .sort((left, right) => right.effectiveFrom.localeCompare(left.effectiveFrom))
                    .map(({ effectiveFrom, grade, lunchAfter, updatedAt }) => ({ effectiveFrom, grade, lunchAfter, updatedAt })),
            }));
        },
    };
};

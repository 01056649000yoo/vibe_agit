import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { timetableWidgetManifest } from '../src/modules/tool/class-board/widgets/timetable/manifest.js';
import {
    TIMETABLE_SWITCH_HOURS,
    TIMETABLE_WIDGET_TONES,
    TIMETABLE_WIDGET_VIEWS,
} from '../src/modules/tool/class-board/widgets/timetable/timetableWidgetOptions.js';
import { pickTimetableView } from '../src/modules/tool/class-board/widgets/timetable/timetableView.js';
import { createEmptyCells, setCell, shortSubjectName } from '../src/modules/tool/class-timetable/timetableModel.js';
import { CLASS_BOARD_TEXT_SIZE_STEPS } from '../src/modules/tool/class-board/widgets/text/textScale.js';

// 스크린 `시간표` 위젯(2026-09-29). 오늘·내일(다음 수업일)·이번 주·자동을 이번 주·다음 주 자료 한 번으로 그린다.

const base = (() => {
    let cells = createEmptyCells();
    ['국어', '수학', '과학', '체육', '영어'].forEach((s, day) => { cells = setCell(cells, day, 0, { s }); });
    cells = setCell(cells, 0, 1, { s: '음악' });
    return cells;
})();
const thisWeek = { weekStart: '2026-09-28', cells: base, lunchAfter: 1, includeSaturday: false, saved: false, base: { cells: base, lunchAfter: 1 } };
const nextWeek = { weekStart: '2026-10-05', cells: setCell(base, 0, 0, { s: '생존수영' }), lunchAfter: 1, includeSaturday: false, saved: true, base: { cells: base, lunchAfter: 1 } };
const weeks = [thisWeek, nextWeek];

test('오늘·내일·자동: 금요일 다음은 월요일, 쉬는 날은 다음 수업일, 그날 바뀐 칸이 있을 때만 `바뀐 시간표`', () => {
    const tuesday = pickTimetableView({ view: 'today', today: '2026-09-29', hour: 9, weeks });
    assert.equal(tuesday.kind, 'day');
    assert.equal(tuesday.label, '오늘');
    assert.equal(tuesday.cells[0].s, '수학');
    assert.equal(tuesday.changed, false);

    const friday = pickTimetableView({ view: 'tomorrow', today: '2026-10-02', hour: 9, weeks });
    assert.equal(friday.date, '2026-10-05');
    assert.equal(friday.label, '다음 수업일');
    assert.equal(friday.cells[0].s, '생존수영');
    assert.equal(friday.changed, true, '다음 주 월요일은 바뀐 날');

    const autoMorning = pickTimetableView({ view: 'auto', switchHour: 13, today: '2026-09-29', hour: 12, weeks });
    const autoAfternoon = pickTimetableView({ view: 'auto', switchHour: 13, today: '2026-09-29', hour: 13, weeks });
    assert.equal(autoMorning.date, '2026-09-29');
    assert.equal(autoAfternoon.date, '2026-09-30');
    assert.equal(autoAfternoon.label, '내일');

    const sunday = pickTimetableView({ view: 'today', today: '2026-10-04', hour: 9, weeks });
    assert.equal(sunday.date, '2026-10-05');
    assert.equal(sunday.label, '다음 수업일');
});

test('하루 시간표는 그날 마지막 수업 교시까지만, 시간표가 없거나 수업이 없으면 안내', () => {
    const monday = pickTimetableView({ view: 'today', today: '2026-09-28', hour: 9, weeks });
    assert.equal(monday.rows, 2);
    assert.equal(pickTimetableView({ view: 'today', today: '2026-09-29', hour: 9, weeks: [] }).reason, 'no-timetable');
    const emptyWeek = [{ ...thisWeek, cells: createEmptyCells() }];
    assert.equal(pickTimetableView({ view: 'today', today: '2026-09-29', hour: 9, weeks: emptyWeek }).reason, 'no-class');
});

test('이번 주: 주말에는 다음 주, 가장 늦게 끝나는 요일까지, 오늘 열 표시', () => {
    const week = pickTimetableView({ view: 'week', today: '2026-09-30', hour: 9, weeks });
    assert.equal(week.kind, 'week');
    assert.equal(week.weekStart, '2026-09-28');
    assert.equal(week.rows, 2);
    assert.equal(week.days.length, 5);
    assert.equal(week.todayIndex, 2);
    const weekend = pickTimetableView({ view: 'week', today: '2026-10-03', hour: 9, weeks });
    assert.equal(weekend.weekStart, '2026-10-05');
    assert.equal(weekend.todayIndex, -1);
    assert.equal(shortSubjectName('창의적 체험활동'), '창체');
    assert.equal(shortSubjectName('생존수영'), '생존수영');
});

test('위젯 설정 허용값은 화면과 서버(validate_class_board_payload_v1, 20261357)가 같다', () => {
    const sql = readFileSync('supabase/migrations/20261357_class_timetable.sql', 'utf8');
    const views = TIMETABLE_WIDGET_VIEWS.map((item) => `'${item.id}'`).join(', ');
    assert.ok(sql.includes(`NOT IN (${views})`), `서버 보기 목록: ${views}`);
    assert.ok(sql.includes(`IN (${TIMETABLE_SWITCH_HOURS.join(', ')})`), '서버 넘길 시각 목록');
    const tones = TIMETABLE_WIDGET_TONES.map((item) => `'${item.id}'`).join(', ');
    assert.ok(sql.includes(`NOT IN (${tones})`), `서버 색 목록: ${tones}`);
    assert.match(sql, new RegExp(`v_timetable_count > ${timetableWidgetManifest.maxInstances}`), '위젯 개수 상한');
    const created = timetableWidgetManifest.createDefaultConfig();
    assert.ok(TIMETABLE_WIDGET_VIEWS.some((item) => item.id === created.view));
    assert.ok(TIMETABLE_SWITCH_HOURS.includes(created.switchHour));
    assert.ok(TIMETABLE_WIDGET_TONES.some((item) => item.id === created.tone));
    // 글상자 글씨 크기 계단도 서버 검사와 같다(v1.16 에서 생긴 칸을 20261357 이 검사한다).
    const steps = CLASS_BOARD_TEXT_SIZE_STEPS.map((step) => `'${step.id}'`).join(', ');
    assert.ok(sql.includes(`NOT IN (${steps})`), `서버 글씨 계단: ${steps}`);
    // 위젯은 열 때 한 번만 읽는다(이번 주·다음 주 함께).
    assert.deepEqual(timetableWidgetManifest.requestBudget, { initial: 1, refreshMs: null, realtime: false, maxRows: 2 });
    const widget = readFileSync('src/modules/tool/class-board/widgets/timetable/TimetableWidget.jsx', 'utf8');
    assert.match(widget, /api\.get\(classId, null, 2\)/);
    assert.equal((widget.match(/api\.get\(/g) || []).length, 1, '다시 묻지 않는다');
});

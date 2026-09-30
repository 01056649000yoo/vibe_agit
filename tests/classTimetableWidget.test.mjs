import assert from 'node:assert/strict';
import test from 'node:test';
import { readdirSync, readFileSync } from 'node:fs';
import { timetableWidgetManifest } from '../src/modules/tool/class-board/widgets/timetable/manifest.js';
import {
    TIMETABLE_SWITCH_HOURS,
    TIMETABLE_WIDGET_TONES,
    TIMETABLE_WIDGET_VIEWS,
} from '../src/modules/tool/class-board/widgets/timetable/timetableWidgetOptions.js';
import { moveSchoolDays, pickTimetableView, relativeDayWord } from '../src/modules/tool/class-board/widgets/timetable/timetableView.js';
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
    assert.equal(pickTimetableView({ view: 'today', today: '2026-09-29', hour: 9, weeks: [{ weekStart: '2026-09-28', cells: null }, { weekStart: '2026-10-05', cells: null }] }).reason, 'no-timetable');
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

test('오늘·내일 한 번에: 오늘과 다음 수업일, 쉬는 날이면 다음 수업일과 그다음 수업일', () => {
    const tuesday = pickTimetableView({ view: 'pair', today: '2026-09-29', hour: 9, weeks });
    assert.equal(tuesday.kind, 'pair');
    assert.deepEqual(tuesday.days.map((day) => [day.label, day.date]), [['오늘', '2026-09-29'], ['내일', '2026-09-30']]);
    const friday = pickTimetableView({ view: 'pair', today: '2026-10-02', hour: 9, weeks });
    assert.deepEqual(friday.days.map((day) => [day.label, day.date]), [['오늘', '2026-10-02'], ['다음 수업일', '2026-10-05']]);
    assert.equal(friday.days[1].changed, true, '월요일은 바뀐 날');
    const sunday = pickTimetableView({ view: 'pair', today: '2026-10-04', hour: 9, weeks });
    assert.deepEqual(sunday.days.map((day) => [day.label, day.date]), [['다음 수업일', '2026-10-05'], ['다음 수업일', '2026-10-06']]);
    assert.equal(pickTimetableView({ view: 'pair', today: '2026-09-29', hour: 9, weeks: [{ weekStart: '2026-09-28', cells: null }, { weekStart: '2026-10-05', cells: null }] }).reason, 'no-timetable');
});

test('화살표: 수업일 단위로 어제·그제·내일·모레, 이번 주는 주 단위, 받지 않은 주는 need-week', () => {
    // 화요일에서 뒤로 한 칸 = 월요일(어제), 두 칸 = 지난 금요일(받지 않은 주)
    const yesterday = pickTimetableView({ view: 'today', today: '2026-09-29', hour: 9, weeks, shift: -1 });
    assert.equal(yesterday.date, '2026-09-28');
    assert.equal(yesterday.label, '어제');
    assert.deepEqual(pickTimetableView({ view: 'today', today: '2026-09-29', hour: 9, weeks, shift: -2 }), { kind: 'need-week', weekStart: '2026-09-21', date: '2026-09-25', label: '' });
    const dayAfter = pickTimetableView({ view: 'today', today: '2026-09-29', hour: 9, weeks, shift: 2 });
    assert.equal(dayAfter.date, '2026-10-01');
    assert.equal(dayAfter.label, '모레');
    // 금요일에서 앞으로 한 칸 = 다음 주 월요일(주말 건넘), 사흘 뒤라 날짜만
    const monday = pickTimetableView({ view: 'today', today: '2026-10-02', hour: 9, weeks, shift: 1 });
    assert.equal(monday.date, '2026-10-05');
    assert.equal(monday.label, '');
    assert.equal(pickTimetableView({ view: 'week', today: '2026-09-30', hour: 9, weeks, shift: 1 }).weekStart, '2026-10-05');
    assert.deepEqual(pickTimetableView({ view: 'week', today: '2026-09-30', hour: 9, weeks, shift: -1 }), { kind: 'need-week', weekStart: '2026-09-21' });
    const pair = pickTimetableView({ view: 'pair', today: '2026-09-29', hour: 9, weeks, shift: 1 });
    assert.deepEqual(pair.days.map((day) => [day.label, day.date]), [['내일', '2026-09-30'], ['모레', '2026-10-01']]);
    assert.equal(relativeDayWord('2026-09-29', '2026-09-27'), '그제');
    assert.equal(moveSchoolDays('2026-10-05', -1), '2026-10-02');
});

test('하루치 글씨는 공용 맞춤 부품이 가로·세로에 맞추고, 넓은 위젯은 교시를 두 줄로 나눈다', () => {
    const widget = readFileSync('src/modules/tool/class-board/widgets/timetable/TimetableWidget.jsx', 'utf8');
    const css = readFileSync('src/modules/tool/class-board/widgets/timetable/timetableWidget.css', 'utf8');
    assert.match(widget, /useFittedWidgetBox\(fitSignature, \{\s*property: '--timetable-text-size',\s*minSize: MIN_TEXT_PX,/);
    assert.match(widget, /const MIN_TEXT_PX = 12\.8;/, '글자 바닥 0.8rem');
    assert.match(css, /\.class-board-timetable__day li \{[^}]*font-size:var\(--timetable-text-size/);
    // 한 줄·두 줄(이틀은 좌우·위아래)을 모두 재 보고 글씨가 더 크게 나오는 배치를 고른다(공용 부품의 layouts).
    assert.match(widget, /layouts: view\?\.kind === 'pair' \? 'side,stack,side-two,stack-two' : 'one,two'/);
    assert.match(css, /\[data-fit-layout="two"\]>\.class-board-timetable__day \{[^}]*grid-auto-flow:column/);
    assert.match(css, /\.class-board-timetable__pair\[data-fit-layout\^="stack"\]/);
    assert.match(css, /\.class-board-timetable__pair\[data-fit-layout\$="-two"\] \.class-board-timetable__day \{[^}]*grid-auto-flow:column/);
    const hook = readFileSync('src/modules/tool/class-board/widgets/useFittedWidgetBox.js', 'utf8');
    assert.match(hook, /candidates\.forEach\(\(layout\) => \{\s*element\.dataset\.fitLayout = layout;[\s\S]*if \(size > best\.size\)/);
    // 넘침을 가리면 맞춤 부품이 넘친 줄 모른다 — 과목 칸에 줄임표·넘침 숨김을 두지 않는다.
    assert.doesNotMatch(css, /\.class-board-timetable__day li>strong \{[^}]*(overflow:hidden|text-overflow)/);
});

// 스크린 저장 검사 함수(validate_class_board_payload_v1)를 정의한 가장 최근 마이그레이션.
const latestValidatorSql = () => {
    const files = readdirSync('supabase/migrations').filter((file) => file.endsWith('.sql')).sort().reverse();
    for (const file of files) {
        const sql = readFileSync(`supabase/migrations/${file}`, 'utf8');
        if (sql.includes('FUNCTION public.validate_class_board_payload_v1(')) return sql;
    }
    throw new Error('검사 함수 정의가 없습니다');
};

test('위젯 설정 허용값은 화면과 서버(가장 최근 validate_class_board_payload_v1)가 같다', () => {
    const sql = latestValidatorSql();
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
    // 처음 한 번(이번 주·다음 주) + 화살표로 그 밖의 주에 갈 때 그 주만 한 번(읽은 주는 기억).
    assert.equal((widget.match(/api\.get\(/g) || []).length, 2);
    assert.match(widget, /api\.get\(classId, neededWeek, 1\)/);
    assert.match(widget, /requestedWeeksRef\.current\.has\(neededWeek\)/, '읽은 주는 다시 묻지 않는다');
    assert.doesNotMatch(widget, /setInterval\([^)]*api/, '주기적으로 다시 묻지 않는다');
});

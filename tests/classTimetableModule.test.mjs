import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { validateManifest } from '../src/modules/types.js';
import { classTimetableManifest } from '../src/modules/tool/class-timetable/manifest.js';
import {
    CREATIVE_ACTIVITY_AREAS,
    CURRICULUM_SUBJECTS,
    subjectsForGrade,
} from '../src/modules/tool/class-timetable/curriculumSubjects.js';
import {
    addDays,
    collectCustomSubjects,
    countChangedCells,
    createEmptyCells,
    dayIndexOf,
    formatWeekLabel,
    guessGradeFromClassName,
    lastFilledPeriod,
    MAX_SUBJECT_LENGTH,
    nextSchoolDay,
    normalizeCells,
    resolveTimetableDay,
    setCell,
    subjectColorIndex,
    swapCells,
    TIMETABLE_DAYS,
    TIMETABLE_PERIODS,
    weekStartOf,
} from '../src/modules/tool/class-timetable/timetableModel.js';

// 2026-09-29 선생님 요청: 기초 시간표를 입력해 두고 스크린에서 오늘·내일·이번 주를 보고, 주마다 바꾼 것은 기록으로 남긴다.

test('class-timetable: 설정 규칙을 지키고 레지스트리에 있으며 학급운영도구에 공개된다', () => {
    assert.deepEqual(validateManifest(classTimetableManifest), []);
    const registry = readFileSync('src/modules/registry.js', 'utf8');
    assert.ok(registry.includes("'./tool/class-timetable/manifest'") && registry.split('classTimetableManifest').length - 1 >= 2, '레지스트리에 없습니다.');
    assert.equal(classTimetableManifest.name, '학급 시간표 관리');
    assert.equal(classTimetableManifest.part, 'tool');
    assert.equal(classTimetableManifest.available, true);
    assert.equal(classTimetableManifest.performance.realtime, 'none');
    assert.ok(classTimetableManifest.performance.maxInitialRows <= 20);
});

test('과목 이름은 2022 개정 교육과정 — 1~2학년 통합교과, 5~6학년 실과, 창체 영역', () => {
    assert.deepEqual([...subjectsForGrade(1)], ['국어', '수학', '바른 생활', '슬기로운 생활', '즐거운 생활', '창의적 체험활동']);
    assert.deepEqual(subjectsForGrade(2), subjectsForGrade(1));
    assert.ok(!subjectsForGrade(4).includes('실과'));
    assert.ok(subjectsForGrade(5).includes('실과') && subjectsForGrade(6).includes('실과'));
    assert.equal(subjectsForGrade(5).indexOf('실과'), subjectsForGrade(5).indexOf('과학') + 1, '실과는 과학 다음');
    for (const grade of [3, 5]) {
        for (const name of ['국어', '사회', '도덕', '수학', '과학', '체육', '음악', '미술', '영어', '창의적 체험활동']) {
            assert.ok(subjectsForGrade(grade).includes(name), `${grade}학년 ${name}`);
        }
    }
    assert.deepEqual([...CREATIVE_ACTIVITY_AREAS], ['자율·자치활동', '동아리활동', '진로활동']);
    const all = [...CURRICULUM_SUBJECTS.lower, ...CURRICULUM_SUBJECTS.upper, ...CREATIVE_ACTIVITY_AREAS];
    assert.ok(all.every((name) => name.length <= MAX_SUBJECT_LENGTH), '서버 과목 상한(20자) 안');
});

test('칸은 6일 × 8교시, 빈 칸은 null, 서버와 같은 글자 상한', () => {
    const cells = normalizeCells(null);
    assert.equal(cells.length, TIMETABLE_DAYS.length);
    assert.ok(cells.every((row) => row.length === TIMETABLE_PERIODS && row.every((cell) => cell === null)));
    const filled = setCell(cells, 0, 0, { s: '  국어  ', m: '' });
    assert.deepEqual(filled[0][0], { s: '국어' }, '앞뒤 빈칸을 자르고 빈 메모는 빼기');
    assert.equal(setCell(filled, 0, 0, { s: '', m: '' })[0][0], null);
    assert.equal(setCell(cells, 1, 2, { s: '가'.repeat(30) })[1][2].s.length, 20);
});

test('칸끼리 끌면 바뀌고, 바꾼 칸 수는 서버와 같게 센다', () => {
    let cells = setCell(createEmptyCells(), 0, 0, { s: '국어' });
    cells = setCell(cells, 0, 1, { s: '수학' });
    const swapped = swapCells(cells, { day: 0, period: 0 }, { day: 0, period: 1 });
    assert.equal(swapped[0][0].s, '수학');
    assert.equal(swapped[0][1].s, '국어');
    assert.equal(countChangedCells(swapped, cells), 2);
    const moved = swapCells(cells, { day: 0, period: 0 }, { day: 2, period: 5 });
    assert.equal(moved[0][0], null, '빈 칸으로 옮기면 옮겨진다');
    assert.equal(moved[2][5].s, '국어');
    assert.equal(countChangedCells(cells, null), 2, '기초가 없으면 채운 칸이 모두 바뀐 칸');
    assert.equal(countChangedCells(setCell(cells, 0, 0, { s: '국어', m: '강당' }), cells), 1, '메모만 달라도 바뀐 칸');
});

test('주는 월요일, 내일은 다음 수업일(금 → 월, 토요일 수업이면 금 → 토)', () => {
    assert.equal(weekStartOf('2026-10-01'), '2026-09-28'); // 목 → 월
    assert.equal(weekStartOf('2026-09-28'), '2026-09-28');
    assert.equal(weekStartOf('2026-10-04'), '2026-09-28'); // 일 → 그 주 월
    assert.equal(dayIndexOf('2026-09-28'), 0);
    assert.equal(dayIndexOf('2026-10-04'), 6);
    assert.equal(nextSchoolDay('2026-10-01'), '2026-10-02');
    assert.equal(nextSchoolDay('2026-10-02'), '2026-10-05', '금요일 다음은 월요일');
    assert.equal(nextSchoolDay('2026-10-02', true), '2026-10-03', '토요일 수업');
    assert.equal(nextSchoolDay('2026-10-03'), '2026-10-05');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(formatWeekLabel('2026-09-28'), '9월 4주 · 9/28~10/2');
});

test('그날 시간표 꺼내기·마지막 교시·학년 짐작·직접 적은 과목·과목 색', () => {
    const cells = setCell(setCell(createEmptyCells(), 2, 0, { s: '국어' }), 2, 4, { s: '생존수영', m: '외부강사' });
    const weeks = [{ weekStart: '2026-09-28', cells, lunchAfter: 5 }];
    const wednesday = resolveTimetableDay(weeks, '2026-09-30');
    assert.equal(wednesday.cells[0].s, '국어');
    assert.equal(wednesday.lunchAfter, 5);
    assert.equal(lastFilledPeriod(wednesday.cells), 5);
    assert.equal(resolveTimetableDay(weeks, '2026-10-05'), null, '받지 않은 주');
    assert.equal(guessGradeFromClassName('3학년 1반'), 3);
    assert.equal(guessGradeFromClassName('무지개반'), null);
    assert.deepEqual(collectCustomSubjects(cells), ['생존수영']);
    assert.equal(subjectColorIndex('국어'), subjectColorIndex('국어'));
    assert.ok(subjectColorIndex('생존수영') >= 0 && subjectColorIndex('생존수영') <= 9);
});

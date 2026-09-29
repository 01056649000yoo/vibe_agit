import React, { useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import { CREATIVE_ACTIVITY_AREAS, subjectsForGrade } from './curriculumSubjects.js';
import {
    collectCustomSubjects,
    isCellChanged,
    MAX_MEMO_LENGTH,
    MAX_SUBJECT_LENGTH,
    normalizeCell,
    normalizeCells,
    setCell,
    subjectColorIndex,
    swapCells,
    TIMETABLE_DAYS,
    TIMETABLE_PERIODS,
} from './timetableModel.js';

/*
 * 시간표 입력 표 — 기초 시간표와 주간 시간표가 같이 쓴다(2026-09-29 선생님 요청).
 *
 * 칸을 채우는 방법
 *   1. 과목 단추를 칸으로 끌어다 놓는다.
 *   2. 과목 단추를 누른 뒤(눌린 채로 남는다) 칸을 차례로 누른다. `지우개`도 같다.
 *   3. 채운 칸을 끌어 다른 칸에 놓으면 두 칸이 바뀐다(교체 수업).
 *   4. 과목 단추가 눌려 있지 않을 때 칸을 누르면 아래에 과목·메모를 직접 적는 칸이 열린다(외부 강의 등).
 * 직접 적은 과목은 단추 줄 끝에 남아 다음에도 끌어다 쓸 수 있다.
 * 터치 화면에서는 끌어다 놓기가 안 되므로 2번·4번으로 쓴다.
 */

const DRAG_TYPE = 'application/x-class-timetable';
const ERASER = '__eraser__';

const readDrag = (event) => {
    try {
        return JSON.parse(event.dataTransfer.getData(DRAG_TYPE) || 'null');
    } catch {
        return null;
    }
};

export default function TimetableEditor({
    cells,
    baseCells = null,
    grade,
    lunchAfter,
    includeSaturday = false,
    extraSubjects = [],
    disabled = false,
    onChange,
}) {
    const [armed, setArmed] = useState(null);
    const [editing, setEditing] = useState(null);
    const [added, setAdded] = useState([]);
    const [newSubject, setNewSubject] = useState('');
    const [dropTarget, setDropTarget] = useState(null);

    const grid = useMemo(() => normalizeCells(cells), [cells]);
    const days = includeSaturday ? TIMETABLE_DAYS : TIMETABLE_DAYS.slice(0, 5);
    const curriculum = subjectsForGrade(grade);
    const custom = useMemo(() => {
        const found = new Set([...collectCustomSubjects(grid, baseCells), ...extraSubjects, ...added]);
        curriculum.forEach((name) => found.delete(name));
        CREATIVE_ACTIVITY_AREAS.forEach((name) => found.delete(name));
        return [...found];
    }, [grid, baseCells, extraSubjects, added, curriculum]);

    const change = (next) => { if (!disabled) onChange(next); };
    const fill = (day, period, value) => change(setCell(grid, day, period, value));

    const pressCell = (day, period) => {
        if (disabled) return;
        if (armed === ERASER) { fill(day, period, null); return; }
        if (armed) { fill(day, period, { s: armed }); return; }
        const current = grid.at(day).at(period);
        setEditing({ day, period, s: current?.s || '', m: current?.m || '' });
    };

    const dropOnCell = (event, day, period) => {
        event.preventDefault();
        setDropTarget(null);
        const data = readDrag(event);
        if (!data) return;
        if (data.kind === 'subject') fill(day, period, data.subject === ERASER ? null : { s: data.subject });
        if (data.kind === 'cell') change(swapCells(grid, data, { day, period }));
    };

    const addSubject = () => {
        const name = newSubject.replace(/\s+/gu, ' ').trim().slice(0, MAX_SUBJECT_LENGTH);
        if (!name) return;
        setAdded((list) => (list.includes(name) ? list : [...list, name]));
        setArmed(name);
        setNewSubject('');
    };

    const commitEditing = (event) => {
        event?.preventDefault();
        if (!editing) return;
        fill(editing.day, editing.period, normalizeCell({ s: editing.s, m: editing.m }));
        if (editing.s.trim() && !curriculum.includes(editing.s.trim())) {
            const name = editing.s.replace(/\s+/gu, ' ').trim().slice(0, MAX_SUBJECT_LENGTH);
            setAdded((list) => (list.includes(name) ? list : [...list, name]));
        }
        setEditing(null);
    };

    const chip = (subject, { small = false, label = subject } = {}) => {
        const pressed = armed === subject;
        return (
            <button
                key={subject}
                type="button"
                draggable={!disabled}
                disabled={disabled}
                aria-pressed={pressed}
                className={`class-timetable-chip${small ? ' is-small' : ''}${subject === ERASER ? ' is-eraser' : ` class-timetable-subject--${subjectColorIndex(subject)}`}`}
                title={subject === ERASER ? '누른 뒤 칸을 누르면 비웁니다' : '끌어다 칸에 놓거나, 누른 뒤 칸을 차례로 누르세요'}
                onClick={() => setArmed(pressed ? null : subject)}
                onDragStart={(event) => {
                    event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'subject', subject }));
                    event.dataTransfer.effectAllowed = 'copy';
                }}
            >{label}</button>
        );
    };

    const renderRow = (period) => (
        <tr key={`p${period}`}>
            <th scope="row">{period + 1}교시</th>
            {days.map((dayInfo, day) => {
                const cell = grid.at(day).at(period);
                const changed = baseCells ? isCellChanged(grid, baseCells, day, period) : false;
                const isDrop = dropTarget === `${day}-${period}`;
                const isEditing = editing?.day === day && editing?.period === period;
                return (
                    <td key={dayInfo.id}>
                        <button
                            type="button"
                            disabled={disabled}
                            draggable={Boolean(cell) && !disabled}
                            className={[
                                'class-timetable-cell',
                                cell?.s ? `class-timetable-subject--${subjectColorIndex(cell.s)}` : 'is-empty',
                                changed ? 'is-changed' : '',
                                isDrop ? 'is-drop-target' : '',
                                isEditing ? 'is-editing' : '',
                            ].filter(Boolean).join(' ')}
                            aria-label={`${dayInfo.label}요일 ${period + 1}교시 ${cell?.s || '비어 있음'}${cell?.m ? ` · ${cell.m}` : ''}${changed ? ' · 이번 주만 바꿈' : ''}`}
                            onClick={() => pressCell(day, period)}
                            onDoubleClick={() => { setArmed(null); setEditing({ day, period, s: cell?.s || '', m: cell?.m || '' }); }}
                            onDragStart={(event) => {
                                event.dataTransfer.setData(DRAG_TYPE, JSON.stringify({ kind: 'cell', day, period }));
                                event.dataTransfer.effectAllowed = 'move';
                            }}
                            onDragOver={(event) => { event.preventDefault(); setDropTarget(`${day}-${period}`); }}
                            onDragLeave={() => setDropTarget((current) => (current === `${day}-${period}` ? null : current))}
                            onDrop={(event) => dropOnCell(event, day, period)}
                        >
                            <strong>{cell?.s || ''}</strong>
                            {cell?.m ? <small>{cell.m}</small> : null}
                        </button>
                    </td>
                );
            })}
        </tr>
    );

    return (
        <div className="class-timetable-editor">
            <div className="class-timetable-palette" aria-label="과목 단추">
                <div className="class-timetable-palette__row">
                    {curriculum.map((subject) => chip(subject))}
                    {chip(ERASER, { label: '🧽 지우개' })}
                </div>
                <div className="class-timetable-palette__row">
                    <span className="class-timetable-palette__label">창체 영역</span>
                    {CREATIVE_ACTIVITY_AREAS.map((subject) => chip(subject, { small: true }))}
                </div>
                <div className="class-timetable-palette__row">
                    <span className="class-timetable-palette__label">직접 적은 과목</span>
                    {custom.map((subject) => chip(subject, { small: true }))}
                    <form className="class-timetable-palette__add" onSubmit={(event) => { event.preventDefault(); addSubject(); }}>
                        <input
                            value={newSubject}
                            maxLength={MAX_SUBJECT_LENGTH}
                            disabled={disabled}
                            placeholder="예) 생존수영"
                            aria-label="직접 적을 과목 이름"
                            onChange={(event) => setNewSubject(event.target.value)}
                        />
                        <Button type="submit" size="md" variant="outline" disabled={disabled || !newSubject.trim()}>＋ 과목 추가</Button>
                    </form>
                </div>
                <p className="class-timetable-note">
                    {armed === ERASER
                        ? '지우개를 누른 상태입니다. 비울 칸을 차례로 누르세요. 다시 누르면 풀립니다.'
                        : armed
                            ? `‘${armed}’을(를) 누른 상태입니다. 넣을 칸을 차례로 누르세요. 다시 누르면 풀립니다.`
                            : '과목 단추를 칸으로 끌어다 놓거나, 단추를 누른 뒤 칸을 차례로 누르세요. 칸끼리 끌면 서로 바뀝니다. 칸을 누르면 직접 적을 수 있습니다.'}
                </p>
            </div>

            <div className="class-timetable-grid-wrap">
                <table className="class-timetable-grid">
                    <thead>
                        <tr>
                            <th scope="col" aria-label="교시" />
                            {days.map((day) => <th key={day.id} scope="col">{day.label}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: TIMETABLE_PERIODS }, (_, period) => (
                            <React.Fragment key={period}>
                                {renderRow(period)}
                                {period + 1 === Number(lunchAfter) ? (
                                    <tr className="class-timetable-lunch">
                                        <th scope="row">🍚</th>
                                        <td colSpan={days.length}>점심시간</td>
                                    </tr>
                                ) : null}
                            </React.Fragment>
                        ))}
                    </tbody>
                </table>
            </div>

            {editing ? (
                <form className="class-timetable-cell-form" onSubmit={commitEditing}>
                    <strong>{days.at(editing.day)?.label}요일 {editing.period + 1}교시</strong>
                    <label>
                        <span>과목</span>
                        <input
                            autoFocus
                            list="class-timetable-subject-list"
                            maxLength={MAX_SUBJECT_LENGTH}
                            value={editing.s}
                            placeholder="예) 체육, 찾아오는 과학교실"
                            onChange={(event) => setEditing((current) => ({ ...current, s: event.target.value }))}
                        />
                    </label>
                    <label>
                        <span>메모 (선택)</span>
                        <input
                            maxLength={MAX_MEMO_LENGTH}
                            value={editing.m}
                            placeholder="예) 외부강사 · 강당"
                            onChange={(event) => setEditing((current) => ({ ...current, m: event.target.value }))}
                        />
                    </label>
                    <datalist id="class-timetable-subject-list">
                        {[...curriculum, ...CREATIVE_ACTIVITY_AREAS, ...custom].map((name) => <option key={name} value={name} />)}
                    </datalist>
                    <div className="class-timetable-cell-form__actions">
                        <Button type="submit" size="md">넣기</Button>
                        <Button type="button" size="md" variant="ghost" onClick={() => { fill(editing.day, editing.period, null); setEditing(null); }}>칸 비우기</Button>
                        <Button type="button" size="md" variant="ghost" onClick={() => setEditing(null)}>그만두기</Button>
                    </div>
                </form>
            ) : null}
        </div>
    );
}

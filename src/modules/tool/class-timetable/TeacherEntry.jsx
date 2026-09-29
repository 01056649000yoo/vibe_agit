import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from '../../../components/common/Button';
import useConfirmDialog from '../../../components/common/useConfirmDialog';
import TeacherPageTitle from '../../../components/teacher/TeacherPageTitle';
import { TIMETABLE_GRADES } from './curriculumSubjects.js';
import { classTimetableManifest } from './manifest.js';
import TimetableEditor from './TimetableEditor.jsx';
import { timetableApi } from './timetableApi.js';
import {
    addDays,
    countChangedCells,
    createEmptyCells,
    DEFAULT_LUNCH_AFTER,
    formatTimetableDate,
    formatWeekLabel,
    guessGradeFromClassName,
    LUNCH_AFTER_CHOICES,
    normalizeCells,
} from './timetableModel.js';
import useTimetableAutosave, { TIMETABLE_SAVE_STATUS_TEXT } from './useTimetableAutosave.js';
import './classTimetable.css';

/**
 * 학급 시간표 관리 (2026-09-29 선생님 요청).
 *
 * - 기초 시간표: 학년을 고르면 2022 개정 과목이 단추로 배열된다. 점심시간은 `N교시 뒤`로 고른다.
 *   고치면 자동 저장. 적용 시작 주(이번 주·다음 주)마다 판이 쌓여, 지난 주는 그때 시간표로 남는다.
 * - 주간 시간표: 고른 주를 기초 시간표로 채워 열고, 고친 칸은 그 주에만 저장된다(자동 저장).
 *   바꾼 칸은 색으로 표시되고 `기초 시간표로 되돌리기`가 있다.
 * - 지난 기록: 따로 저장한 주와 기초 시간표 판 목록. 누르면 그 주를 연다.
 * 데이터는 이 화면이 열릴 때만 읽는다(performance.load = 'on-open'). 스크린 `시간표` 위젯은 여기서 저장한 것을 보여 준다.
 */

const TABS = Object.freeze([
    { id: 'week', label: '주간 시간표' },
    { id: 'base', label: '기초 시간표' },
    { id: 'log', label: '지난 기록' },
]);

const toBaseDraft = (base, thisWeek, fallbackGrade) => ({
    effectiveFrom: base?.effectiveFrom && base.effectiveFrom > thisWeek ? base.effectiveFrom : thisWeek,
    grade: Number(base?.grade) || fallbackGrade,
    lunchAfter: Number(base?.lunchAfter) || DEFAULT_LUNCH_AFTER,
    includeSaturday: Boolean(base?.includeSaturday),
    cells: normalizeCells(base?.cells || createEmptyCells()),
});

const toWeekDraft = (week) => ({
    weekStart: week.weekStart,
    cells: normalizeCells(week.cells || createEmptyCells()),
    lunchAfter: Number(week.lunchAfter) || DEFAULT_LUNCH_AFTER,
    includeSaturday: Boolean(week.includeSaturday),
});

/*
 * api: 운영은 실제 RPC(timetableApi). src/dev/ 실험실은 DB 없이 보려고 메모리 가짜를 넣는다.
 */
export default function ClassTimetableTeacherEntry({ activeClass, isMobile, api = timetableApi }) {
    const classId = activeClass?.id;
    const fallbackGrade = guessGradeFromClassName(activeClass?.name) || 3;
    const { ask, confirmDialog } = useConfirmDialog();
    const [tab, setTab] = useState('week');
    const [info, setInfo] = useState({ status: 'loading', today: '', thisWeek: '', latestBase: null });
    const [error, setError] = useState('');
    const [baseDraft, setBaseDraft] = useState(null);
    const [weekState, setWeekState] = useState(null);
    const [weekDraft, setWeekDraft] = useState(null);
    const [weekLoading, setWeekLoading] = useState(false);
    const [log, setLog] = useState({ status: 'idle', weeks: [], bases: [], nextCursor: null });

    const baseSave = useTimetableAutosave({
        value: baseDraft,
        enabled: tab === 'base' && Boolean(classId),
        save: (draft) => api.saveBase(classId, draft),
        onSaved: (result) => {
            setInfo((current) => ({ ...current, latestBase: result?.base || current.latestBase }));
            setError('');
        },
        onError: (saveError) => setError(saveError.message || '기초 시간표를 저장하지 못했습니다.'),
    });
    const weekSave = useTimetableAutosave({
        value: weekDraft,
        enabled: tab === 'week' && Boolean(classId),
        save: (draft) => api.saveWeek(classId, draft),
        onSaved: (result) => {
            if (result?.week) setWeekState(result.week);
            setError('');
        },
        onError: (saveError) => setError(saveError.message || '주간 시간표를 저장하지 못했습니다.'),
    });
    const { baseline: baselineBase, flush: flushBase } = baseSave;
    const { baseline: baselineWeek, flush: flushWeek } = weekSave;

    const applyWeek = useCallback((week) => {
        const draft = toWeekDraft(week);
        setWeekState(week);
        setWeekDraft(draft);
        baselineWeek(draft);
    }, [baselineWeek]);

    // 열 때 한 번: 오늘·이번 주·가장 최근 기초 시간표·이번 주 시간표.
    useEffect(() => {
        if (!classId) return undefined;
        let active = true;
        setInfo({ status: 'loading', today: '', thisWeek: '', latestBase: null });
        setError('');
        void api.get(classId, null, 1)
            .then((result) => {
                if (!active) return;
                const draft = toBaseDraft(result.latestBase, result.thisWeek, fallbackGrade);
                setInfo({ status: 'ready', today: result.today, thisWeek: result.thisWeek, latestBase: result.latestBase || null });
                setBaseDraft(draft);
                baselineBase(draft);
                applyWeek(result.weeks?.[0] || { weekStart: result.thisWeek });
                // 기초 시간표가 아직 없으면 그것부터 입력하게 연다.
                setTab(result.latestBase ? 'week' : 'base');
            })
            .catch((loadError) => {
                if (!active) return;
                setInfo((current) => ({ ...current, status: 'error' }));
                setError(loadError.message || '시간표를 불러오지 못했습니다.');
            });
        return () => { active = false; };
    }, [api, classId, fallbackGrade, baselineBase, applyWeek]);

    /* 다른 주·다른 탭으로 가기 전에 쓰던 것을 먼저 저장한다. */
    const settle = async () => {
        const [baseOk, weekOk] = await Promise.all([flushBase(), flushWeek()]);
        if (baseOk && weekOk) return true;
        return ask({ title: '저장하지 못한 변경이 있습니다', body: '그래도 옮길까요? 저장하지 못한 칸은 사라집니다.', confirmLabel: '옮기기' });
    };

    const openWeek = async (weekStart) => {
        if (!classId || !weekStart || !(await settle())) return;
        setWeekLoading(true);
        setError('');
        try {
            const result = await api.get(classId, weekStart, 1);
            applyWeek(result.weeks?.[0] || { weekStart });
            setTab('week');
        } catch (loadError) {
            setError(loadError.message || '그 주의 시간표를 불러오지 못했습니다.');
        } finally {
            setWeekLoading(false);
        }
    };

    const loadLog = async (before = null) => {
        setLog((current) => ({ ...current, status: 'loading' }));
        try {
            const result = await api.getLog(classId, before);
            setLog((current) => ({
                status: 'ready',
                weeks: before ? [...current.weeks, ...(result.weeks || [])] : (result.weeks || []),
                bases: result.bases || [],
                nextCursor: result.nextCursor || null,
            }));
        } catch (loadError) {
            setLog((current) => ({ ...current, status: 'error' }));
            setError(loadError.message || '지난 기록을 불러오지 못했습니다.');
        }
    };

    const switchTab = async (next) => {
        if (next === tab || !(await settle())) return;
        setTab(next);
        // 기초 시간표를 고쳤을 수 있으니 주간 시간표는 다시 읽는다(그 주 한 번).
        if (next === 'week' && weekDraft) void openWeek(weekDraft.weekStart);
        if (next === 'log') void loadLog();
    };

    const revertWeek = async () => {
        if (!weekDraft || !(await ask({
            title: '기초 시간표로 되돌릴까요?',
            body: `${formatWeekLabel(weekDraft.weekStart)}에 바꾼 칸을 모두 지우고 기초 시간표로 돌아갑니다.`,
            confirmLabel: '되돌리기',
            tone: 'danger',
        }))) return;
        try {
            const result = await api.saveWeek(classId, { weekStart: weekDraft.weekStart, cells: null });
            applyWeek(result.week);
        } catch (saveError) {
            setError(saveError.message || '되돌리지 못했습니다.');
        }
    };

    const weekBaseCells = weekState?.base?.cells || null;
    const weekChanged = useMemo(
        () => (weekDraft ? countChangedCells(weekDraft.cells, weekBaseCells) : 0),
        [weekDraft, weekBaseCells],
    );
    const weekGrade = Number(weekState?.base?.grade) || Number(info.latestBase?.grade) || fallbackGrade;

    if (!classId) return <p className="class-timetable-note">먼저 학급을 골라 주세요.</p>;

    const status = tab === 'base' ? baseSave.status : tab === 'week' ? weekSave.status : 'idle';
    const retry = tab === 'base' ? flushBase : flushWeek;

    return (
        <section className={`class-timetable${isMobile ? ' is-mobile' : ''}`}>
            <TeacherPageTitle title={classTimetableManifest.name} guideTabId="class-timetable" />
            <p className="class-timetable-lead">
                기초 시간표를 한 번 입력해 두면 우리 반 스크린의 `시간표` 위젯이 오늘·내일·이번 주 시간표를 보여 줍니다.
                그 주에만 바뀌는 수업은 `주간 시간표`에서 고치면 그 주의 기록으로 남습니다.
            </p>

            <div className="class-timetable-bar">
                <div className="class-timetable-tabs" role="tablist" aria-label="시간표 화면">
                    {TABS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            role="tab"
                            aria-selected={tab === item.id}
                            className={tab === item.id ? 'is-active' : undefined}
                            onClick={() => void switchTab(item.id)}
                        >{item.label}</button>
                    ))}
                </div>
                <span className={`class-timetable-status is-${status}`} role="status" aria-live="polite">
                    {Reflect.get(TIMETABLE_SAVE_STATUS_TEXT, status) || ''}
                    {status === 'error' ? <Button type="button" size="xs" variant="outline" onClick={() => void retry()}>다시 저장</Button> : null}
                </span>
            </div>

            {error ? <p className="class-timetable-error" role="alert">{error}</p> : null}
            {info.status === 'loading' ? <p className="class-timetable-note">시간표를 불러오는 중…</p> : null}

            {info.status === 'ready' && tab === 'base' && baseDraft ? (
                <div className="class-timetable-panel" role="tabpanel" aria-label="기초 시간표">
                    <div className="class-timetable-settings">
                        <label>
                            <span>학년</span>
                            <select value={baseDraft.grade} onChange={(event) => setBaseDraft((current) => ({ ...current, grade: Number(event.target.value) }))}>
                                {TIMETABLE_GRADES.map((grade) => <option key={grade} value={grade}>{grade}학년</option>)}
                            </select>
                        </label>
                        <label>
                            <span>점심시간</span>
                            <select value={baseDraft.lunchAfter} onChange={(event) => setBaseDraft((current) => ({ ...current, lunchAfter: Number(event.target.value) }))}>
                                {LUNCH_AFTER_CHOICES.map((period) => <option key={period} value={period}>{period}교시 뒤</option>)}
                            </select>
                        </label>
                        <label>
                            <span>적용 시작</span>
                            <select value={baseDraft.effectiveFrom} onChange={(event) => setBaseDraft((current) => ({ ...current, effectiveFrom: event.target.value }))}>
                                <option value={info.thisWeek}>이번 주부터</option>
                                <option value={addDays(info.thisWeek, 7)}>다음 주부터</option>
                                {info.latestBase?.effectiveFrom > addDays(info.thisWeek, 7) ? (
                                    <option value={info.latestBase.effectiveFrom}>{formatWeekLabel(info.latestBase.effectiveFrom)}부터</option>
                                ) : null}
                            </select>
                        </label>
                        <label className="class-timetable-check">
                            <input
                                type="checkbox"
                                checked={baseDraft.includeSaturday}
                                onChange={(event) => setBaseDraft((current) => ({ ...current, includeSaturday: event.target.checked }))}
                            />
                            <span>토요일 수업</span>
                        </label>
                    </div>
                    <p className="class-timetable-note">
                        고치면 자동으로 저장됩니다. `적용 시작` 주부터 이 시간표를 쓰고, 그 전 주들은 그때 쓰던 기초 시간표 그대로 남습니다.
                        2학기처럼 시간표가 바뀌면 `다음 주부터`를 고른 뒤 고치세요.
                    </p>
                    <TimetableEditor
                        cells={baseDraft.cells}
                        grade={baseDraft.grade}
                        lunchAfter={baseDraft.lunchAfter}
                        includeSaturday={baseDraft.includeSaturday}
                        onChange={(cells) => setBaseDraft((current) => ({ ...current, cells }))}
                    />
                </div>
            ) : null}

            {info.status === 'ready' && tab === 'week' && weekDraft ? (
                <div className="class-timetable-panel" role="tabpanel" aria-label="주간 시간표">
                    <div className="class-timetable-week-nav">
                        <Button type="button" size="sm" variant="outline" disabled={weekLoading} onClick={() => void openWeek(addDays(weekDraft.weekStart, -7))}>◀ 지난주</Button>
                        <strong>{formatWeekLabel(weekDraft.weekStart)}{weekDraft.weekStart === info.thisWeek ? ' · 이번 주' : ''}</strong>
                        <Button type="button" size="sm" variant="outline" disabled={weekLoading} onClick={() => void openWeek(addDays(weekDraft.weekStart, 7))}>다음 주 ▶</Button>
                        {weekDraft.weekStart !== info.thisWeek ? (
                            <Button type="button" size="sm" variant="ghost" disabled={weekLoading} onClick={() => void openWeek(info.thisWeek)}>이번 주로</Button>
                        ) : null}
                    </div>
                    <div className="class-timetable-settings">
                        <label>
                            <span>이 주 점심시간</span>
                            <select value={weekDraft.lunchAfter} onChange={(event) => setWeekDraft((current) => ({ ...current, lunchAfter: Number(event.target.value) }))}>
                                {LUNCH_AFTER_CHOICES.map((period) => <option key={period} value={period}>{period}교시 뒤</option>)}
                            </select>
                        </label>
                        <p className="class-timetable-week-state">
                            {weekChanged > 0 || weekState?.saved
                                ? <><span className="class-timetable-changed-dot" aria-hidden="true" /> 이 주만 바꿈 · {weekChanged}칸</>
                                : '기초 시간표 그대로'}
                        </p>
                        {weekState?.saved ? (
                            <Button type="button" size="sm" variant="outline" onClick={() => void revertWeek()}>기초 시간표로 되돌리기</Button>
                        ) : null}
                    </div>
                    {!weekState?.base ? (
                        <p className="class-timetable-note">이 주에 쓰는 기초 시간표가 없습니다. `기초 시간표`를 먼저 입력하면 칸이 미리 채워집니다.</p>
                    ) : (
                        <p className="class-timetable-note">
                            기초 시간표로 채워져 있습니다. 이 주에만 바뀌는 칸을 고치면 자동으로 저장되고, 바꾼 칸은 점선으로 표시됩니다.
                            {info.today ? ` 오늘은 ${formatTimetableDate(info.today)}입니다.` : ''}
                        </p>
                    )}
                    <TimetableEditor
                        cells={weekDraft.cells}
                        baseCells={weekBaseCells}
                        grade={weekGrade}
                        lunchAfter={weekDraft.lunchAfter}
                        includeSaturday={weekDraft.includeSaturday}
                        disabled={weekLoading}
                        onChange={(cells) => setWeekDraft((current) => ({ ...current, cells }))}
                    />
                </div>
            ) : null}

            {info.status === 'ready' && tab === 'log' ? (
                <div className="class-timetable-panel" role="tabpanel" aria-label="지난 기록">
                    <h3 className="class-timetable-subhead">따로 저장한 주</h3>
                    {log.status === 'loading' && log.weeks.length === 0 ? <p className="class-timetable-note">불러오는 중…</p> : null}
                    {log.status === 'ready' && log.weeks.length === 0 ? (
                        <p className="class-timetable-note">아직 따로 저장한 주가 없습니다. 모든 주가 기초 시간표 그대로입니다.</p>
                    ) : null}
                    <ul className="class-timetable-log">
                        {log.weeks.map((item) => (
                            <li key={item.weekStart}>
                                <button type="button" onClick={() => void openWeek(item.weekStart)}>
                                    <strong>{formatWeekLabel(item.weekStart)}</strong>
                                    <small>{item.changedCells > 0 ? `${item.changedCells}칸 바뀜` : '점심시간만 바뀜'}</small>
                                </button>
                            </li>
                        ))}
                    </ul>
                    {log.nextCursor ? (
                        <Button type="button" size="sm" variant="outline" disabled={log.status === 'loading'} onClick={() => void loadLog(log.nextCursor)}>더 지난 기록</Button>
                    ) : null}

                    <h3 className="class-timetable-subhead">기초 시간표 판</h3>
                    <ul className="class-timetable-log is-plain">
                        {log.bases.map((item) => (
                            <li key={item.effectiveFrom}>
                                <strong>{formatWeekLabel(item.effectiveFrom)}부터</strong>
                                <small>{item.grade}학년 · 점심 {item.lunchAfter}교시 뒤</small>
                            </li>
                        ))}
                    </ul>
                </div>
            ) : null}
            {confirmDialog}
        </section>
    );
}

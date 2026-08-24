import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arrangementSfx } from './arrangementSfx';
import SeatLotteryModal from './SeatLotteryModal';
import FullscreenResultView from './FullscreenResultView';
import { useNameSize } from './NameSizeControl';
import ResultEditBar from './ResultEditBar';
import { useEditableResult } from './resultSwap';
import { hasExactSeatCount, rectangularSeats, seatKey, seatsWithinGrid, solveSeats, suggestSeatLayout } from './arrangementEngine';

const SPEED_OPTIONS = [
  { id: 'slow', label: '천천히', delay: 1500, detail: '한 명 약 1.5초' },
  { id: 'normal', label: '보통', delay: 950, detail: '한 명 약 1초' },
  { id: 'fast', label: '빠르게', delay: 600, detail: '한 명 약 0.6초' }
];
const delayFor = (speed) => SPEED_OPTIONS.find((option) => option.id === speed)?.delay || 950;
const groupLabel = (group) => group === 'A' ? '남' : group === 'B' ? '여' : '';

const seatKeyOf = (item) => item.seatKey;

export default function SeatArrangement({ students, settings, history, onSettingsChange, onCreateHistory, onSaveEditedHistory }) {
  const suggested = useMemo(() => suggestSeatLayout(students.length), [students.length]);
  const initial = settings.seatLayout || suggested;
  const [rows, setRows] = useState(initial.rows || 4);
  const [cols, setCols] = useState(initial.cols || 6);
  const [activeSeats, setActiveSeats] = useState(() => settings.seatLayout?.activeSeats?.length
    ? new Set(settings.seatLayout.activeSeats)
    : suggested.activeSeats);
  const [assignments, setAssignments] = useState([]);
  const [revealed, setRevealed] = useState(new Set());
  const [rollingName, setRollingName] = useState('');
  const [flyingPick, setFlyingPick] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [phase, setPhase] = useState('idle');
  // 결과판과 뽑기 창이 **같은 크기 값**을 쓴다. 창에만 두면 닫는 순간 이름이 다시 작아진다.
  const { sizeId, setSizeId, scale } = useNameSize();
  const [speed, setSpeed] = useState('normal');
  const [violations, setViolations] = useState(0);
  const [conditionError, setConditionError] = useState('');
  const [fullscreen, setFullscreen] = useState(false);
  // 맞바꾸기·수정본 저장·기록 연결은 역할 나누기와 **같은 것**을 쓴다.
  const editable = useEditableResult({ keyOf: seatKeyOf, kind: 'seat', setAssignments, onSaveEditedHistory });
  const painting = useRef(null);
  const activeSeatsRef = useRef(activeSeats);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  useEffect(() => {
    const end = () => { painting.current = null; };
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, []);

  // 자리 배치는 **아지트 학급 명단**만 쓴다. 손으로 이름을 넣는 `빠른 입력` 은 2026-08-24 에 없앴다 —
  // 그 명단으로 뽑으면 기록이 저장되지 않아 "저장이 안 된다" 는 오해가 생겼고,
  // 이름이 아지트 명단과 달라 지난 기록·역할 나누기와도 맞지 않았다.
  const roster = students;
  const assignmentBySeat = useMemo(() => new Map(assignments.map((item) => [item.seatKey, item])), [assignments]);
  const seatCountMatches = hasExactSeatCount(roster.length, activeSeats.size);
  const canStart = phase === 'idle' && seatCountMatches;
  const closeLotteryModal = useCallback(() => setModalOpen(false), []);

  const storeLayout = (nextRows, nextCols, nextSeats) => {
    const visibleSeats = seatsWithinGrid(nextSeats, nextRows, nextCols);
    setRows(nextRows);
    setCols(nextCols);
    activeSeatsRef.current = visibleSeats;
    setActiveSeats(visibleSeats);
    setAssignments([]);
    setRevealed(new Set());
    setFlyingPick(null);
    setModalOpen(false);
    setConditionError('');
    setPhase('idle');
    editable.startRound();
    onSettingsChange({ ...settings, seatLayout: { rows: nextRows, cols: nextCols, activeSeats: [...visibleSeats] } });
  };

  const applyGrid = () => storeLayout(rows, cols, rectangularSeats(rows, cols));
  const autoGrid = () => {
    const next = suggestSeatLayout(roster.length);
    storeLayout(next.rows, next.cols, next.activeSeats);
  };
  const resizeGrid = (nextRows, nextCols) => storeLayout(nextRows, nextCols, activeSeatsRef.current);
  const paint = (row, col, mode = painting.current) => {
    if (phase !== 'idle' || !mode) return;
    const key = seatKey(row, col);
    const next = new Set(activeSeatsRef.current);
    if (mode === 'add') next.add(key); else next.delete(key);
    storeLayout(rows, cols, next);
  };
  const startPaint = (event, row, col) => {
    event.preventDefault();
    const key = seatKey(row, col);
    painting.current = activeSeats.has(key) ? 'remove' : 'add';
    paint(row, col, painting.current);
  };
  const reset = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setAssignments([]);
    setRevealed(new Set());
    setRollingName('');
    setFlyingPick(null);
    setModalOpen(false);
    setViolations(0);
    setConditionError('');
    setPhase('idle');
    setFullscreen(false);
    editable.clear();
  };
  const schedule = (callback, delay) => {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  };

  const start = async () => {
    if (!canStart) return;
    setConditionError('');
    const rosterWithGroups = roster.map((student) => ({ ...student, group: student.group || null }));
    const result = solveSeats(rosterWithGroups, activeSeats, settings, history.filter((item) => item.kind === 'seat'));
    if (result.assignments.length === 0) {
      setConditionError(result.error || '현재 조건으로 자리 배치를 만들 수 없습니다.');
      return;
    }
    setAssignments(result.assignments);
    setRevealed(new Set());
    setFlyingPick(null);
    setViolations(result.violations);
    editable.startRound();
    setPhase('running');
    setModalOpen(true);
    arrangementSfx.ensure();
    const order = [...result.assignments].sort(() => Math.random() - 0.5);
    const step = delayFor(speed);
    order.forEach((pick, index) => {
      const base = index * step;
      for (let tick = 0; tick < 5; tick += 1) schedule(() => {
        setRollingName(roster[Math.floor(Math.random() * roster.length)]?.name || '');
        arrangementSfx.tick();
      }, base + tick * Math.max(32, step / 9));
      schedule(() => {
        setRollingName(pick.studentName);
        setFlyingPick({ ...pick, flightDuration: Math.round(step * 0.35) });
        arrangementSfx.pick();
      }, base + step * 0.55);
      schedule(() => {
        setRevealed((current) => new Set(current).add(pick.seatKey));
        setFlyingPick((current) => current?.seatKey === pick.seatKey ? null : current);
        arrangementSfx.pop();
      }, base + step * 0.9);
    });
    schedule(() => { setPhase('done'); setRollingName(''); setFlyingPick(null); arrangementSfx.finish(); }, order.length * step + 120);
    const createdId = await onCreateHistory('seat', `자리 배치 ${result.assignments.length}명`, {
      format: 'classroom-arrangement/seat-v1',
      layout: { rows, cols, activeSeats: [...activeSeats] },
      settings,
      violations: result.violations,
      assignments: result.assignments
    });
    editable.linkRandomHistory(createdId);
  };

  // 맞바꾼 자리표는 랜덤 원본과 연결해 저장한다. 저장 절차는 `useEditableResult` 가 갖고 있다.
  const saveEdited = () => editable.save(`자리 배치 ${assignments.length}명`, {
    format: 'classroom-arrangement/seat-v1',
    layout: { rows, cols, activeSeats: [...activeSeats] },
    settings,
    assignments
  });

  const editing = phase === 'done';
  // 결과판은 화면 안과 전체 화면에서 **같은 것**을 쓴다. 두 벌로 두면 한쪽만 고치는 실수가 난다.
  const seatBoard = <div className={`arrange-seat-grid ${editing ? 'is-editable' : ''}`} style={{ gridTemplateColumns: `repeat(${cols}, minmax(calc(54px * ${scale}), 1fr))`, '--arrange-name-scale': scale }}>
    {Array.from({ length: rows * cols }, (_, index) => {
      const row = Math.floor(index / cols);
      const col = index % cols;
      const key = seatKey(row, col);
      const active = activeSeats.has(key);
      const assigned = assignmentBySeat.get(key);
      const visible = revealed.has(key) || phase === 'done';
      const picked = editable.pickedKey === key;
      return <button
        type="button"
        key={key}
        data-seat={key}
        className={`arrange-seat ${active ? 'is-active' : ''} ${visible ? 'is-revealed' : ''} ${picked ? 'is-picked' : ''}`}
        onPointerDown={(event) => { if (!editing) startPaint(event, row, col); }}
        onPointerEnter={() => { if (!editing) paint(row, col); }}
        onClick={() => { if (editing && active && assigned) editable.pick(key); }}
        disabled={phase === 'running'}
        aria-pressed={editing && active ? picked : undefined}
        aria-label={editing && assigned
          ? `${row + 1}행 ${col + 1}열 ${assigned.studentName}${picked ? ', 고름' : ''}. 눌러서 자리 맞바꾸기`
          : `${row + 1}행 ${col + 1}열 ${active ? '좌석' : '빈칸'}`}
      >
        {active ? <><small>{row + 1}-{col + 1}</small><strong>{visible && assigned ? assigned.studentName : '자리'}</strong></> : null}
      </button>;
    })}
  </div>;

  const editBar = editing ? <ResultEditBar noun="자리" pickedKey={editable.pickedKey} edited={editable.edited} manualResult={editable.manualResult} saving={editable.saving} onSave={saveEdited} /> : null;
  return <>
    <div className="arrange-workspace">
      <section className="arrange-sidebar-card">
        <div className="arrange-roster-summary"><strong>{roster.length}명</strong><div className="arrange-chip-row">{roster.map((student) => <span className="arrange-chip" key={student.id}>{student.name}{groupLabel(student.group) ? ` · ${groupLabel(student.group)}` : ''}</span>)}</div></div>
        <div className="arrange-grid-controls">
          <label>행<input type="number" min="1" max="30" value={rows} disabled={phase === 'running'} onChange={(event) => resizeGrid(Math.max(1, Math.min(30, Number(event.target.value) || 1)), cols)} /></label>
          <label>열<input type="number" min="1" max="30" value={cols} disabled={phase === 'running'} onChange={(event) => resizeGrid(rows, Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label>
          <button type="button" onClick={applyGrid} disabled={phase === 'running'}>격자 적용</button>
          <button type="button" onClick={autoGrid} disabled={phase === 'running' || roster.length === 0}>자동 맞춤</button>
        </div>
        <p className="arrange-hint">좌석을 클릭하거나 드래그해 교실 모양을 만들 수 있습니다. 현재 {activeSeats.size}석입니다.</p>
        <div className="arrange-speed-row"><span>속도</span>{SPEED_OPTIONS.map((option) => <button type="button" key={option.id} title={option.detail} className={speed === option.id ? 'is-active' : ''} onClick={() => setSpeed(option.id)}>{option.label}</button>)}</div>
        <button type="button" className="arrange-primary" disabled={!canStart} onClick={start}>{phase === 'done' ? '다시 배치하기' : '자리 배치 시작'}</button>
        {phase !== 'idle' ? <button type="button" className="arrange-secondary" onClick={reset}>결과 지우기</button> : null}
        {!seatCountMatches && phase === 'idle' ? <p className="arrange-validation">학생 수({roster.length}명)와 활성 좌석 수({activeSeats.size}석)가 정확히 같아야 합니다.</p> : null}
        {conditionError ? <p className="arrange-validation" role="alert">{conditionError} 설정·자료 이전 탭에서 필수 조건을 확인해 주세요.</p> : null}
      </section>

      <section className="arrange-board-card">
        <div className="arrange-board-heading">
          <div className="arrange-blackboard">칠판</div>
          <output className={`arrange-student-counter ${seatCountMatches ? 'is-ready' : 'is-mismatch'}`} aria-live="polite" aria-label={`현재 학생 ${roster.length}명, 활성 좌석 ${activeSeats.size}석`}>
            <span>현재 학생</span>
            <strong>{roster.length}<small>명</small></strong>
            <em>{seatCountMatches ? '좌석 일치' : `좌석 ${activeSeats.size}석`}</em>
          </output>
          {/* 전자칠판으로 볼 때 창 안에 갇혀 있으면 이름을 키워도 좁다. 결과가 나오면 화면 전체로 볼 수 있게 한다. */}
          {phase === 'done' ? <button type="button" className="arrange-fullscreen-open" onClick={() => setFullscreen(true)}>전체 화면으로 보기</button> : null}
        </div>
        {editBar}
        {fullscreen ? <div className="arrange-fullscreen-placeholder">전체 화면으로 보고 있습니다.</div> : seatBoard}
        {phase === 'done' && !editable.manualResult && violations > 0 ? <div className="arrange-condition-note">필수 조건은 모두 지켰으며, 권장 조건은 가장 가까운 결과로 배치했습니다. 권장 점수 {violations}</div> : null}
      </section>
    </div>
    {fullscreen ? <FullscreenResultView title="우리 반 자리표" sizeId={sizeId} onSizeChange={setSizeId} scale={scale} onClose={() => setFullscreen(false)} actions={editBar}>
      {seatBoard}
    </FullscreenResultView> : null}
    {modalOpen ? <SeatLotteryModal rows={rows} cols={cols} activeSeats={activeSeats} assignments={assignments} revealed={revealed} rollingName={rollingName} flyingPick={flyingPick} phase={phase} onClose={closeLotteryModal} onCancel={reset} sizeId={sizeId} onSizeChange={setSizeId} scale={scale} /> : null}
  </>;
}

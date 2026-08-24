import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arrangementSfx } from './arrangementSfx';
import SeatLotteryModal from './SeatLotteryModal';
import { useNameSize } from './NameSizeControl';
import { hasExactSeatCount, rectangularSeats, seatKey, seatsWithinGrid, solveSeats, suggestSeatLayout } from './arrangementEngine';

const parseQuickNames = (text) => text.split(/[\n,]+/).map((name) => name.trim()).filter(Boolean).slice(0, 100);
const SPEED_OPTIONS = [
  { id: 'slow', label: '천천히', delay: 1500, detail: '한 명 약 1.5초' },
  { id: 'normal', label: '보통', delay: 950, detail: '한 명 약 1초' },
  { id: 'fast', label: '빠르게', delay: 600, detail: '한 명 약 0.6초' }
];
const delayFor = (speed) => SPEED_OPTIONS.find((option) => option.id === speed)?.delay || 950;
const groupLabel = (group) => group === 'A' ? '남' : group === 'B' ? '여' : '';

export default function SeatArrangement({ students, settings, history, onSettingsChange, onCreateHistory }) {
  const [source, setSource] = useState('class');
  const [quickText, setQuickText] = useState('');
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
  const painting = useRef(null);
  const activeSeatsRef = useRef(activeSeats);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  useEffect(() => {
    const end = () => { painting.current = null; };
    window.addEventListener('pointerup', end);
    return () => window.removeEventListener('pointerup', end);
  }, []);

  const roster = useMemo(() => source === 'class'
    ? students
    : parseQuickNames(quickText).map((name, index) => ({ id: `quick-${index}`, name })), [source, students, quickText]);
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
    if (source === 'class') {
      await onCreateHistory('seat', `자리 배치 ${result.assignments.length}명`, {
        format: 'classroom-arrangement/seat-v1',
        layout: { rows, cols, activeSeats: [...activeSeats] },
        settings,
        violations: result.violations,
        assignments: result.assignments
      });
    }
  };

  return <>
    <div className="arrange-workspace">
      <section className="arrange-sidebar-card">
        <div className="arrange-segment" role="tablist" aria-label="학생 입력 방식">
          <button type="button" role="tab" aria-selected={source === 'class'} className={source === 'class' ? 'is-active' : ''} onClick={() => { setSource('class'); reset(); }}>아지트 학급</button>
          <button type="button" role="tab" aria-selected={source === 'quick'} className={source === 'quick' ? 'is-active' : ''} onClick={() => { setSource('quick'); reset(); }}>빠른 입력</button>
        </div>
        {source === 'quick' ? <textarea className="arrange-quick-input" value={quickText} onChange={(event) => { setQuickText(event.target.value); reset(); }} placeholder={'이름을 줄바꿈이나 쉼표로 입력\n예: 민준, 서연, 지우'} /> : null}
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
        </div>
        <div className="arrange-seat-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(54px, 1fr))`, '--arrange-name-scale': scale }}>
          {Array.from({ length: rows * cols }, (_, index) => {
            const row = Math.floor(index / cols);
            const col = index % cols;
            const key = seatKey(row, col);
            const active = activeSeats.has(key);
            const assigned = assignmentBySeat.get(key);
            const visible = revealed.has(key) || phase === 'done';
            return <button type="button" key={key} data-seat={key} className={`arrange-seat ${active ? 'is-active' : ''} ${visible ? 'is-revealed' : ''}`} onPointerDown={(event) => startPaint(event, row, col)} onPointerEnter={() => paint(row, col)} disabled={phase === 'running'} aria-label={`${row + 1}행 ${col + 1}열 ${active ? '좌석' : '빈칸'}`}>
              {active ? <><small>{row + 1}-{col + 1}</small><strong>{visible && assigned ? assigned.studentName : '자리'}</strong></> : null}
            </button>;
          })}
        </div>
        {phase === 'done' && violations > 0 ? <div className="arrange-condition-note">필수 조건은 모두 지켰으며, 권장 조건은 가장 가까운 결과로 배치했습니다. 권장 점수 {violations}</div> : null}
      </section>
    </div>
    {modalOpen ? <SeatLotteryModal rows={rows} cols={cols} activeSeats={activeSeats} assignments={assignments} revealed={revealed} rollingName={rollingName} flyingPick={flyingPick} phase={phase} onClose={closeLotteryModal} onCancel={reset} sizeId={sizeId} onSizeChange={setSizeId} scale={scale} /> : null}
  </>;
}

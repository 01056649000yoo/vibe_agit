import React, { useEffect, useMemo, useRef, useState } from 'react';
import { arrangementSfx } from './arrangementSfx';
import { hasExactSeatCount, rectangularSeats, seatKey, solveSeats, suggestSeatGrid } from './arrangementEngine';

const parseQuickNames = (text) => text.split(/[\n,]+/).map((name) => name.trim()).filter(Boolean).slice(0, 100);
const delayFor = (speed) => speed === 'slow' ? 720 : speed === 'fast' ? 230 : 420;

export default function SeatArrangement({ students, settings, history, onSettingsChange, onCreateHistory }) {
  const [source, setSource] = useState('class');
  const [quickText, setQuickText] = useState('');
  const initial = settings.seatLayout || suggestSeatGrid(students.length);
  const [rows, setRows] = useState(initial.rows || 4);
  const [cols, setCols] = useState(initial.cols || 6);
  const [activeSeats, setActiveSeats] = useState(() => settings.seatLayout?.activeSeats?.length
    ? new Set(settings.seatLayout.activeSeats)
    : rectangularSeats(initial.rows || 4, initial.cols || 6));
  const [assignments, setAssignments] = useState([]);
  const [revealed, setRevealed] = useState(new Set());
  const [rollingName, setRollingName] = useState('');
  const [phase, setPhase] = useState('idle');
  const [speed, setSpeed] = useState('normal');
  const [violations, setViolations] = useState(0);
  const painting = useRef(null);
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

  const storeLayout = (nextRows, nextCols, nextSeats) => {
    setRows(nextRows);
    setCols(nextCols);
    setActiveSeats(nextSeats);
    setAssignments([]);
    setRevealed(new Set());
    setPhase('idle');
    onSettingsChange({ ...settings, seatLayout: { rows: nextRows, cols: nextCols, activeSeats: [...nextSeats] } });
  };

  const applyGrid = () => storeLayout(rows, cols, rectangularSeats(rows, cols));
  const autoGrid = () => {
    const next = suggestSeatGrid(roster.length);
    storeLayout(next.rows, next.cols, rectangularSeats(next.rows, next.cols));
  };
  const paint = (row, col, mode = painting.current) => {
    if (phase !== 'idle' || !mode) return;
    const key = seatKey(row, col);
    const next = new Set(activeSeats);
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
    setViolations(0);
    setPhase('idle');
  };
  const schedule = (callback, delay) => {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  };

  const start = async () => {
    if (!canStart) return;
    const rosterWithGroups = roster.map((student) => ({ ...student, group: student.group || null }));
    const result = solveSeats(rosterWithGroups, activeSeats, settings, history.filter((item) => item.kind === 'seat'));
    if (result.assignments.length === 0) return;
    setAssignments(result.assignments);
    setRevealed(new Set());
    setViolations(result.violations);
    setPhase('running');
    arrangementSfx.ensure();
    const order = [...result.assignments].sort(() => Math.random() - 0.5);
    const step = delayFor(speed);
    order.forEach((pick, index) => {
      const base = index * step;
      for (let tick = 0; tick < 5; tick += 1) schedule(() => {
        setRollingName(roster[Math.floor(Math.random() * roster.length)]?.name || '');
        arrangementSfx.tick();
      }, base + tick * Math.max(32, step / 9));
      schedule(() => { setRollingName(pick.studentName); arrangementSfx.pick(); }, base + step * 0.6);
      schedule(() => {
        setRevealed((current) => new Set(current).add(pick.seatKey));
        arrangementSfx.pop();
      }, base + step * 0.82);
    });
    schedule(() => { setPhase('done'); setRollingName(''); arrangementSfx.finish(); }, order.length * step + 120);
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

  return (
    <div className="arrange-workspace">
      <section className="arrange-sidebar-card">
        <div className="arrange-segment" role="tablist" aria-label="학생 입력 방식">
          <button type="button" role="tab" aria-selected={source === 'class'} className={source === 'class' ? 'is-active' : ''} onClick={() => { setSource('class'); reset(); }}>아지트 학급</button>
          <button type="button" role="tab" aria-selected={source === 'quick'} className={source === 'quick' ? 'is-active' : ''} onClick={() => { setSource('quick'); reset(); }}>빠른 입력</button>
        </div>
        {source === 'quick' ? <textarea className="arrange-quick-input" value={quickText} onChange={(event) => { setQuickText(event.target.value); reset(); }} placeholder={'이름을 줄바꿈이나 쉼표로 입력\n예: 민준, 서연, 지우'} /> : null}
        <div className="arrange-roster-summary"><strong>{roster.length}명</strong><div className="arrange-chip-row">{roster.map((student) => <span className="arrange-chip" key={student.id}>{student.name}{student.group ? ` · ${student.group}` : ''}</span>)}</div></div>
        <div className="arrange-grid-controls">
          <label>행<input type="number" min="1" max="30" value={rows} disabled={phase === 'running'} onChange={(event) => setRows(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label>
          <label>열<input type="number" min="1" max="30" value={cols} disabled={phase === 'running'} onChange={(event) => setCols(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label>
          <button type="button" onClick={applyGrid} disabled={phase === 'running'}>격자 적용</button>
          <button type="button" onClick={autoGrid} disabled={phase === 'running' || roster.length === 0}>자동 맞춤</button>
        </div>
        <p className="arrange-hint">좌석을 클릭하거나 드래그해 교실 모양을 만들 수 있습니다. 현재 {activeSeats.size}석입니다.</p>
        <div className="arrange-speed-row"><span>속도</span>{['slow', 'normal', 'fast'].map((value) => <button type="button" key={value} className={speed === value ? 'is-active' : ''} onClick={() => setSpeed(value)}>{value === 'slow' ? '천천히' : value === 'fast' ? '빠르게' : '보통'}</button>)}</div>
        <button type="button" className="arrange-primary" disabled={!canStart} onClick={start}>{phase === 'done' ? '다시 배치하기' : '자리 배치 시작'}</button>
        {phase !== 'idle' ? <button type="button" className="arrange-secondary" onClick={reset}>결과 지우기</button> : null}
        {!seatCountMatches && phase === 'idle' ? <p className="arrange-validation">학생 수({roster.length}명)와 활성 좌석 수({activeSeats.size}석)가 정확히 같아야 합니다.</p> : null}
      </section>

      <section className="arrange-board-card">
        <div className="arrange-blackboard">칠판</div>
        <div className="arrange-seat-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(54px, 1fr))` }}>
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
        {phase === 'running' ? <div className="arrange-lottery" aria-live="polite"><div className="arrange-lottery-machine">🎱</div><strong>{rollingName || '추첨 중'}</strong><span>{revealed.size} / {assignments.length}</span></div> : null}
        {phase === 'done' && violations > 0 ? <div className="arrange-condition-note">조건을 모두 만족하는 조합이 없어 가장 가까운 결과로 배치했습니다. 위반 점수 {violations}</div> : null}
      </section>
    </div>
  );
}

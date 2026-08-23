import React, { useEffect, useMemo, useRef, useState } from 'react';
import { arrangementSfx } from './arrangementSfx';
import { buildRoleSlots, solveRoles } from './arrangementEngine';
import LotteryMachine from './LotteryMachine';

const newRoleId = () => typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `role-${Date.now()}-${Math.random()}`;

export default function RoleArrangement({ students, settings, history, onSettingsChange, onCreateHistory }) {
  const [roleName, setRoleName] = useState('');
  const [roleCount, setRoleCount] = useState(1);
  const [phase, setPhase] = useState('idle');
  const [assignments, setAssignments] = useState([]);
  const [revealedCount, setRevealedCount] = useState(0);
  const [rollingName, setRollingName] = useState('');
  const [violations, setViolations] = useState(0);
  const timers = useRef([]);
  const slots = useMemo(() => buildRoleSlots(settings.roleGroups), [settings.roleGroups]);
  const ready = students.length > 0 && slots.length === students.length && phase === 'idle';
  const revealed = assignments.slice(0, revealedCount);
  const byRole = useMemo(() => {
    const result = new Map(settings.roleGroups.map((role) => [role.id, []]));
    revealed.forEach((assignment) => result.get(assignment.roleId)?.push(assignment));
    return result;
  }, [revealed, settings.roleGroups]);

  useEffect(() => () => timers.current.forEach(window.clearTimeout), []);
  const schedule = (callback, delay) => {
    const timer = window.setTimeout(callback, delay);
    timers.current.push(timer);
  };
  const reset = () => {
    timers.current.forEach(window.clearTimeout);
    timers.current = [];
    setPhase('idle');
    setAssignments([]);
    setRevealedCount(0);
    setRollingName('');
    setViolations(0);
  };
  const setRoles = (roleGroups) => {
    onSettingsChange({ ...settings, roleGroups });
    reset();
  };
  const addRole = () => {
    const name = roleName.trim();
    if (!name) return;
    setRoles([...settings.roleGroups, { id: newRoleId(), name: name.slice(0, 40), count: Math.max(1, Math.min(99, roleCount)) }]);
    setRoleName('');
    setRoleCount(1);
  };
  const autoFill = () => setRoles(Array.from({ length: students.length }, (_, index) => ({ id: newRoleId(), name: `역할 ${index + 1}`, count: 1 })));
  const start = async () => {
    if (!ready) return;
    const result = solveRoles(students, settings, history.filter((item) => item.kind === 'role'));
    setAssignments(result.assignments);
    setRevealedCount(0);
    setViolations(result.violations);
    setPhase('running');
    arrangementSfx.ensure();
    const step = 460;
    result.assignments.forEach((pick, index) => {
      const base = index * step;
      for (let tick = 0; tick < 5; tick += 1) schedule(() => {
        setRollingName(students[Math.floor(Math.random() * students.length)]?.name || '');
        arrangementSfx.tick();
      }, base + tick * 45);
      schedule(() => { setRollingName(pick.studentName); arrangementSfx.pick(); }, base + 265);
      schedule(() => { setRevealedCount(index + 1); arrangementSfx.pop(); }, base + 390);
    });
    schedule(() => { setPhase('done'); setRollingName(''); arrangementSfx.finish(); }, result.assignments.length * step + 100);
    await onCreateHistory('role', `역할 나누기 ${result.assignments.length}명`, {
      format: 'classroom-arrangement/role-v1',
      roleGroups: settings.roleGroups,
      settings,
      violations: result.violations,
      assignments: result.assignments
    });
  };

  return (
    <div className="arrange-role-layout">
      <section className="arrange-role-builder">
        <div className="arrange-panel-heading"><div><h3>역할 칸 만들기</h3><p>모든 역할의 인원 합계가 학생 수와 같아야 합니다.</p></div><button type="button" className="arrange-small-button" disabled={students.length === 0 || phase === 'running'} onClick={autoFill}>1인 역할 자동 만들기</button></div>
        <form className="arrange-role-form" onSubmit={(event) => { event.preventDefault(); addRole(); }}>
          <input value={roleName} disabled={phase === 'running'} onChange={(event) => setRoleName(event.target.value)} placeholder="예: 모둠장, 발표자, 기록자" />
          <input type="number" aria-label="역할 인원" min="1" max="99" value={roleCount} disabled={phase === 'running'} onChange={(event) => setRoleCount(Math.max(1, Math.min(99, Number(event.target.value) || 1)))} />
          <button type="submit" className="arrange-small-button is-dark" disabled={!roleName.trim() || phase === 'running'}>추가</button>
        </form>
        <div className="arrange-role-list">
          {settings.roleGroups.map((role) => <div key={role.id}>
            <strong>{role.name}</strong>
            <label><span>인원</span><input type="number" min="1" max="99" value={role.count} disabled={phase === 'running'} onChange={(event) => setRoles(settings.roleGroups.map((item) => item.id === role.id ? { ...item, count: Math.max(1, Math.min(99, Number(event.target.value) || 1)) } : item))} /></label>
            <button type="button" aria-label={`${role.name} 삭제`} disabled={phase === 'running'} onClick={() => setRoles(settings.roleGroups.filter((item) => item.id !== role.id))}>×</button>
          </div>)}
        </div>
        <div className={`arrange-count-check ${slots.length === students.length ? 'is-ready' : ''}`}>학생 {students.length}명 · 역할 자리 {slots.length}개</div>
        <button type="button" className="arrange-primary" disabled={!ready} onClick={start}>역할 나누기 시작</button>
        {phase !== 'idle' ? <button type="button" className="arrange-secondary" onClick={reset}>결과 지우기</button> : null}
      </section>

      <section className="arrange-role-board">
        <div className="arrange-role-cards">
          {settings.roleGroups.length === 0 ? <div className="arrange-empty">왼쪽에서 역할과 인원을 추가해 주세요.</div> : settings.roleGroups.map((role) => <article key={role.id} className="arrange-role-card">
            <header><span>역할</span><strong>{role.name}</strong><small>{byRole.get(role.id)?.length || 0}/{role.count}명</small></header>
            <div>{Array.from({ length: role.count }, (_, index) => {
              const assignment = byRole.get(role.id)?.find((item) => item.slotNumber === index + 1);
              return <span className={assignment ? 'is-filled' : ''} key={`${role.id}-${index}`}>{assignment?.studentName || `${index + 1}번째`}</span>;
            })}</div>
          </article>)}
        </div>
        {phase === 'running' ? <LotteryMachine rollingName={rollingName} current={revealedCount} total={assignments.length} /> : null}
        {phase === 'done' && violations > 0 ? <div className="arrange-condition-note">조건을 모두 만족하는 조합이 없어 가장 가까운 결과로 나눴습니다. 위반 점수 {violations}</div> : null}
      </section>
    </div>
  );
}

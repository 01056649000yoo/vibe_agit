import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { arrangementSfx } from './arrangementSfx';
import { buildRoleSlots, solveRoles } from './arrangementEngine';
import RoleLotteryModal from './RoleLotteryModal';
import { useNameSize } from './NameSizeControl';

const newRoleId = () => typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `role-${Date.now()}-${Math.random()}`;
const ROLE_LOTTERY_STEP = 950;

export default function RoleArrangement({ students, settings, history, onSettingsChange, onCreateHistory }) {
  const [roleName, setRoleName] = useState('');
  const [roleCount, setRoleCount] = useState(1);
  const [phase, setPhase] = useState('idle');
  // 결과판과 뽑기 창이 **같은 크기 값**을 쓴다. 창에만 두면 닫는 순간 이름이 다시 작아진다.
  const { sizeId, setSizeId, scale } = useNameSize();
  const [assignments, setAssignments] = useState([]);
  const [revealed, setRevealed] = useState(new Set());
  const [rollingName, setRollingName] = useState('');
  const [flyingPick, setFlyingPick] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [violations, setViolations] = useState(0);
  const timers = useRef([]);
  const slots = useMemo(() => buildRoleSlots(settings.roleGroups), [settings.roleGroups]);
  const ready = students.length > 0 && slots.length === students.length && phase === 'idle';
  const visibleAssignments = useMemo(() => assignments.filter((assignment) => revealed.has(assignment.id) || phase === 'done'), [assignments, phase, revealed]);
  const byRole = useMemo(() => {
    const result = new Map(settings.roleGroups.map((role) => [role.id, []]));
    visibleAssignments.forEach((assignment) => result.get(assignment.roleId)?.push(assignment));
    return result;
  }, [settings.roleGroups, visibleAssignments]);
  const closeLotteryModal = useCallback(() => setModalOpen(false), []);

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
    setRevealed(new Set());
    setRollingName('');
    setFlyingPick(null);
    setModalOpen(false);
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
    setRevealed(new Set());
    setFlyingPick(null);
    setViolations(result.violations);
    setPhase('running');
    setModalOpen(true);
    arrangementSfx.ensure();
    const order = [...result.assignments].sort(() => Math.random() - 0.5);
    const step = ROLE_LOTTERY_STEP;
    order.forEach((pick, index) => {
      const base = index * step;
      for (let tick = 0; tick < 5; tick += 1) schedule(() => {
        setRollingName(students[Math.floor(Math.random() * students.length)]?.name || '');
        arrangementSfx.tick();
      }, base + tick * Math.max(32, step / 9));
      schedule(() => {
        setRollingName(pick.studentName);
        setFlyingPick({ ...pick, flightDuration: Math.round(step * 0.35) });
        arrangementSfx.pick();
      }, base + step * 0.55);
      schedule(() => {
        setRevealed((current) => new Set(current).add(pick.id));
        setFlyingPick((current) => current?.id === pick.id ? null : current);
        arrangementSfx.pop();
      }, base + step * 0.9);
    });
    schedule(() => { setPhase('done'); setRollingName(''); setFlyingPick(null); arrangementSfx.finish(); }, order.length * step + 120);
    await onCreateHistory('role', `역할 나누기 ${result.assignments.length}명`, {
      format: 'classroom-arrangement/role-v1',
      roleGroups: settings.roleGroups,
      settings,
      violations: result.violations,
      assignments: result.assignments
    });
  };

  return <>
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
        {phase !== 'idle' ? <button type="button" className="arrange-secondary" onClick={reset}>결과 지우기</button> : null}
      </section>

      <section className="arrange-role-board" style={{ '--arrange-name-scale': scale }}>
        {/* 시작 버튼이 왼쪽 설정 칸 맨 아래에 있어 눈에 띄지 않았다(2026-08-24 지적).
            결과가 나오는 자리 바로 위, 오른쪽에 둔다. */}
        <div className="arrange-panel-heading">
          <div><h3>역할 나누기</h3><p>모든 역할 인원을 채우면 시작할 수 있습니다.</p></div>
          <button type="button" className="arrange-primary" disabled={!ready} onClick={start}>역할 나누기 시작</button>
        </div>
        <div className="arrange-role-cards">
          {settings.roleGroups.length === 0 ? <div className="arrange-empty">왼쪽에서 역할과 인원을 추가해 주세요.</div> : settings.roleGroups.map((role) => <article key={role.id} className="arrange-role-card">
            <header><span>역할</span><strong>{role.name}</strong><small>{byRole.get(role.id)?.length || 0}/{role.count}명</small></header>
            <div>{Array.from({ length: role.count }, (_, index) => {
              const assignment = byRole.get(role.id)?.find((item) => item.slotNumber === index + 1);
              return <span className={assignment ? 'is-filled' : ''} key={`${role.id}-${index}`}>{assignment?.studentName || `${index + 1}번째`}</span>;
            })}</div>
          </article>)}
        </div>
        {phase === 'done' && violations > 0 ? <div className="arrange-condition-note">조건을 모두 만족하는 조합이 없어 가장 가까운 결과로 나눴습니다. 위반 점수 {violations}</div> : null}
      </section>
    </div>
    {modalOpen ? <RoleLotteryModal roleGroups={settings.roleGroups} assignments={assignments} revealed={revealed} rollingName={rollingName} flyingPick={flyingPick} phase={phase} onClose={closeLotteryModal} onCancel={reset} sizeId={sizeId} onSizeChange={setSizeId} scale={scale} /> : null}
  </>;
}

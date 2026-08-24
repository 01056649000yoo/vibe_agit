import React, { useMemo } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import LotteryMachine from './LotteryMachine';
import NameSizeControl from './NameSizeControl';
import { useLotteryDialog, useLotteryFlight } from './lotteryModalHooks';

export default function RoleLotteryModal({ roleGroups, assignments, revealed, rollingName, flyingPick, phase, onClose, onCancel, sizeId, onSizeChange, scale }) {
  const { dialogRef, finishButtonRef } = useLotteryDialog(phase, onClose);
  const { sourceRef, flight } = useLotteryFlight(flyingPick, 'data-modal-role-slot', flyingPick?.id);
  const assignmentBySlot = useMemo(() => new Map(assignments.map((item) => [item.id, item])), [assignments]);
  const filledByRole = useMemo(() => {
    const counts = new Map(roleGroups.map((role) => [role.id, 0]));
    assignments.forEach((item) => {
      if (revealed.has(item.id)) counts.set(item.roleId, (counts.get(item.roleId) || 0) + 1);
    });
    return counts;
  }, [assignments, revealed, roleGroups]);
  const completed = revealed.size;

  return <ModalPortal>
    <div className="arrange-seat-lottery-backdrop">
      <section ref={dialogRef} className="arrange-seat-lottery-modal" style={{ '--arrange-name-scale': scale }} role="dialog" aria-modal="true" aria-labelledby="role-lottery-title" aria-describedby="role-lottery-description" tabIndex="-1">
        <header className="arrange-seat-lottery-header">
          <div><span>실시간 역할 추첨</span><h2 id="role-lottery-title">누가 어떤 역할을 맡을까요?</h2><p id="role-lottery-description">한 명씩 뽑아 이름표가 도착한 역할 칸에 바로 배정합니다.</p></div>
          <NameSizeControl sizeId={sizeId} onChange={onSizeChange} />
          <strong>{completed} / {assignments.length}명</strong>
        </header>

        <div className="arrange-seat-lottery-body">
          <aside className="arrange-seat-draw-stage arrange-role-draw-stage">
            <div ref={sourceRef} className="arrange-seat-machine-wrap">
              <LotteryMachine rollingName={rollingName} current={completed} total={assignments.length} />
            </div>
            <div className={`arrange-seat-draw-callout ${flyingPick ? 'is-picked' : ''}`} role="status" aria-live="polite">
              {phase === 'done' ? <><strong>모든 역할을 나눴습니다!</strong><span>완성된 역할표를 확인해 보세요.</span></> : flyingPick ? <><strong>{flyingPick.studentName}</strong><span>{flyingPick.roleName} 역할로 이동 중!</span></> : <><strong>{rollingName || '추첨 준비'}</strong><span>다음 이름과 역할을 뽑고 있어요.</span></>}
            </div>
          </aside>

          <div className="arrange-role-lottery-board">
            <div className="arrange-role-lottery-title">우리 반 역할표</div>
            <div className="arrange-role-lottery-cards">
              {roleGroups.map((role) => {
                const filledCount = filledByRole.get(role.id) || 0;
                return <article key={role.id} className="arrange-role-lottery-card">
                  <header><div><span>역할</span><strong>{role.name}</strong></div><small>{filledCount}/{role.count}명</small></header>
                  <div>{Array.from({ length: role.count }, (_, index) => {
                    const slotId = `${role.id}-${index + 1}`;
                    const assignment = assignmentBySlot.get(slotId);
                    const visible = revealed.has(slotId) || phase === 'done';
                    return <span key={slotId} data-modal-role-slot={slotId} className={`arrange-role-lottery-slot ${flyingPick?.id === slotId ? 'is-target' : ''} ${visible ? 'is-filled' : ''}`}>
                      <small>{index + 1}번째</small><strong>{visible && assignment ? assignment.studentName : '대기'}</strong>
                    </span>;
                  })}</div>
                </article>;
              })}
            </div>
          </div>
        </div>

        <footer className={phase === 'done' ? 'is-done' : ''}>
          {phase === 'done' ? <><div><strong>역할 나누기 완료</strong><span>모든 학생의 이름표가 역할 칸에 도착했습니다.</span></div><button ref={finishButtonRef} type="button" onClick={onClose}>완성된 역할표 보기</button></> : <>
            <span className="arrange-seat-lottery-pulse" aria-hidden="true" />
            <strong>역할 뽑기를 하고 있어요.</strong>
            {/* 되돌릴 수 없으므로 한 번 물어본다. 수업 중에 잘못 눌러 처음부터 다시 하는 일이 없게. */}
            <button
              type="button"
              className="arrange-lottery-cancel"
              onClick={() => { if (window.confirm('역할 뽑기를 중단할까요?\n지금까지 뽑은 결과는 사라집니다.')) onCancel?.(); }}
            >
              중단하기
            </button>
          </>}
        </footer>
      </section>
      {flight && flyingPick ? <span key={flight.key} className="arrange-seat-flight arrange-role-flight" aria-hidden="true" style={{
        '--flight-left': `${flight.startX}px`,
        '--flight-top': `${flight.startY}px`,
        '--flight-x': `${flight.deltaX}px`,
        '--flight-y': `${flight.deltaY}px`,
        '--flight-mid-x': `${flight.midX}px`,
        '--flight-mid-y': `${flight.midY}px`,
        '--flight-duration': `${flight.duration}ms`
      }}>{flight.name}</span> : null}
    </div>
  </ModalPortal>;
}

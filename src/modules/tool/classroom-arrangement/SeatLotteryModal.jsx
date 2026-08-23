import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import LotteryMachine from './LotteryMachine';
import { seatKey } from './arrangementEngine';

export default function SeatLotteryModal({ rows, cols, activeSeats, assignments, revealed, rollingName, flyingPick, phase, onClose }) {
  const dialogRef = useRef(null);
  const sourceRef = useRef(null);
  const finishButtonRef = useRef(null);
  const [flight, setFlight] = useState(null);
  const assignmentBySeat = useMemo(() => new Map(assignments.map((item) => [item.seatKey, item])), [assignments]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    if (phase === 'done') finishButtonRef.current?.focus();
    const handleDialogKeys = (event) => {
      if (event.key === 'Escape' && phase === 'done') onClose();
      if (event.key !== 'Tab') return;
      const focusable = [...(dialogRef.current?.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])') || [])];
      if (focusable.length === 0) {
        event.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleDialogKeys);
    return () => window.removeEventListener('keydown', handleDialogKeys);
  }, [onClose, phase]);

  useLayoutEffect(() => {
    if (!flyingPick) return undefined;
    const frame = window.requestAnimationFrame(() => {
      const source = sourceRef.current?.getBoundingClientRect();
      const target = document.querySelector(`[data-modal-seat="${CSS.escape(flyingPick.seatKey)}"]`)?.getBoundingClientRect();
      if (!source || !target) return;
      const startX = source.left + source.width / 2;
      const startY = source.top + source.height * 0.58;
      const deltaX = target.left + target.width / 2 - startX;
      const deltaY = target.top + target.height / 2 - startY;
      setFlight({
        key: `${flyingPick.studentId}-${flyingPick.seatKey}`,
        name: flyingPick.studentName,
        startX,
        startY,
        deltaX,
        deltaY,
        midX: deltaX * 0.52,
        midY: deltaY * 0.52 - 42,
        duration: flyingPick.flightDuration
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [flyingPick]);

  const completed = revealed.size;
  return <ModalPortal>
    <div className="arrange-seat-lottery-backdrop">
      <section ref={dialogRef} className="arrange-seat-lottery-modal" role="dialog" aria-modal="true" aria-labelledby="seat-lottery-title" aria-describedby="seat-lottery-description" tabIndex="-1">
        <header className="arrange-seat-lottery-header">
          <div><span>실시간 자리 추첨</span><h2 id="seat-lottery-title">누가 어느 자리에 앉을까요?</h2><p id="seat-lottery-description">한 명씩 뽑아 이름표가 도착한 자리에 바로 배치합니다.</p></div>
          <strong>{completed} / {assignments.length}명</strong>
        </header>

        <div className="arrange-seat-lottery-body">
          <aside className="arrange-seat-draw-stage">
            <div ref={sourceRef} className="arrange-seat-machine-wrap">
              <LotteryMachine rollingName={rollingName} current={completed} total={assignments.length} />
            </div>
            <div className={`arrange-seat-draw-callout ${flyingPick ? 'is-picked' : ''}`} role="status" aria-live="polite">
              {phase === 'done' ? <><strong>모두 배치했습니다!</strong><span>완성된 자리표를 확인해 보세요.</span></> : flyingPick ? <><strong>{flyingPick.studentName}</strong><span>학생의 자리로 이동 중!</span></> : <><strong>{rollingName || '추첨 준비'}</strong><span>다음 이름을 뽑고 있어요.</span></>}
            </div>
          </aside>

          <div className="arrange-seat-lottery-board">
            <div className="arrange-seat-lottery-blackboard">교탁 · 칠판</div>
            <div className="arrange-seat-lottery-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(48px, 1fr))` }}>
              {Array.from({ length: rows * cols }, (_, index) => {
                const row = Math.floor(index / cols);
                const col = index % cols;
                const key = seatKey(row, col);
                const active = activeSeats.has(key);
                const assigned = assignmentBySeat.get(key);
                const visible = revealed.has(key) || phase === 'done';
                return <div key={key} data-modal-seat={key} className={`arrange-seat-lottery-seat ${active ? 'is-active' : ''} ${flyingPick?.seatKey === key ? 'is-target' : ''} ${visible ? 'is-filled' : ''}`}>
                  {active ? <><small>{row + 1}-{col + 1}</small><strong>{visible && assigned ? assigned.studentName : '대기'}</strong></> : null}
                </div>;
              })}
            </div>
          </div>
        </div>

        <footer className={phase === 'done' ? 'is-done' : ''}>
          {phase === 'done' ? <><div><strong>자리 배치 완료</strong><span>모든 학생의 이름표가 자리에 도착했습니다.</span></div><button ref={finishButtonRef} type="button" onClick={onClose}>완성된 자리표 보기</button></> : <><span className="arrange-seat-lottery-pulse" aria-hidden="true" /><strong>추첨이 끝날 때까지 창을 그대로 두세요.</strong></>}
        </footer>
      </section>
      {flight && flyingPick ? <span key={flight.key} className="arrange-seat-flight" aria-hidden="true" style={{
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

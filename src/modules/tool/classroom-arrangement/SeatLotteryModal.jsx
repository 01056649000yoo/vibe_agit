import React, { useMemo } from 'react';
import ModalPortal from '../../../components/common/ModalPortal';
import LotteryMachine from './LotteryMachine';
import { seatKey } from './arrangementEngine';
import NameSizeControl from './NameSizeControl';
import { useLotteryDialog, useLotteryFlight } from './lotteryModalHooks';

export default function SeatLotteryModal({ rows, cols, activeSeats, assignments, revealed, rollingName, flyingPick, phase, onClose, onCancel, sizeId, onSizeChange, scale }) {
  const { dialogRef, finishButtonRef } = useLotteryDialog(phase, onClose);
  const { sourceRef, flight } = useLotteryFlight(flyingPick, 'data-modal-seat', flyingPick?.seatKey);
  const assignmentBySeat = useMemo(() => new Map(assignments.map((item) => [item.seatKey, item])), [assignments]);

  const completed = revealed.size;
  return <ModalPortal>
    <div className="arrange-seat-lottery-backdrop">
      <section ref={dialogRef} className="arrange-seat-lottery-modal" style={{ '--arrange-name-scale': scale }} role="dialog" aria-modal="true" aria-labelledby="seat-lottery-title" aria-describedby="seat-lottery-description" tabIndex="-1">
        <header className="arrange-seat-lottery-header">
          <div><span>실시간 자리 추첨</span><h2 id="seat-lottery-title">누가 어느 자리에 앉을까요?</h2><p id="seat-lottery-description">한 명씩 뽑아 이름표가 도착한 자리에 바로 배치합니다.</p></div>
          <NameSizeControl sizeId={sizeId} onChange={onSizeChange} />
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
          {phase === 'done' ? <><div><strong>자리 배치 완료</strong><span>모든 학생의 이름표가 자리에 도착했습니다.</span></div><button ref={finishButtonRef} type="button" onClick={onClose}>완성된 자리표 보기</button></> : <>
            <span className="arrange-seat-lottery-pulse" aria-hidden="true" />
            <strong>자리 뽑기를 하고 있어요.</strong>
            {/* 되돌릴 수 없으므로 한 번 물어본다. 수업 중에 잘못 눌러 처음부터 다시 하는 일이 없게. */}
            <button
              type="button"
              className="arrange-lottery-cancel"
              onClick={() => { if (window.confirm('자리 뽑기를 중단할까요?\n지금까지 뽑은 결과는 사라집니다.')) onCancel?.(); }}
            >
              중단하기
            </button>
          </>}
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

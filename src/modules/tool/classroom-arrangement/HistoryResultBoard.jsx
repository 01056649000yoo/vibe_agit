import React from 'react';
import { seatKey } from './arrangementEngine';
import { buildRoleHistoryResult, buildSeatHistoryResult } from './historyResult';

function SeatHistoryBoard({ payload }) {
  const { rows, cols, activeSeats, assignmentBySeat } = buildSeatHistoryResult(payload);
  return <div className="arrange-history-board is-seat" aria-label="저장된 자리 배치 결과">
    <div className="arrange-seat-lottery-blackboard">칠판</div>
    <div className="arrange-history-seat-grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(calc(54px * var(--arrange-name-scale, 1)), 1fr))` }}>
      {Array.from({ length: rows * cols }, (_, index) => {
        const row = Math.floor(index / cols);
        const col = index % cols;
        const key = seatKey(row, col);
        const active = activeSeats.has(key);
        const assignment = assignmentBySeat.get(key);
        return <span key={key} className={`arrange-seat-lottery-seat ${active ? 'is-active' : ''} ${assignment ? 'is-filled' : ''}`}>
          {active ? <><small>{row + 1}-{col + 1}</small><strong>{assignment?.studentName || '빈 자리'}</strong></> : null}
        </span>;
      })}
    </div>
  </div>;
}

function RoleHistoryBoard({ payload }) {
  const roles = buildRoleHistoryResult(payload);
  return <div className="arrange-history-board is-role" aria-label="저장된 역할 나누기 결과">
    <div className="arrange-role-lottery-title">우리 반 역할표</div>
    <div className="arrange-history-role-cards">
      {roles.map((role) => <article key={role.id} className="arrange-role-lottery-card">
        <header><div><span>역할</span><strong>{role.name}</strong></div><small>{role.assignments.length}/{role.count}명</small></header>
        <div>{role.assignments.map((assignment, index) => <span key={`${assignment.studentId || assignment.studentName}-${index}`} className="arrange-role-lottery-slot is-filled">
          <small>{Number(assignment.slotNumber) || index + 1}번째</small><strong>{assignment.studentName}</strong>
        </span>)}</div>
      </article>)}
    </div>
  </div>;
}

export default function HistoryResultBoard({ kind, payload }) {
  return kind === 'seat' ? <SeatHistoryBoard payload={payload} /> : <RoleHistoryBoard payload={payload} />;
}

import React, { useState } from 'react';

function PairEditor({ title, description, pairs, students, onChange }) {
  const [left, setLeft] = useState('');
  const [right, setRight] = useState('');
  const names = new Map(students.map((student) => [String(student.id), student.name]));
  const add = () => {
    if (!left || !right || left === right) return;
    if (pairs.some(([a, b]) => (a === left && b === right) || (a === right && b === left))) return;
    onChange([...pairs, [left, right]]);
    setLeft('');
    setRight('');
  };
  return (
    <section className="arrange-settings-card">
      <h4>{title}</h4>
      <p>{description}</p>
      <div className="arrange-inline-form">
        <select value={left} onChange={(event) => setLeft(event.target.value)}><option value="">학생 A</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
        <span>↔</span>
        <select value={right} onChange={(event) => setRight(event.target.value)}><option value="">학생 B</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
        <button type="button" className="arrange-small-button is-dark" disabled={!left || !right || left === right} onClick={add}>추가</button>
      </div>
      <div className="arrange-chip-row">
        {pairs.map(([a, b], index) => <span className="arrange-chip is-warning" key={`${a}-${b}`}>
          {names.get(a) || '알 수 없음'} ↔ {names.get(b) || '알 수 없음'}
          <button type="button" aria-label="금지 조합 삭제" onClick={() => onChange(pairs.filter((_, pairIndex) => pairIndex !== index))}>×</button>
        </span>)}
      </div>
    </section>
  );
}

export default function ArrangementSettings({ students, seat, role, studentGroups, onSeatChange, onRoleChange, onGroupsChange }) {
  const [fixedStudent, setFixedStudent] = useState('');
  const [fixedRow, setFixedRow] = useState(1);
  const [fixedCol, setFixedCol] = useState(1);
  const names = new Map(students.map((student) => [String(student.id), student.name]));
  const addFixed = () => {
    if (!fixedStudent) return;
    const filtered = seat.fixedSeats.filter((item) => item.studentId !== fixedStudent);
    onSeatChange({ ...seat, fixedSeats: [...filtered, { studentId: fixedStudent, row: fixedRow, col: fixedCol }] });
    setFixedStudent('');
  };
  return (
    <div className="arrange-settings-grid">
      <section className="arrange-settings-card is-wide">
        <h3>학생 배치 구분</h3>
        <p>아지트 명부에는 성별을 저장하지 않습니다. 필요한 경우 이 도구 안에서만 A/B 구분을 선택해 균형 배치에 사용하세요.</p>
        <div className="arrange-student-groups">
          {students.map((student) => <label key={student.id}>
            <span>{student.name}</span>
            <select value={studentGroups[student.id] || ''} onChange={(event) => onGroupsChange({ ...studentGroups, [student.id]: event.target.value || undefined })}>
              <option value="">구분 없음</option><option value="A">A</option><option value="B">B</option>
            </select>
          </label>)}
        </div>
      </section>

      <PairEditor title="자리 배치 · 옆자리 금지" description="서로 좌우 옆자리가 되면 안 되는 학생을 등록합니다." pairs={seat.forbiddenPairs} students={students} onChange={(pairs) => onSeatChange({ ...seat, forbiddenPairs: pairs })} />
      <PairEditor title="역할 나누기 · 같은 역할 금지" description="한 역할에 함께 배정되면 안 되는 학생을 등록합니다." pairs={role.forbiddenPairs} students={students} onChange={(pairs) => onRoleChange({ ...role, forbiddenPairs: pairs })} />

      <section className="arrange-settings-card">
        <h4>자리 배치 조건</h4>
        <label className="arrange-toggle-row"><input type="checkbox" checked={seat.balanceMode === 'strict'} onChange={(event) => onSeatChange({ ...seat, balanceMode: event.target.checked ? 'strict' : 'none' })} /><span>A/B를 좌우로 번갈아 배치</span></label>
        <label className="arrange-toggle-row"><input type="checkbox" checked={seat.avoidDuplicates} onChange={(event) => onSeatChange({ ...seat, avoidDuplicates: event.target.checked })} /><span>최근 5회 같은 자리·옆자리 피하기</span></label>
      </section>

      <section className="arrange-settings-card">
        <h4>역할 나누기 조건</h4>
        <label className="arrange-toggle-row"><input type="checkbox" checked={role.balanceMode === 'strict'} onChange={(event) => onRoleChange({ ...role, balanceMode: event.target.checked ? 'strict' : 'none' })} /><span>한 역할 안에서 A/B 섞기</span></label>
        <label className="arrange-toggle-row"><input type="checkbox" checked={role.avoidDuplicates} onChange={(event) => onRoleChange({ ...role, avoidDuplicates: event.target.checked })} /><span>최근 8회 같은 역할 피하기</span></label>
      </section>

      <section className="arrange-settings-card is-wide">
        <h4>고정 자리</h4>
        <p>행과 열은 교사 화면 위쪽부터 1번입니다.</p>
        <div className="arrange-inline-form">
          <select value={fixedStudent} onChange={(event) => setFixedStudent(event.target.value)}><option value="">학생 선택</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
          <input type="number" aria-label="고정 자리 행" min="1" max="30" value={fixedRow} onChange={(event) => setFixedRow(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} />
          <input type="number" aria-label="고정 자리 열" min="1" max="30" value={fixedCol} onChange={(event) => setFixedCol(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} />
          <button type="button" className="arrange-small-button is-dark" disabled={!fixedStudent} onClick={addFixed}>고정</button>
        </div>
        <div className="arrange-chip-row">
          {seat.fixedSeats.map((item) => <span className="arrange-chip is-info" key={item.studentId}>{names.get(item.studentId) || '알 수 없음'} → {item.row}행 {item.col}열<button type="button" aria-label="고정 자리 삭제" onClick={() => onSeatChange({ ...seat, fixedSeats: seat.fixedSeats.filter((fixed) => fixed.studentId !== item.studentId) })}>×</button></span>)}
        </div>
      </section>
    </div>
  );
}

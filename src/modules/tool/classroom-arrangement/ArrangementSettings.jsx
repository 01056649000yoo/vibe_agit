import React, { useState } from 'react';

function PairEditor({ title, description, pairs, students, onChange, chipClass = 'is-warning', deleteLabel = '조합 삭제' }) {
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

  return <div className="arrange-settings-block">
    <div className="arrange-settings-block-heading"><h4>{title}</h4><p>{description}</p></div>
    <div className="arrange-inline-form">
      <select aria-label={`${title} 첫 번째 학생`} value={left} onChange={(event) => setLeft(event.target.value)}><option value="">첫 번째 학생</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
      <span>↔</span>
      <select aria-label={`${title} 두 번째 학생`} value={right} onChange={(event) => setRight(event.target.value)}><option value="">두 번째 학생</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
      <button type="button" className="arrange-small-button is-dark" disabled={!left || !right || left === right} onClick={add}>추가</button>
    </div>
    {pairs.length > 0 ? <div className="arrange-chip-row">
      {pairs.map(([a, b], index) => <span className={`arrange-chip ${chipClass}`} key={`${a}-${b}`}>
        {names.get(a) || '알 수 없음'} ↔ {names.get(b) || '알 수 없음'}
        <button type="button" aria-label={deleteLabel} onClick={() => onChange(pairs.filter((_, pairIndex) => pairIndex !== index))}>×</button>
      </span>)}
    </div> : null}
  </div>;
}

export default function ArrangementSettings({ students, seat, role, studentGroups, onSeatChange, onRoleChange, onGroupsChange }) {
  const [fixedStudent, setFixedStudent] = useState('');
  const [fixedRow, setFixedRow] = useState(1);
  const [fixedCol, setFixedCol] = useState(1);
  const names = new Map(students.map((student) => [String(student.id), student.name]));
  const maleCount = students.filter((student) => studentGroups[student.id] === 'A').length;
  const femaleCount = students.filter((student) => studentGroups[student.id] === 'B').length;
  const unassignedCount = students.length - maleCount - femaleCount;

  const addFixed = () => {
    if (!fixedStudent) return;
    const filtered = seat.fixedSeats.filter((item) => item.studentId !== fixedStudent && (item.row !== fixedRow || item.col !== fixedCol));
    onSeatChange({ ...seat, fixedSeats: [...filtered, { studentId: fixedStudent, row: fixedRow, col: fixedCol }] });
    setFixedStudent('');
  };

  return <div className="arrange-settings-grid">
    <section className="arrange-settings-card arrange-gender-card">
      <header className="arrange-settings-heading">
        <div><h3>학생 남녀 구분</h3><p>균형 배치에만 사용하며 아지트 학생 기본정보에는 저장하지 않습니다.</p></div>
        <div className="arrange-gender-summary" aria-label={`남 ${maleCount}명, 여 ${femaleCount}명, 미지정 ${unassignedCount}명`}>
          <span className="is-male">남 {maleCount}</span><span className="is-female">여 {femaleCount}</span><span>미지정 {unassignedCount}</span>
        </div>
      </header>
      <div className="arrange-student-groups">
        {students.map((student) => <label key={student.id}>
          <span>{student.name}</span>
          <select aria-label={`${student.name} 남녀 구분`} value={studentGroups[student.id] || ''} onChange={(event) => onGroupsChange({ ...studentGroups, [student.id]: event.target.value || undefined })}>
            <option value="">미지정</option><option value="A">남</option><option value="B">여</option>
          </select>
        </label>)}
      </div>
    </section>

    <section className="arrange-settings-card arrange-settings-column">
      <header className="arrange-settings-heading"><div><span className="arrange-settings-kicker">자리</span><h3>자리 배치 설정</h3><p>바로 붙은 위·아래·왼쪽·오른쪽 좌석을 모두 이웃으로 봅니다.</p></div></header>
      <div className="arrange-condition-section is-required">
        <div className="arrange-condition-title"><strong>반드시 지킬 조건</strong><span>만족할 수 없으면 배치를 시작하지 않습니다.</span></div>
        <PairEditor title="이웃하면 안 되는 학생" description="두 학생이 상·하·좌·우 이웃이 되지 않게 합니다." pairs={seat.forbiddenPairs} students={students} onChange={(pairs) => onSeatChange({ ...seat, forbiddenPairs: pairs })} deleteLabel="이웃 금지 조합 삭제" />
        <div className="arrange-settings-block">
        <div className="arrange-settings-block-heading"><h4>고정 자리</h4><p>교사 화면 위쪽부터 행·열 번호를 셉니다.</p></div>
        <div className="arrange-fixed-form">
          <select aria-label="고정할 학생" value={fixedStudent} onChange={(event) => setFixedStudent(event.target.value)}><option value="">학생 선택</option>{students.map((student) => <option key={student.id} value={student.id}>{student.name}</option>)}</select>
          <label><span>행</span><input type="number" aria-label="고정 자리 행" min="1" max="30" value={fixedRow} onChange={(event) => setFixedRow(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label>
          <label><span>열</span><input type="number" aria-label="고정 자리 열" min="1" max="30" value={fixedCol} onChange={(event) => setFixedCol(Math.max(1, Math.min(30, Number(event.target.value) || 1)))} /></label>
          <button type="button" className="arrange-small-button is-dark" disabled={!fixedStudent} onClick={addFixed}>고정</button>
        </div>
        {seat.fixedSeats.length > 0 ? <div className="arrange-chip-row">
          {seat.fixedSeats.map((item) => <span className="arrange-chip is-info" key={item.studentId}>{names.get(item.studentId) || '알 수 없음'} → {item.row}행 {item.col}열<button type="button" aria-label="고정 자리 삭제" onClick={() => onSeatChange({ ...seat, fixedSeats: seat.fixedSeats.filter((fixed) => fixed.studentId !== item.studentId) })}>×</button></span>)}
        </div> : null}
        </div>
      </div>
      <div className="arrange-condition-section is-preferred">
        <div className="arrange-condition-title"><strong>가능하면 반영할 조건</strong><span>서로 충돌하면 전체적으로 가장 가까운 결과를 찾습니다.</span></div>
        <div className="arrange-condition-grid">
          <label className="arrange-toggle-row"><input type="checkbox" checked={seat.balanceMode === 'strict'} onChange={(event) => onSeatChange({ ...seat, balanceMode: event.target.checked ? 'strict' : 'none' })} /><span>상·하·좌·우 이웃에 남녀가 골고루 섞이도록 배치</span></label>
          <label className="arrange-toggle-row"><input type="checkbox" checked={seat.avoidSameSeat} onChange={(event) => onSeatChange({ ...seat, avoidSameSeat: event.target.checked })} /><span>최근 5회 같은 자리 피하기</span></label>
          <label className="arrange-toggle-row"><input type="checkbox" checked={seat.avoidSameNeighbor} onChange={(event) => onSeatChange({ ...seat, avoidSameNeighbor: event.target.checked })} /><span>최근 5회 같은 이웃 피하기</span></label>
        </div>
        <PairEditor title="가까이 배치할 학생" description="두 학생이 상·하·좌·우 이웃이 되도록 우선합니다." pairs={seat.preferredPairs} students={students} onChange={(pairs) => onSeatChange({ ...seat, preferredPairs: pairs })} chipClass="is-info" deleteLabel="가까이 배치 조합 삭제" />
      </div>
    </section>

    <section className="arrange-settings-card arrange-settings-column">
      <header className="arrange-settings-heading"><div><span className="arrange-settings-kicker is-role">역할</span><h3>역할 나누기 설정</h3></div></header>
      <div className="arrange-condition-grid">
        <label className="arrange-toggle-row"><input type="checkbox" checked={role.balanceMode === 'strict'} onChange={(event) => onRoleChange({ ...role, balanceMode: event.target.checked ? 'strict' : 'none' })} /><span>한 역할 안에서 남녀 섞기</span></label>
        <label className="arrange-toggle-row"><input type="checkbox" checked={role.avoidDuplicates} onChange={(event) => onRoleChange({ ...role, avoidDuplicates: event.target.checked })} /><span>최근 8회 같은 역할 피하기</span></label>
      </div>
      <PairEditor title="같은 역할 금지" description="한 역할에 함께 배정되면 안 되는 학생" pairs={role.forbiddenPairs} students={students} onChange={(pairs) => onRoleChange({ ...role, forbiddenPairs: pairs })} />
      <div className="arrange-settings-tip"><strong>설정 저장 안내</strong><span>남녀 구분과 조건을 바꾼 뒤 화면 위의 설정 저장을 눌러 다른 기기에서도 이어서 사용하세요.</span></div>
    </section>
  </div>;
}

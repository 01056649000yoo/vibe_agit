import React from 'react';

export default function HiddenClassBoardPanel({ boards = [], loading, disabled, onRestore, onClose }) {
  return (
    <section id="class-board-hidden-tabs-panel" className="class-board-hidden-tabs" aria-labelledby="class-board-hidden-tabs-title">
      <header>
        <div>
          <strong id="class-board-hidden-tabs-title">숨긴 탭 복구</strong>
          <span>예전 `보관`으로 사라진 스크린도 여기에서 다시 탭으로 돌릴 수 있습니다.</span>
        </div>
        <button type="button" onClick={onClose}>닫기</button>
      </header>
      {loading ? <p role="status">숨긴 탭을 찾는 중…</p> : boards.length > 0 ? (
        <div className="class-board-hidden-tabs__list">
          {boards.map((board) => (
            <div key={board.id}>
              <span>{board.title || '제목 없는 스크린'}</span>
              <button type="button" disabled={disabled} onClick={() => onRestore(board.id)}>상단 탭으로 복구</button>
            </div>
          ))}
        </div>
      ) : <p>숨겨진 스크린이 없습니다.</p>}
    </section>
  );
}

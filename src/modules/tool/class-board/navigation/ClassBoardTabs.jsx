import React from 'react';

export default function ClassBoardTabs({ boards = [], currentBoard, dirty, disabled, onSelect, onCreate }) {
  const currentId = currentBoard?.id || (currentBoard ? 'draft' : null);
  const visibleBoards = currentBoard?.id
    ? boards.map((item) => item.id === currentBoard.id ? { ...item, title: currentBoard.title } : item)
    : currentBoard
      ? [{ ...currentBoard, id: 'draft', title: currentBoard.title || '새 스크린' }, ...boards]
      : boards;

  return (
    <div className="class-board-tabs" aria-label="저장한 스크린 탭">
      <div className="class-board-tabs__scroller" role="tablist" aria-label="스크린 탭 목록">
        {visibleBoards.map((item) => {
          const selected = item.id === currentId;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={selected}
              className={selected ? 'is-active' : ''}
              disabled={disabled}
              title={item.title}
              onClick={() => { if (!selected && item.id !== 'draft') onSelect(item); }}
            >
              <span>{item.title || '제목 없는 스크린'}</span>
              {selected && dirty ? <small>수정 중</small> : item.isActive ? <small>현재</small> : null}
            </button>
          );
        })}
      </div>
      <button type="button" className="class-board-tabs__new" disabled={disabled} onClick={onCreate}>＋ 새 탭</button>
    </div>
  );
}

import React from 'react';

export default function ClassBoardTabs({
  boards = [],
  currentBoard,
  dirty,
  disabled,
  saving,
  deletedPanelOpen,
  onSelect,
  onCreate,
  onSave,
  onDelete,
  onDuplicate,
  onOpenDeleted,
}) {
  const currentId = currentBoard?.id || (currentBoard ? 'draft' : null);
  const savedBoardReady = Boolean(currentBoard?.id) && !dirty && !disabled;
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
      <div className="class-board-tabs__actions" role="group" aria-label="탭 관리">
        <button type="button" className="is-create" disabled={disabled} onClick={onCreate}>＋ 새 탭</button>
        <button type="button" className="is-save" disabled={!currentBoard || !dirty || disabled} onClick={onSave}>
          {saving ? '저장 중…' : '저장'}
        </button>
        <button
          type="button"
          className="is-delete"
          disabled={!savedBoardReady}
          title={dirty ? '먼저 변경 내용을 저장해 주세요.' : '삭제한 탭은 복구할 수 있습니다.'}
          onClick={onDelete}
        >삭제</button>
        <button type="button" disabled={!savedBoardReady} onClick={onDuplicate}>복제</button>
        <button
          type="button"
          aria-controls="class-board-hidden-tabs-panel"
          aria-expanded={deletedPanelOpen}
          disabled={disabled}
          onClick={onOpenDeleted}
        >{deletedPanelOpen ? '복구 닫기' : '복구'}</button>
      </div>
    </div>
  );
}

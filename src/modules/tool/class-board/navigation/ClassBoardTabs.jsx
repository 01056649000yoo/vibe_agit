import React, { useState } from 'react';
import { moveClassBoardTab } from './tabOrder';

export default function ClassBoardTabs({
  boards = [],
  currentBoard,
  /* 아직 저장되지 않은 변경이 있는지(자동 저장 대기 중). */
  dirty,
  disabled,
  canUndo = false,
  deletedPanelOpen,
  draftIndex = 0,
  defaultingBoardId,
  onSelect,
  onCreate,
  onUndo,
  onDelete,
  onDuplicate,
  onOpenDeleted,
  onReorder,
  onSetDefault,
}) {
  const [draggedId, setDraggedId] = useState(null);
  const [dropTargetId, setDropTargetId] = useState(null);
  const currentId = currentBoard?.id || (currentBoard ? 'draft' : null);
  // 자동 저장이라 삭제·복제 전에 남은 변경을 먼저 저장한다(화면 쪽). 저장된 탭이면 누를 수 있다.
  const savedBoardReady = Boolean(currentBoard?.id) && !disabled;
  const visibleBoards = currentBoard?.id
    ? boards.map((item) => item.id === currentBoard.id ? { ...item, title: currentBoard.title } : item)
    : currentBoard
      ? [...boards]
      : boards;
  if (currentBoard && !currentBoard.id) {
    const nextDraftIndex = Math.min(Math.max(Number(draftIndex) || 0, 0), visibleBoards.length);
    visibleBoards.splice(nextDraftIndex, 0, { ...currentBoard, id: 'draft', title: currentBoard.title || '새 스크린' });
  }

  const commitOrder = (nextItems) => {
    if (nextItems === visibleBoards) return;
    onReorder(nextItems.map((item) => item.id));
  };

  const moveWithKeyboard = (event, itemId) => {
    if (!event.altKey || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    const currentIndex = visibleBoards.findIndex((item) => item.id === itemId);
    const targetIndex = currentIndex + (event.key === 'ArrowLeft' ? -1 : 1);
    if (targetIndex < 0 || targetIndex >= visibleBoards.length) return;
    const targetItem = visibleBoards.at(targetIndex);
    if (!targetItem) return;
    event.preventDefault();
    commitOrder(moveClassBoardTab(visibleBoards, itemId, targetItem.id));
  };

  return (
    <div className="class-board-tabs" aria-label="저장한 스크린 탭">
      <div className="class-board-tabs__scroller" role="tablist" aria-label="스크린 탭 목록" aria-orientation="horizontal">
        {visibleBoards.map((item) => {
          const selected = item.id === currentId;
          const isDraft = item.id === 'draft';
          return (
            <div
              key={item.id}
              role="presentation"
              className={`class-board-tab-item${selected ? ' is-active' : ''}${draggedId === item.id ? ' is-dragging' : ''}${dropTargetId === item.id ? ' is-drop-target' : ''}`}
              draggable={!disabled}
              onDragStart={(event) => {
                setDraggedId(item.id);
                event.dataTransfer.effectAllowed = 'move';
                event.dataTransfer.setData('text/plain', item.id);
              }}
              onDragOver={(event) => {
                if (!draggedId || draggedId === item.id) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = 'move';
                setDropTargetId(item.id);
              }}
              onDragLeave={() => setDropTargetId((current) => current === item.id ? null : current)}
              onDrop={(event) => {
                event.preventDefault();
                const sourceId = draggedId || event.dataTransfer.getData('text/plain');
                commitOrder(moveClassBoardTab(visibleBoards, sourceId, item.id));
                setDraggedId(null);
                setDropTargetId(null);
              }}
              onDragEnd={() => {
                setDraggedId(null);
                setDropTargetId(null);
              }}
            >
              <button
                type="button"
                role="tab"
                aria-selected={selected}
                disabled={disabled}
                title={`${item.title} · 드래그 또는 Alt+←/→로 순서 변경`}
                onKeyDown={(event) => moveWithKeyboard(event, item.id)}
                onClick={() => { if (!selected && !isDraft) onSelect(item); }}
              >
                <span>{item.title || '제목 없는 스크린'}</span>
                {selected && dirty ? <small>수정 중</small> : item.isActive ? <small>현재</small> : null}
              </button>
              <button
                type="button"
                className="class-board-tab-item__default"
                aria-label={item.isDefault ? `${item.title} 기본 스크린 해제 불가` : `${item.title}을 기본 스크린으로 지정`}
                aria-pressed={Boolean(item.isDefault)}
                title={isDraft ? '새 탭이 저장되면 지정할 수 있습니다.' : item.isDefault ? '기본 스크린' : '기본 스크린으로 지정'}
                disabled={disabled || isDraft || Boolean(defaultingBoardId)}
                onClick={() => { if (!item.isDefault && !isDraft) onSetDefault(item); }}
              >{defaultingBoardId === item.id ? '…' : item.isDefault ? '★' : '☆'}</button>
            </div>
          );
        })}
      </div>
      <div className="class-board-tabs__actions" role="group" aria-label="탭 관리">
        <button type="button" className="is-create" disabled={disabled} onClick={onCreate}>＋ 새 탭</button>
        {/* 자동 저장(2026-09-29) — `저장` 단추 대신 방금 한 것을 하나씩 되돌린다. */}
        <button type="button" disabled={!currentBoard || !canUndo || disabled} title="방금 한 것을 하나씩 되돌립니다" onClick={onUndo}>↶ 되돌리기</button>
        <button
          type="button"
          className="is-delete"
          disabled={!savedBoardReady}
          title="삭제한 탭은 복구할 수 있습니다."
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

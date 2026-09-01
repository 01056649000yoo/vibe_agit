import React from 'react';
import { getClassBoardWidget } from '../widgets/registry';
import { WidgetSettingsHost } from '../host/WidgetHost';

export default function PresentationEditPanel({
  addableWidgets,
  selectedInstance,
  classId,
  boardId,
  dirty,
  saving,
  error,
  notice,
  onAdd,
  onConfigChange,
  onTogglePin,
  onRemove,
  onCloseSelection,
  onSave,
  onCancel,
}) {
  const selectedManifest = getClassBoardWidget(selectedInstance?.widgetId);
  return (
    <>
      <div className="class-board-presentation-editbar" role="toolbar" aria-label="스크린 바로 편집 도구">
        <div className="class-board-presentation-editbar__state">
          <strong><span aria-hidden="true">✏️</span> 화면 편집 중</strong>
          <small>{dirty ? '저장하지 않은 변경이 있어요' : '현재 화면이 저장되어 있어요'}</small>
        </div>
        <div className="class-board-presentation-editbar__add" aria-label="자료 추가">
          {addableWidgets.map((manifest) => (
            <button key={manifest.id} type="button" disabled={saving} onClick={() => onAdd(manifest.id)}>
              <span aria-hidden="true">{manifest.icon}</span> {manifest.name} 추가
            </button>
          ))}
        </div>
        <div className="class-board-presentation-editbar__actions">
          <button type="button" className="is-save" disabled={!dirty || saving} onClick={onSave}>
            {saving ? '저장 중…' : '저장'}
          </button>
          <button type="button" disabled={saving} onClick={onCancel}>
            {dirty ? '변경 취소' : '편집 끝내기'}
          </button>
        </div>
      </div>

      {error || notice ? (
        <div className={`class-board-presentation-edit-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
          {error || notice}
        </div>
      ) : null}

      {selectedInstance ? (
        <aside className="class-board-presentation-settings" aria-label="선택한 자료 설정">
          <header>
            <div>
              <span>선택한 자료</span>
              <h2>{selectedManifest?.icon} {selectedManifest?.name}</h2>
            </div>
            <button type="button" aria-label="자료 설정 닫기" onClick={onCloseSelection}>×</button>
          </header>
          <p className="class-board-presentation-settings__hint">
            이미지나 텍스트 자체를 마우스로 옮기고 테두리로 크기를 조절하세요.
          </p>
          <WidgetSettingsHost
            instance={selectedInstance}
            classId={classId}
            boardId={boardId}
            onChange={onConfigChange}
          />
          <div className="class-board-presentation-settings__actions">
            <button type="button" onClick={onTogglePin}>
              {selectedInstance.placement?.pinned ? '📌 핀 해제' : '📍 위치에 핀 꽂기'}
            </button>
            <button type="button" className="is-danger" onClick={onRemove}>자료 삭제</button>
          </div>
        </aside>
      ) : null}
    </>
  );
}

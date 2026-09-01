import React from 'react';
import ModalCloseButton from '../../../../components/common/ModalCloseButton';
import { getClassBoardWidget } from '../widgets/registry';
import { WidgetSettingsHost } from '../host/WidgetHost';

export default function PresentationEditPanel({
  addableWidgets,
  selectedInstance,
  classId,
  boardId,
  dirty,
  saving,
  pastingImage,
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
  const busy = saving || pastingImage;
  return (
    <>
      <div className="class-board-presentation-editbar" role="toolbar" aria-label="스크린 바로 편집 도구">
        <div className="class-board-presentation-editbar__state">
          <strong><span aria-hidden="true">✏️</span> 화면 편집 중</strong>
          <small>{pastingImage ? '붙여넣은 캡처를 준비하는 중…' : dirty ? '저장하지 않은 변경이 있어요' : '현재 화면이 저장되어 있어요'}</small>
        </div>
        <div className="class-board-presentation-editbar__add" aria-label="자료 추가">
          {addableWidgets.map((manifest) => (
            <button key={manifest.id} type="button" disabled={busy} onClick={() => onAdd(manifest.id)}>
              <span aria-hidden="true">{manifest.icon}</span> {manifest.name} 추가
            </button>
          ))}
        </div>
        <div className="class-board-presentation-editbar__actions">
          <button type="button" className="is-save" disabled={!dirty || busy} onClick={onSave}>
            {saving ? '저장 중…' : '저장'}
          </button>
          <button type="button" disabled={busy} onClick={onCancel}>
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
            <ModalCloseButton size="sm" label="자료 설정 닫기" onClick={onCloseSelection} />
          </header>
          <p className="class-board-presentation-settings__hint">
            캡처 이미지는 Ctrl+V로 붙여넣으면 원본 비율에 맞춰 들어갑니다. 선택한 자료는 Esc로 뺄 수 있고, 이미지나 텍스트는 마우스로 옮길 수 있습니다.
          </p>
          <WidgetSettingsHost
            instance={selectedInstance}
            classId={classId}
            boardId={boardId}
            onChange={onConfigChange}
          />
          <div className="class-board-presentation-settings__actions">
            <button type="button" disabled={busy} onClick={onTogglePin}>
              {selectedInstance.placement?.pinned ? '📌 핀 해제' : '📍 위치에 핀 꽂기'}
            </button>
            <button type="button" className="is-danger" disabled={busy} onClick={onRemove}>자료 삭제</button>
          </div>
        </aside>
      ) : null}
    </>
  );
}

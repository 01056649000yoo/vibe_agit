import React from 'react';
import ModalCloseButton from '../../../../components/common/ModalCloseButton';
import { getClassBoardWidget } from '../widgets/registry';
import { WidgetSettingsHost } from '../host/WidgetHost';
import WidgetLayerControls from '../host/WidgetLayerControls';
import { CLASS_BOARD_SAVE_STATUS_TEXT } from '../host/useClassBoardAutosave';

export default function PresentationEditPanel({
  addableWidgets,
  board,
  selectedInstance,
  settingsAnchorStyle,
  classId,
  boardId,
  saveStatus = 'idle',
  saving,
  canUndo = false,
  pastingImage,
  error,
  notice,
  onAdd,
  onConfigChange,
  onMoveLayer,
  onTogglePin,
  onRemove,
  onCloseSelection,
  onUndo,
  onRetrySave,
  onFinish,
}) {
  const selectedManifest = getClassBoardWidget(selectedInstance?.widgetId);
  const busy = saving || pastingImage;
  return (
    <>
      <div className="class-board-presentation-editbar" role="toolbar" aria-label="스크린 바로 편집 도구">
        <div className="class-board-presentation-editbar__state">
          <strong><span aria-hidden="true">✏️</span> 화면 편집 중</strong>
          {/* 자동 저장(2026-09-29) — `저장` 단추 대신 지금 상태를 보여 준다. */}
          <small className={`is-${saveStatus}`} role="status" aria-live="polite">
            {pastingImage ? '붙여넣은 캡처를 준비하는 중…' : Reflect.get(CLASS_BOARD_SAVE_STATUS_TEXT, saveStatus) || ''}
          </small>
        </div>
        <div className="class-board-presentation-editbar__add" aria-label="자료 추가">
          {addableWidgets.map((manifest) => (
            <button key={manifest.id} type="button" disabled={busy} onClick={() => onAdd(manifest.id)}>
              <span aria-hidden="true">{manifest.icon}</span> {manifest.name} 추가
            </button>
          ))}
        </div>
        <div className="class-board-presentation-editbar__actions">
          {saveStatus === 'error' ? (
            <button type="button" className="is-save" disabled={busy} onClick={onRetrySave}>다시 저장</button>
          ) : null}
          <button type="button" disabled={!canUndo || busy} title="방금 한 것을 하나씩 되돌립니다" onClick={onUndo}>↶ 되돌리기</button>
          <button type="button" className="is-save" disabled={busy} onClick={onFinish}>편집 끝내기</button>
        </div>
      </div>

      {error || notice ? (
        <div className={`class-board-presentation-edit-message${error ? ' is-error' : ''}`} role={error ? 'alert' : 'status'}>
          {error || notice}
        </div>
      ) : null}

      {selectedInstance ? (
        <aside
          className={`class-board-presentation-settings${settingsAnchorStyle ? ' is-anchored' : ' is-positioning'}`}
          style={settingsAnchorStyle || undefined}
          aria-label="선택한 자료 설정"
        >
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
          <WidgetLayerControls
            board={board}
            instanceId={selectedInstance.instanceId}
            disabled={busy}
            onMove={onMoveLayer}
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

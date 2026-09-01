import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import { classBoardApi } from './classBoardApi';
import {
  applyPastedClassBoardImage,
  CLASS_BOARD_IMAGE_PASTE_FAILED_MESSAGE,
  createDefaultClassBoard,
  createWidgetInstance,
  getAddableWidgets,
  getClassBoardImagePasteError,
  getClassBoardImagePasteNotice,
  normalizeClassBoard,
  updateClassBoardWidgetConfig,
} from './classBoardModel';
import BoardCanvas from './host/BoardCanvas';
import useClassBoardEscapeRemove from './host/useClassBoardEscapeRemove';
import { WidgetSettingsHost } from './host/WidgetHost';
import WidgetLayerControls from './host/WidgetLayerControls';
import { moveClassBoardWidgetLayer } from './host/widgetLayers';
import ClassBoardTabs from './navigation/ClassBoardTabs';
import HiddenClassBoardPanel from './navigation/HiddenClassBoardPanel';
import useClassBoardImagePaste from './widgets/image/useClassBoardImagePaste';
import { getClassBoardWidget } from './widgets/registry';
import './classBoard.css';

const snapshot = (board) => JSON.stringify(board);
const workspaceRevision = (items = []) => items
  .map((item) => `${item.id}:${item.revision}:${item.isActive ? 1 : 0}`)
  .join('|');

export default function ClassBoardTeacherEntry({ activeClass, module }) {
  const [boards, setBoards] = useState([]);
  const [board, setBoard] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hiddenPanelOpen, setHiddenPanelOpen] = useState(false);
  const [hiddenBoards, setHiddenBoards] = useState([]);
  const [hiddenLoading, setHiddenLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestRef = useRef(0);
  const hiddenRequestRef = useRef(0);
  const lastReturnRefreshRef = useRef(0);
  const canvasContentRef = useRef(null);

  const dirty = Boolean(board) && snapshot(board) !== savedSnapshot;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const boardsRef = useRef(boards);
  boardsRef.current = boards;
  const selectedInstance = board?.widgets.find((widget) => widget.instanceId === selectedInstanceId) || null;
  const addableWidgets = useMemo(() => getAddableWidgets(board?.widgets || []), [board?.widgets]);
  const receivePastedImage = (image, pasteContext = {}) => {
    try {
      const result = applyPastedClassBoardImage(
        board,
        pasteContext.selectedInstanceId,
        image,
        canvasContentRef.current?.getBoundingClientRect()
      );
      setBoard(result.board);
      setSelectedInstanceId(result.instanceId);
      setError('');
      setNotice(getClassBoardImagePasteNotice(result.replaced));
    } catch (pasteError) {
      setError(pasteError.message || CLASS_BOARD_IMAGE_PASTE_FAILED_MESSAGE);
    }
  };
  const pastingImage = useClassBoardImagePaste({
    enabled: Boolean(board),
    classId: activeClass?.id,
    boardId: board?.id,
    validate: () => getClassBoardImagePasteError(board, selectedInstanceId),
    getPasteContext: () => ({ selectedInstanceId }),
    onImage: receivePastedImage,
    onError: (message) => {
      setError(message);
      setNotice('');
    },
  });
  const busyRef = useRef(false);
  busyRef.current = saving || pastingImage;

  const selectBoard = useCallback((nextBoard, { force = false } = {}) => {
    if (!nextBoard) return;
    if (!force && dirtyRef.current && !window.confirm('저장하지 않은 변경을 버리고 다른 스크린으로 이동할까요?')) return;
    const normalized = normalizeClassBoard(nextBoard);
    setBoard(normalized);
    setSavedSnapshot(snapshot(normalized));
    setSelectedInstanceId(normalized.widgets[0]?.instanceId || null);
    setError('');
    setNotice('');
  }, []);

  const loadWorkspace = useCallback(async ({ background = false } = {}) => {
    if (!activeClass?.id) {
      setLoading(false);
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (!background) setLoading(true);
    setError('');
    try {
      const result = await classBoardApi.getWorkspace(activeClass.id);
      if (requestId !== requestRef.current) return;
      const nextBoards = Array.isArray(result?.boards) ? result.boards.map(normalizeClassBoard) : [];
      if (background && workspaceRevision(nextBoards) === workspaceRevision(boardsRef.current)) return;
      setBoards(nextBoards);
      setHiddenPanelOpen(false);
      setHiddenBoards([]);
      if (nextBoards.length > 0) selectBoard(nextBoards.find((item) => item.isActive) || nextBoards[0], { force: true });
      else {
        setBoard(null);
        setSavedSnapshot('');
      }
    } catch (loadError) {
      if (requestId === requestRef.current) setError(loadError.message || '스크린을 불러오지 못했습니다.');
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [activeClass?.id, selectBoard]);

  useEffect(() => {
    void loadWorkspace();
    return () => {
      requestRef.current += 1;
      hiddenRequestRef.current += 1;
    };
  }, [loadWorkspace]);

  useEffect(() => {
    const refreshWhenReturning = (event) => {
      if (event?.type === 'pageshow' && !event.persisted) return;
      if (document.visibilityState === 'hidden' || dirtyRef.current || busyRef.current) return;
      const now = Date.now();
      if (now - lastReturnRefreshRef.current < 750) return;
      lastReturnRefreshRef.current = now;
      void loadWorkspace({ background: true });
    };
    window.addEventListener('focus', refreshWhenReturning);
    window.addEventListener('pageshow', refreshWhenReturning);
    document.addEventListener('visibilitychange', refreshWhenReturning);
    return () => {
      window.removeEventListener('focus', refreshWhenReturning);
      window.removeEventListener('pageshow', refreshWhenReturning);
      document.removeEventListener('visibilitychange', refreshWhenReturning);
    };
  }, [loadWorkspace]);

  useEffect(() => {
    const warn = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const updateBoard = (updater) => {
    setBoard((current) => typeof updater === 'function' ? updater(current) : updater);
    setNotice('');
  };

  const save = async () => {
    if (!board || !activeClass?.id) return null;
    setSaving(true);
    setError('');
    try {
      const saved = normalizeClassBoard(await classBoardApi.save({ classId: activeClass.id, board }));
      setBoard(saved);
      setSavedSnapshot(snapshot(saved));
      setBoards((current) => [saved, ...current.filter((item) => item.id !== saved.id)].map((item) => ({
        ...item,
        isActive: item.id === saved.id,
      })));
      setNotice(`‘${saved.title}’ 탭을 저장했습니다. 상단 탭과 열린 스크린에 최신 내용이 보입니다.`);
      return saved;
    } catch (saveError) {
      setError(saveError.message || '스크린을 저장하지 못했습니다.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const createBoard = () => {
    if (dirty && !window.confirm('저장하지 않은 변경을 버리고 새 탭을 만들까요?')) return;
    const next = createDefaultClassBoard(activeClass?.name);
    setBoard(next);
    setSavedSnapshot('');
    setSelectedInstanceId(next.widgets[0].instanceId);
    setNotice('탭 이름과 내용을 다듬은 뒤 상단 작업바의 `저장`을 눌러 주세요. 이미지는 첫 저장 후 올릴 수 있습니다.');
  };

  const openHiddenBoards = async () => {
    if (hiddenPanelOpen) {
      hiddenRequestRef.current += 1;
      setHiddenPanelOpen(false);
      setHiddenLoading(false);
      return;
    }
    const requestId = hiddenRequestRef.current + 1;
    hiddenRequestRef.current = requestId;
    setHiddenPanelOpen(true);
    setHiddenLoading(true);
    setError('');
    try {
      const result = await classBoardApi.getHidden(activeClass.id);
      if (requestId === hiddenRequestRef.current) {
        setHiddenBoards(Array.isArray(result?.boards) ? result.boards : []);
      }
    } catch (loadError) {
      if (requestId === hiddenRequestRef.current) {
        setError(loadError.message || '삭제한 탭을 불러오지 못했습니다.');
      }
    } finally {
      if (requestId === hiddenRequestRef.current) setHiddenLoading(false);
    }
  };

  const restoreHiddenBoard = async (boardId) => {
    if (dirty && !window.confirm('저장하지 않은 변경을 버리고 삭제한 탭을 복구할까요?')) return;
    setSaving(true);
    setError('');
    try {
      const restored = normalizeClassBoard(await classBoardApi.restore(boardId));
      setBoards((current) => [restored, ...current.filter((item) => item.id !== restored.id)].map((item) => ({
        ...item,
        isActive: item.id === restored.id,
      })));
      setHiddenBoards((current) => current.filter((item) => item.id !== restored.id));
      selectBoard(restored, { force: true });
      setNotice(`‘${restored.title}’ 스크린을 상단 탭으로 복구했습니다.`);
    } catch (restoreError) {
      setError(restoreError.message || '삭제한 탭을 복구하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const duplicate = async () => {
    if (!board?.id || dirty) return;
    setSaving(true);
    setError('');
    try {
      const copy = normalizeClassBoard(await classBoardApi.duplicate(board.id));
      setBoards((current) => [copy, ...current.map((item) => ({ ...item, isActive: false }))]);
      selectBoard(copy, { force: true });
      setNotice('복사본을 새 탭으로 만들었습니다. 원본과 별도로 수정할 수 있습니다.');
    } catch (copyError) {
      setError(copyError.message || '스크린을 복제하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const hideBoard = async () => {
    if (!board?.id || dirty || !window.confirm(`‘${board.title}’ 탭을 삭제할까요?\n삭제한 탭 복구에서 다시 되돌릴 수 있습니다.`)) return;
    setSaving(true);
    setError('');
    try {
      await classBoardApi.archive(board.id);
      await loadWorkspace();
      setNotice('스크린을 상단 탭에서 삭제했습니다. 이미지 파일은 복구와 복사본을 위해 그대로 보존됩니다.');
    } catch (archiveError) {
      setError(archiveError.message || '스크린을 삭제하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const addWidget = (widgetId) => {
    const zone = getClassBoardWidget(widgetId)?.defaultPlacement.zone;
    const zoneWidgets = (board?.widgets || []).filter((item) => item.zone === zone);
    const order = Math.max(0, ...zoneWidgets.map((item) => item.order)) + 10;
    const instance = createWidgetInstance(widgetId, order, zone === 'content' ? zoneWidgets.length : 0);
    updateBoard((current) => ({ ...current, widgets: [...current.widgets, instance] }));
    setSelectedInstanceId(instance.instanceId);
  };

  const updateSelected = (patch) => updateBoard((current) => ({
    ...current,
    widgets: current.widgets.map((widget) => widget.instanceId === selectedInstanceId ? { ...widget, ...patch } : widget),
  }));

  const updateSelectedConfig = (config, options) => updateBoard((current) => (
    updateClassBoardWidgetConfig(
      current,
      selectedInstanceId,
      config,
      options,
      canvasContentRef.current?.getBoundingClientRect()
    )
  ));

  const updatePlacement = (instanceId, placement) => updateBoard((current) => ({
    ...current,
    widgets: current.widgets.map((widget) => (
      widget.instanceId === instanceId ? { ...widget, placement } : widget
    )),
  }));

  const moveSelected = (direction) => updateBoard((current) => (
    moveClassBoardWidgetLayer(current, selectedInstanceId, direction)
  ));

  const removeSelected = () => {
    if (!selectedInstance || !window.confirm(`${getClassBoardWidget(selectedInstance.widgetId)?.name || '위젯'}을 화면에서 뺄까요?`)) return;
    updateBoard((current) => ({ ...current, widgets: current.widgets.filter((widget) => widget.instanceId !== selectedInstanceId) }));
    setSelectedInstanceId(null);
  };

  useClassBoardEscapeRemove({
    enabled: Boolean(selectedInstance) && !saving && !pastingImage,
    onRemove: removeSelected,
  });

  if (!activeClass?.id) return <div className="class-board-empty">먼저 사용할 학급을 선택해 주세요.</div>;
  if (loading) return <div className="class-board-empty">우리 반 스크린을 불러오는 중…</div>;

  return (
    <section className="class-board-editor">
      <header className="class-board-editor__header">
        <div>
          <span>학급운영도구 · {activeClass.name}</span>
          <h2>🖥️ 우리 반 스크린 {module?.tool?.beta && <span className="class-board-beta-badge">Beta</span>}</h2>
          <p>안내 자료와 끄적끄적 아지트 글쓰기 현황을 한 화면에 배치합니다.</p>
        </div>
        <div className="class-board-editor__header-actions">
          <TeacherGuideButton tabId="class-board" variant="help" />
          <button
            type="button"
            className="class-board-present"
            disabled={!board?.id || dirty || saving || pastingImage}
            title={dirty ? '먼저 변경 내용을 저장해 주세요.' : ''}
            onClick={() => window.open(`/class-board/${board.id}`, '_blank', 'noopener')}
          >스크린 열기 ↗</button>
        </div>
      </header>

      {error ? <div className="class-board-alert is-error">{error}<button type="button" onClick={() => setError('')}>닫기</button></div> : null}
      {notice ? <div className="class-board-alert is-notice">{notice}<button type="button" onClick={() => setNotice('')}>닫기</button></div> : null}

      <ClassBoardTabs
        boards={boards}
        currentBoard={board}
        dirty={dirty}
        disabled={saving || pastingImage}
        saving={saving}
        deletedPanelOpen={hiddenPanelOpen}
        onSelect={selectBoard}
        onCreate={createBoard}
        onSave={() => void save()}
        onDelete={() => void hideBoard()}
        onDuplicate={() => void duplicate()}
        onOpenDeleted={() => void openHiddenBoards()}
      />

      <div className="class-board-toolbar">
        <label className="class-board-title-field">
          <span>탭 이름</span>
          <input maxLength={80} disabled={!board || pastingImage} value={board?.title || ''} onChange={(event) => updateBoard((current) => ({ ...current, title: event.target.value }))} />
        </label>
      </div>

      {hiddenPanelOpen ? (
        <HiddenClassBoardPanel
          boards={hiddenBoards}
          loading={hiddenLoading}
          disabled={saving || pastingImage}
          onRestore={(boardId) => void restoreHiddenBoard(boardId)}
          onClose={() => {
            hiddenRequestRef.current += 1;
            setHiddenPanelOpen(false);
            setHiddenLoading(false);
          }}
        />
      ) : null}

      {!board ? (
        <div className="class-board-empty class-board-empty--create">
          <span>🧩</span><h3>첫 우리 반 스크린을 만들어 보세요</h3>
          <p>텍스트·이미지·글쓰기 현황 위젯이 담긴 기본 화면을 첫 탭으로 만듭니다.</p>
          <button type="button" className="class-board-primary" onClick={createBoard}>첫 탭 만들기</button>
        </div>
      ) : (
        <div className="class-board-editor__workspace">
          <div className="class-board-preview-panel">
            <div className="class-board-panel-heading">
              <strong>화면 미리보기</strong>
              <span>오늘 현황을 접어도 자료의 위치와 크기는 그대로 유지됩니다</span>
            </div>
            <p className="class-board-canvas-help" aria-live="polite">
              {pastingImage
                ? '붙여넣은 캡처를 화면용 이미지로 준비하는 중…'
                : '캡처 이미지는 Ctrl+V로 붙여넣으면 원본 비율에 맞춰 추가됩니다. 위젯을 선택한 뒤 Esc를 누르면 화면에서 뺄 수 있습니다. 이미지나 텍스트 자체를 드래그해 옮기고 테두리로 크기를 조절하세요.'}
            </p>
            <BoardCanvas
              board={board}
              classId={activeClass.id}
              contentRef={canvasContentRef}
              selectedInstanceId={selectedInstanceId}
              onSelect={setSelectedInstanceId}
              onPlacementChange={updatePlacement}
            />
          </div>

          <aside className="class-board-settings-panel">
            <div className="class-board-panel-heading"><strong>위젯 설정</strong><span>{dirty ? '저장하지 않은 변경 있음' : '저장됨'}</span></div>
            <div className="class-board-add-widget">
              <span>위젯 추가</span>
              <div>{addableWidgets.map((manifest) => (
                <button key={manifest.id} type="button" disabled={pastingImage} onClick={() => addWidget(manifest.id)}>{manifest.icon} {manifest.name}</button>
              ))}</div>
            </div>
            {selectedInstance ? (
              <div className="class-board-selected-settings">
                <h3>{getClassBoardWidget(selectedInstance.widgetId)?.icon} {getClassBoardWidget(selectedInstance.widgetId)?.name}</h3>
                <WidgetSettingsHost
                  instance={selectedInstance}
                  classId={activeClass.id}
                  boardId={board.id}
                  onChange={updateSelectedConfig}
                />
                <WidgetLayerControls
                  board={board}
                  instanceId={selectedInstanceId}
                  disabled={pastingImage}
                  onMove={moveSelected}
                />
                <div className="class-board-instance-controls">
                  <button
                    type="button"
                    disabled={selectedInstance.zone !== 'content' || pastingImage}
                    onClick={() => updateSelected({
                      placement: { ...selectedInstance.placement, pinned: !selectedInstance.placement?.pinned },
                    })}
                  >{selectedInstance.placement?.pinned ? '핀 해제' : '핀 꽂기'}</button>
                  <button type="button" className="is-danger" disabled={pastingImage} onClick={removeSelected}>빼기</button>
                </div>
              </div>
            ) : <p className="class-board-note">미리보기에서 위젯을 눌러 내용을 수정하세요.</p>}
          </aside>
        </div>
      )}
    </section>
  );
}

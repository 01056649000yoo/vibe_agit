import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import { classBoardApi } from './classBoardApi';
import {
  applyPastedClassBoardImage,
  CLASS_BOARD_IMAGE_PASTE_FAILED_MESSAGE,
  createWidgetInstance,
  getAddableWidgets,
  getClassBoardImagePasteError,
  getClassBoardImagePasteNotice,
  normalizeClassBoard,
  updateClassBoardWidgetConfig,
} from './classBoardModel';
import BoardCanvas from './host/BoardCanvas';
import useClassBoardEscapeRemove from './host/useClassBoardEscapeRemove';
import PresentationEditPanel from './presentation/PresentationEditPanel';
import useClassBoardSettingsAnchor from './presentation/useClassBoardSettingsAnchor';
import useClassBoardImagePaste from './widgets/image/useClassBoardImagePaste';
import { getClassBoardWidget } from './widgets/registry';
import './classBoard.css';

const snapshot = (board) => JSON.stringify(board);

export default function ClassBoardPresentationPage({ boardId }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [draftBoard, setDraftBoard] = useState(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [notice, setNotice] = useState('');
  const canvasContentRef = useRef(null);

  const editing = Boolean(draftBoard);
  const visibleBoard = draftBoard || data?.board;
  const dirty = Boolean(draftBoard && data?.board) && snapshot(draftBoard) !== snapshot(data.board);
  const selectedInstance = draftBoard?.widgets.find((widget) => widget.instanceId === selectedInstanceId) || null;
  const clearSelection = useCallback(() => setSelectedInstanceId(null), []);
  const settingsAnchorStyle = useClassBoardSettingsAnchor({
    contentRef: canvasContentRef,
    enabled: editing && Boolean(selectedInstance),
    selectedInstanceId,
  });
  const addableWidgets = useMemo(() => getAddableWidgets(draftBoard?.widgets || [])
    .filter((manifest) => manifest.defaultPlacement.zone === 'content'), [draftBoard?.widgets]);
  const receivePastedImage = (image, pasteContext = {}) => {
    try {
      const result = applyPastedClassBoardImage(
        draftBoard,
        pasteContext.selectedInstanceId,
        image,
        canvasContentRef.current?.getBoundingClientRect()
      );
      setDraftBoard(result.board);
      setSelectedInstanceId(result.instanceId);
      setEditError('');
      setNotice(getClassBoardImagePasteNotice(result.replaced));
    } catch (pasteError) {
      setEditError(pasteError.message || CLASS_BOARD_IMAGE_PASTE_FAILED_MESSAGE);
    }
  };
  const pastingImage = useClassBoardImagePaste({
    enabled: editing,
    classId: data?.class?.id,
    boardId: draftBoard?.id,
    validate: () => getClassBoardImagePasteError(draftBoard, selectedInstanceId),
    getPasteContext: () => ({ selectedInstanceId }),
    onImage: receivePastedImage,
    onError: (message) => {
      setEditError(message);
      setNotice('');
    },
  });

  useEffect(() => {
    let active = true;
    void classBoardApi.getPresentation(boardId)
      .then((result) => {
        if (!active) return;
        setData({ ...result, board: normalizeClassBoard(result.board) });
        document.title = `${result.board?.title || '우리 반 스크린'} | 끄적끄적 아지트`;
      })
      .catch((loadError) => { if (active) setError(loadError.message || '스크린을 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [boardId]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    const warn = (event) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const toggleFullscreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  };

  const closeScreen = async () => {
    if (document.fullscreenElement) await document.exitFullscreen();
    window.close();
    window.setTimeout(() => {
      if (!window.closed) window.location.assign('/?tool=class-board');
    }, 100);
  };

  const beginEditing = () => {
    setDraftBoard(normalizeClassBoard(data.board));
    setSelectedInstanceId(null);
    setEditError('');
    setNotice('왼쪽 자료를 누르거나 새 텍스트·이미지를 추가해 보세요.');
  };

  const cancelEditing = () => {
    if (dirty && !window.confirm('저장하지 않은 변경을 모두 취소하고 편집을 끝낼까요?')) return;
    setDraftBoard(null);
    setSelectedInstanceId(null);
    setEditError('');
    setNotice('');
  };

  const addWidget = (widgetId) => {
    const manifest = getClassBoardWidget(widgetId);
    if (!manifest || manifest.defaultPlacement.zone !== 'content' || !draftBoard) return;
    const contentWidgets = draftBoard.widgets.filter((widget) => widget.zone === 'content');
    const order = Math.max(0, ...contentWidgets.map((widget) => widget.order)) + 10;
    const instance = createWidgetInstance(widgetId, order, contentWidgets.length);
    setDraftBoard((current) => current ? { ...current, widgets: [...current.widgets, instance] } : current);
    setSelectedInstanceId(instance.instanceId);
    setEditError('');
    setNotice(`${manifest.name} 자료를 추가했습니다. 내용을 정한 뒤 저장해 주세요.`);
  };

  const updatePlacement = (instanceId, placement) => {
    setDraftBoard((current) => current ? ({
      ...current,
      widgets: current.widgets.map((widget) => (
        widget.instanceId === instanceId ? { ...widget, placement } : widget
      )),
    }) : current);
    setNotice('');
  };

  const updateSelectedConfig = (config, options) => {
    setDraftBoard((current) => updateClassBoardWidgetConfig(
      current,
      selectedInstanceId,
      config,
      options,
      canvasContentRef.current?.getBoundingClientRect()
    ));
    setNotice('');
  };

  const toggleSelectedPin = () => {
    setDraftBoard((current) => current ? ({
      ...current,
      widgets: current.widgets.map((widget) => widget.instanceId === selectedInstanceId ? {
        ...widget,
        placement: { ...widget.placement, pinned: !widget.placement?.pinned },
      } : widget),
    }) : current);
    setNotice('');
  };

  const removeSelected = () => {
    if (!selectedInstance || !window.confirm(`${getClassBoardWidget(selectedInstance.widgetId)?.name || '자료'}를 화면에서 삭제할까요?`)) return;
    setDraftBoard((current) => current ? ({
      ...current,
      widgets: current.widgets.filter((widget) => widget.instanceId !== selectedInstanceId),
    }) : current);
    setSelectedInstanceId(null);
    setNotice('자료를 화면에서 뺐습니다. 저장하면 확정됩니다.');
  };

  useClassBoardEscapeRemove({
    enabled: editing && Boolean(selectedInstance) && !saving && !pastingImage,
    onRemove: removeSelected,
  });

  const save = async () => {
    if (!draftBoard || !data?.class?.id || !dirty || pastingImage) return;
    setSaving(true);
    setEditError('');
    try {
      const saved = normalizeClassBoard(await classBoardApi.save({
        classId: data.class.id,
        board: draftBoard,
      }));
      setData((current) => ({ ...current, board: saved }));
      setDraftBoard(saved);
      setNotice('스크린을 저장했습니다. 지금 화면과 다음에 여는 화면에 그대로 적용됩니다.');
    } catch (saveError) {
      setEditError(saveError.message || '스크린을 저장하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const refresh = () => {
    if (dirty && !window.confirm('저장하지 않은 변경을 버리고 화면을 새로고침할까요?')) return;
    window.location.reload();
  };

  if (loading) return <div className="class-board-presentation-state">우리 반 스크린을 준비하는 중…</div>;
  if (error || !data?.board) {
    return (
      <div className="class-board-presentation-state is-error">
        <span>🔒</span><h1>스크린을 열 수 없습니다.</h1>
        <p>{error || '스크린 정보를 찾지 못했습니다.'}</p>
        <a href="/?tool=class-board">우리 반 스크린으로 돌아가기</a>
      </div>
    );
  }

  return (
    <main className={`class-board-presentation-page${editing ? ' is-editing' : ''}`}>
      <header className="class-board-presentation-header">
        <h1 className="class-board-presentation-class-name">{data.class?.name || '우리 반'}</h1>
        <div>
          <time>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</time>
          {!editing ? <button type="button" className="class-board-presentation-edit-button" onClick={beginEditing}>✏️ 화면 편집</button> : null}
          <button type="button" className="class-board-presentation-refresh-button" disabled={pastingImage} onClick={refresh}>새로고침</button>
          <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? '전체화면 나가기' : '전체화면'}</button>
          <ModalCloseButton label="우리 반 스크린 닫기" onClick={() => void closeScreen()} />
        </div>
      </header>
      {editing ? (
        <PresentationEditPanel
          addableWidgets={addableWidgets}
          selectedInstance={selectedInstance}
          settingsAnchorStyle={settingsAnchorStyle}
          classId={data.class?.id}
          boardId={draftBoard.id}
          dirty={dirty}
          saving={saving}
          pastingImage={pastingImage}
          error={editError}
          notice={notice}
          onAdd={addWidget}
          onConfigChange={updateSelectedConfig}
          onTogglePin={toggleSelectedPin}
          onRemove={removeSelected}
          onCloseSelection={clearSelection}
          onSave={() => void save()}
          onCancel={cancelEditing}
        />
      ) : null}
      <div className="class-board-presentation-stage">
        <BoardCanvas
          board={visibleBoard}
          classId={data.class?.id}
          presentation
          editable={editing}
          contentRef={canvasContentRef}
          selectedInstanceId={selectedInstanceId}
          onSelect={setSelectedInstanceId}
          onClearSelection={clearSelection}
          onPlacementChange={updatePlacement}
        />
      </div>
    </main>
  );
}

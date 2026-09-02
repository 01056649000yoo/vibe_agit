import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  updateClassBoardWidgetPlacement,
} from './classBoardModel';
import BoardCanvas from './host/BoardCanvas';
import useClassBoardEscapeRemove from './host/useClassBoardEscapeRemove';
import { moveClassBoardWidgetLayer } from './host/widgetLayers';
import PresentationEditPanel from './presentation/PresentationEditPanel';
import useClassBoardSettingsAnchor from './presentation/useClassBoardSettingsAnchor';
import useClassBoardImagePaste from './widgets/image/useClassBoardImagePaste';
import { getClassBoardWidget } from './widgets/registry';
import './classBoard.css';

const snapshot = (board) => JSON.stringify(board);

// 알림장은 화면 편집을 켜지 않고도 바로 쓸 수 있어야 해서 발표 화면이 직접 연다.
// 아이들이 보는 화면이므로 알림장 위젯을 실제로 올린 스크린에서만 버튼을 내보인다.
const NoticeComposer = lazy(() => import('./widgets/notice-board/NoticeComposer'));

export default function ClassBoardPresentationPage({ boardId }) {
  const autoFullscreen = new URLSearchParams(window.location.search).get('fullscreen') === '1';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [fullscreenPrompt, setFullscreenPrompt] = useState(false);
  const [draftBoard, setDraftBoard] = useState(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const canvasContentRef = useRef(null);

  const editing = Boolean(draftBoard);
  const visibleBoard = draftBoard || data?.board;
  const hasNoticeWidget = Boolean(data?.board?.widgets?.some((widget) => widget.widgetId === 'notice-board'));
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
    if (!autoFullscreen || !data?.board || document.fullscreenElement) return undefined;
    if (typeof document.documentElement.requestFullscreen !== 'function') {
      setFullscreenPrompt(true);
      return undefined;
    }
    let active = true;
    void document.documentElement.requestFullscreen()
      .then(() => { if (active) setFullscreenPrompt(false); })
      .catch(() => { if (active) setFullscreenPrompt(true); });
    return () => { active = false; };
  }, [autoFullscreen, data?.board]);

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
    else {
      if (typeof document.documentElement.requestFullscreen !== 'function') return;
      await document.documentElement.requestFullscreen();
      setFullscreenPrompt(false);
    }
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

  const updatePlacement = (instanceId, placement, metadata) => {
    setDraftBoard((current) => updateClassBoardWidgetPlacement(
      current,
      instanceId,
      placement,
      metadata
    ));
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

  const moveSelectedLayer = (direction) => {
    setDraftBoard((current) => moveClassBoardWidgetLayer(current, selectedInstanceId, direction));
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
    <main className={`class-board-presentation-page${editing ? ' is-editing' : ''}${fullscreen ? ' is-fullscreen' : ''}`}>
      <header className="class-board-presentation-header">
        <h1 className="class-board-presentation-class-name">{data.class?.name || '우리 반'}</h1>
        <div>
          <time>{new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}</time>
          {!editing && hasNoticeWidget ? (
            <button
              type="button"
              className="class-board-presentation-notice-button"
              aria-expanded={noticeOpen}
              onClick={() => setNoticeOpen((open) => !open)}
            >📒 {noticeOpen ? '알림장 닫기' : '알림장 쓰기'}</button>
          ) : null}
          {!editing ? <button type="button" className="class-board-presentation-edit-button" onClick={beginEditing}>✏️ 화면 편집</button> : null}
          <button type="button" className="class-board-presentation-refresh-button" disabled={pastingImage} onClick={refresh}>새로고침</button>
          <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? '전체화면 나가기' : '전체화면'}</button>
          <ModalCloseButton label="우리 반 스크린 닫기" onClick={() => void closeScreen()} />
        </div>
      </header>
      {!editing && noticeOpen && hasNoticeWidget ? (
        <aside className="class-board-presentation-notice-panel" aria-label="오늘 알림장 쓰기">
          <div className="class-board-panel-heading">
            <strong>📒 알림장</strong>
            <button type="button" onClick={() => setNoticeOpen(false)}>닫기</button>
          </div>
          <Suspense fallback={<p className="class-board-note">알림장을 여는 중…</p>}>
            <NoticeComposer classId={data.class?.id} />
          </Suspense>
        </aside>
      ) : null}
      {editing ? (
        <PresentationEditPanel
          addableWidgets={addableWidgets}
          board={draftBoard}
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
          onMoveLayer={moveSelectedLayer}
          onTogglePin={toggleSelectedPin}
          onRemove={removeSelected}
          onCloseSelection={clearSelection}
          onSave={() => void save()}
          onCancel={cancelEditing}
        />
      ) : null}
      {fullscreenPrompt ? (
        <button
          type="button"
          className="class-board-presentation-fullscreen-prompt"
          onClick={() => void toggleFullscreen()}
        >화면을 한 번 눌러 전체화면 시작</button>
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

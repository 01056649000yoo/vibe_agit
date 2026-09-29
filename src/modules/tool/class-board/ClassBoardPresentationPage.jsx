import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ModalCloseButton from '../../../components/common/ModalCloseButton';
import useConfirmDialog from '../../../components/common/useConfirmDialog';
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
import { getClassBoardImageUrls } from './classBoardImageApi';
import { readRememberedClassBoardAssetPaths } from './host/classBoardAssetPolicy';
import BoardCanvas from './host/BoardCanvas';
import useClassBoardAutosave from './host/useClassBoardAutosave';
import useClassBoardEscapeRemove from './host/useClassBoardEscapeRemove';
import useClassBoardUndo from './host/useClassBoardUndo';
import { moveClassBoardWidgetLayer } from './host/widgetLayers';
import PresentationEditPanel from './presentation/PresentationEditPanel';
import useClassBoardSettingsAnchor from './presentation/useClassBoardSettingsAnchor';
import useClassBoardImagePaste from './widgets/image/useClassBoardImagePaste';
import { getClassBoardWidget } from './widgets/registry';
import './classBoard.css';

// 알림장은 화면 편집을 켜지 않고도 바로 쓸 수 있어야 해서 발표 화면이 직접 연다.
// 아이들이 보는 화면이므로 알림장 위젯을 실제로 올린 스크린에서만 버튼을 내보인다.
const NoticeComposer = lazy(() => import('./widgets/notice-board/NoticeComposer'));

export default function ClassBoardPresentationPage({ boardId }) {
  const autoFullscreen = new URLSearchParams(window.location.search).get('fullscreen') === '1';
  // 자동 전체화면은 창을 처음 열 때 **한 번만** 시도한다(2026-09-29 점검). 예전에는 스크린 내용이 바뀔 때마다
  // (자동 저장·탭 넘기기) 다시 시도해, 선생님이 Esc 로 나와도 도로 전체화면이 되거나 안내가 또 떴다.
  const autoFullscreenTriedRef = useRef(false);
  /*
   * 확인은 앱 안 창으로 묻는다. 브라우저 기본 창(window.confirm·prompt)은 크롬에서 **전체화면을 강제로 푼다**
   * (2026-09-29 크롬으로 확인). 교실 화면에서 자료 하나 지우다 전체화면이 풀리면 안 된다.
   */
  const { ask, confirmDialog } = useConfirmDialog();
  const [currentBoardId, setCurrentBoardId] = useState(boardId);
  const [classBoards, setClassBoards] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [fullscreen, setFullscreen] = useState(Boolean(document.fullscreenElement));
  const [fullscreenPrompt, setFullscreenPrompt] = useState(false);
  const [draftBoard, setDraftBoard] = useState(null);
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [editError, setEditError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const canvasContentRef = useRef(null);
  // 기억해 둔 사진 주소 받기(Promise). 화면을 그리는 중에 ref 를 읽지 않도록 상태로 둔다.
  const [assetSeed, setAssetSeed] = useState(null);

  useEffect(() => {
    setCurrentBoardId(boardId);
  }, [boardId]);

  const editing = Boolean(draftBoard);
  const visibleBoard = draftBoard || data?.board;
  const hasNoticeWidget = Boolean(data?.board?.widgets?.some((widget) => widget.widgetId === 'notice-board'));
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

  /*
   * 편집한 것은 자동으로 저장한다(2026-09-29). 저장이 끝나도 편집 중인 판을 서버 판으로 바꾸지 않고
   * 아이디·버전만 받는다 — 그 사이 고친 것이 사라지지 않게. 규칙은 host/useClassBoardAutosave.js.
   */
  const classId = data?.class?.id;
  const persistBoard = useCallback(async (boardToSave) => normalizeClassBoard(await classBoardApi.save({
    classId,
    board: boardToSave,
  })), [classId]);
  const autosave = useClassBoardAutosave({
    board: draftBoard,
    enabled: editing && Boolean(classId),
    paused: pastingImage,
    save: persistBoard,
    onSaved: (saved) => {
      setData((current) => (current ? { ...current, board: saved } : current));
      setDraftBoard((current) => (current ? { ...current, id: saved.id, revision: saved.revision } : current));
      setEditError('');
    },
    onError: (saveError) => setEditError(saveError.message || '스크린을 저장하지 못했습니다.'),
  });
  const saving = autosave.status === 'saving';
  const undo = useClassBoardUndo(draftBoard);

  /* 다른 곳으로 가기 전에 남은 변경을 먼저 저장한다. 저장하지 못하면 한 번 묻는다. */
  const settleEdits = useCallback(async (question) => {
    if (!autosave.hasUnsaved) return true;
    if (await autosave.flush()) return true;
    return ask({ title: '저장하지 못한 변경이 있습니다', body: question, confirmLabel: '그래도 계속', tone: 'danger' });
  }, [autosave, ask]);

  // 현재 스크린 데이터 로드
  useEffect(() => {
    let active = true;
    const boardId = currentBoardId;
    setLoading(true);
    setError('');
    // 이 스크린에 어떤 사진이 있었는지 기억해 두었으므로, 스크린 내용을 기다리지 않고
    // 사진 주소 받기를 나란히 시작한다. 사진이 그대로면 왕복 한 번을 통째로 아낀다.
    const remembered = readRememberedClassBoardAssetPaths(window.localStorage, boardId);
    setAssetSeed(remembered.length > 0
      ? getClassBoardImageUrls(remembered).catch(() => new Map())
      : null);
    void classBoardApi.getPresentation(boardId)
      .then((result) => {
        if (!active) return;
        setData({ ...result, board: normalizeClassBoard(result.board) });
        document.title = `${result.board?.title || '우리 반 스크린'} | 끄적끄적 아지트`;
      })
      .catch((loadError) => { if (active) setError(loadError.message || '스크린을 불러오지 못했습니다.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentBoardId]);

  // 학급 내 활성 스크린 목록 조회 (스위처용)
  useEffect(() => {
    if (!data?.class?.id) return;
    let active = true;
    void classBoardApi.getWorkspace(data.class.id)
      .then((result) => {
        if (!active) return;
        const list = Array.isArray(result?.boards) ? result.boards : [];
        setClassBoards(list);
      })
      .catch((workspaceError) => console.error('스크린 목록 조회 실패:', workspaceError));
    return () => { active = false; };
  }, [data?.class?.id]);

  // 브라우저 뒤로가기 / 앞으로가기 동기화
  useEffect(() => {
    const handlePopState = () => {
      const match = window.location.pathname.match(/^\/class-board\/([0-9a-f-]{36})$/i);
      if (match?.[1] && match[1] !== currentBoardId) {
        setDraftBoard(null);
        setSelectedInstanceId(null);
        setCurrentBoardId(match[1]);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [currentBoardId]);

  const switchToBoardId = useCallback(async (targetId) => {
    if (!targetId || targetId === currentBoardId || loading) return;
    if (!(await settleEdits('저장하지 못한 변경이 있습니다. 그래도 다른 스크린으로 이동할까요?'))) return;
    setDraftBoard(null);
    setSelectedInstanceId(null);
    setEditError('');
    setNotice('');
    setCurrentBoardId(targetId);

    const url = new URL(window.location.href);
    url.pathname = `/class-board/${targetId}`;
    window.history.pushState({ boardId: targetId }, '', url.toString());
  }, [currentBoardId, loading, settleEdits]);

  const currentIndex = useMemo(() => {
    return classBoards.findIndex((item) => item.id === currentBoardId);
  }, [classBoards, currentBoardId]);

  const hasMultipleBoards = classBoards.length > 1;

  const goToPrevBoard = useCallback(() => {
    if (!hasMultipleBoards || currentIndex < 0) return;
    const prevIndex = (currentIndex - 1 + classBoards.length) % classBoards.length;
    void switchToBoardId(classBoards.at(prevIndex).id);
  }, [hasMultipleBoards, currentIndex, classBoards, switchToBoardId]);

  const goToNextBoard = useCallback(() => {
    if (!hasMultipleBoards || currentIndex < 0) return;
    const nextIndex = (currentIndex + 1) % classBoards.length;
    void switchToBoardId(classBoards.at(nextIndex).id);
  }, [hasMultipleBoards, currentIndex, classBoards, switchToBoardId]);

  // 좌우 화살표 키로 스크린 전환
  useEffect(() => {
    if (!hasMultipleBoards) return undefined;

    const handleKeyDown = (event) => {
      if (editing || noticeOpen || fullscreenPrompt) return;
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToPrevBoard();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToNextBoard();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [hasMultipleBoards, editing, noticeOpen, fullscreenPrompt, goToPrevBoard, goToNextBoard]);

  useEffect(() => {
    const onChange = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!autoFullscreen || !data?.board || autoFullscreenTriedRef.current) return undefined;
    autoFullscreenTriedRef.current = true;
    // 주소의 표시도 지운다 — 탭을 넘길 때 주소가 이어져 다음 스크린에서 다시 시도하지 않게.
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('fullscreen');
      window.history.replaceState(window.history.state, '', url.toString());
    } catch {
      // 주소를 못 고쳐도 한 번만 시도하는 것은 위의 표시가 지킨다.
    }
    if (document.fullscreenElement) return undefined;
    if (typeof document.documentElement.requestFullscreen !== 'function') {
      setFullscreenPrompt(true);
      return undefined;
    }
    let active = true;
    void document.documentElement.requestFullscreen()
      .then(() => { if (active) setFullscreenPrompt(false); })
      .catch(() => { if (active) setFullscreenPrompt(true); });
    return () => { active = false; };
  }, [autoFullscreen, data?.board]); // data.board 가 바뀌어도 위의 표시 때문에 다시 시도하지 않는다.

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
    const draft = normalizeClassBoard(data.board);
    setDraftBoard(draft);
    autosave.baseline(draft);
    undo.reset(draft);
    setSelectedInstanceId(null);
    setEditError('');
    setNotice('자료를 누르거나 새 텍스트·이미지를 추가해 보세요. 고치는 것은 자동으로 저장됩니다.');
  };

  const finishEditing = async () => {
    if (!(await settleEdits('저장하지 못한 변경이 있습니다. 그래도 편집을 끝낼까요?'))) return;
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
    setNotice(`${manifest.name} 자료를 추가했습니다. 고치는 내용은 자동으로 저장됩니다.`);
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

  const removeSelected = async () => {
    if (!selectedInstance || !(await ask({
      title: `${getClassBoardWidget(selectedInstance.widgetId)?.name || '자료'}를 화면에서 삭제할까요?`,
      body: '잘못 뺐다면 `되돌리기`로 되살릴 수 있습니다.',
      confirmLabel: '삭제',
      tone: 'danger',
    }))) return;
    setDraftBoard((current) => current ? ({
      ...current,
      widgets: current.widgets.filter((widget) => widget.instanceId !== selectedInstanceId),
    }) : current);
    setSelectedInstanceId(null);
    setNotice('자료를 화면에서 뺐습니다. 잘못 뺐다면 `되돌리기`를 누르세요.');
  };

  const undoLast = () => {
    const target = undo.takeUndo();
    if (!target) return;
    setDraftBoard((current) => (current ? { ...current, ...target } : current));
    setSelectedInstanceId((id) => (target.widgets.some((widget) => widget.instanceId === id) ? id : null));
    setNotice('');
  };

  useClassBoardEscapeRemove({
    enabled: editing && Boolean(selectedInstance) && !saving && !pastingImage,
    onRemove: removeSelected,
  });

  const refresh = async () => {
    if (!(await settleEdits('저장하지 못한 변경이 있습니다. 그래도 화면을 새로고침할까요?'))) return;
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
        <div className="class-board-presentation-header__left">
          <h1 className="class-board-presentation-class-name">{data.class?.name || '우리 반'}</h1>
          {hasMultipleBoards ? (
            <div className="class-board-presentation-switcher" role="navigation" aria-label="스크린 전환">
              <button
                type="button"
                className="class-board-presentation-switcher__btn"
                onClick={goToPrevBoard}
                aria-label="이전 스크린 (왼쪽 방향키)"
                title="이전 스크린 (←)"
              >◀</button>
              <span className="class-board-presentation-switcher__title">
                {visibleBoard?.title || '스크린'}
                <span className="class-board-presentation-switcher__count">
                  {currentIndex >= 0 ? `${currentIndex + 1}/${classBoards.length}` : ''}
                </span>
              </span>
              <button
                type="button"
                className="class-board-presentation-switcher__btn"
                onClick={goToNextBoard}
                aria-label="다음 스크린 (오른쪽 방향키)"
                title="다음 스크린 (→)"
              >▶</button>
            </div>
          ) : visibleBoard?.title ? (
            <span className="class-board-presentation-switcher__single-title">
              {visibleBoard.title}
            </span>
          ) : null}
        </div>
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
          <button type="button" className="class-board-presentation-refresh-button" disabled={pastingImage} onClick={() => void refresh()}>새로고침</button>
          <button type="button" onClick={() => void toggleFullscreen()}>{fullscreen ? '전체화면 나가기' : '전체화면'}</button>
          <ModalCloseButton label="우리 반 스크린 닫기" onClick={() => void closeScreen()} />
        </div>
      </header>
      {/*
        * 알림장 쓰기는 화면 전체로 연다(2026-09-29 선생님 요청). 교실 화면에 띄운 채 크게 쓰면서
        * 바로 안내할 수 있게 입력칸이 남는 높이를 모두 쓴다. 치는 대로 자동 저장되고, Esc·닫기로 돌아간다.
        */}
      {!editing && noticeOpen && hasNoticeWidget ? (
        <div
          className="class-board-presentation-notice-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="알림장 쓰기"
          onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setNoticeOpen(false); } }}
        >
          <div className="class-board-presentation-notice-sheet__heading">
            <strong>📒 알림장 쓰기</strong>
            {/* 전체화면에서는 Esc 를 브라우저가 먼저 가져가 전체화면을 푼다 — 그때는 `닫기` 로만 안내한다. */}
            <button type="button" onClick={() => setNoticeOpen(false)}>{fullscreen ? '닫기' : '닫기 (Esc)'}</button>
          </div>
          <Suspense fallback={<p className="class-board-note">알림장을 여는 중…</p>}>
            <NoticeComposer classId={data.class?.id} variant="sheet" showRecent={false} autoFocus />
          </Suspense>
        </div>
      ) : null}
      {editing ? (
        <PresentationEditPanel
          addableWidgets={addableWidgets}
          board={draftBoard}
          selectedInstance={selectedInstance}
          settingsAnchorStyle={settingsAnchorStyle}
          classId={data.class?.id}
          boardId={draftBoard.id}
          saveStatus={autosave.status}
          saving={saving}
          canUndo={undo.canUndo}
          pastingImage={pastingImage}
          error={editError}
          notice={notice}
          onAdd={addWidget}
          onConfigChange={updateSelectedConfig}
          onMoveLayer={moveSelectedLayer}
          onTogglePin={toggleSelectedPin}
          onRemove={removeSelected}
          onCloseSelection={clearSelection}
          onUndo={undoLast}
          onRetrySave={() => void autosave.flush()}
          onFinish={() => void finishEditing()}
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
          assetSeed={assetSeed}
          presentation
          editable={editing}
          contentRef={canvasContentRef}
          selectedInstanceId={selectedInstanceId}
          onSelect={setSelectedInstanceId}
          onClearSelection={clearSelection}
          onPlacementChange={updatePlacement}
        />
      </div>
      {confirmDialog}
    </main>
  );
}

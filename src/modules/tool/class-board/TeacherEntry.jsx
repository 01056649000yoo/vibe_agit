import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TeacherGuideButton from '../../../components/teacher/TeacherGuideButton';
import { classBoardApi } from './classBoardApi';
import {
  createDefaultClassBoard,
  createWidgetInstance,
  getAddableWidgets,
  normalizeClassBoard,
} from './classBoardModel';
import BoardCanvas from './host/BoardCanvas';
import { WidgetSettingsHost } from './host/WidgetHost';
import { getClassBoardWidget } from './widgets/registry';
import './classBoard.css';

const snapshot = (board) => JSON.stringify(board);

export default function ClassBoardTeacherEntry({ activeClass, module }) {
  const [boards, setBoards] = useState([]);
  const [board, setBoard] = useState(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [selectedInstanceId, setSelectedInstanceId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const requestRef = useRef(0);

  const dirty = Boolean(board) && snapshot(board) !== savedSnapshot;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const selectedInstance = board?.widgets.find((widget) => widget.instanceId === selectedInstanceId) || null;
  const addableWidgets = useMemo(() => getAddableWidgets(board?.widgets || []), [board?.widgets]);

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

  const loadWorkspace = useCallback(async () => {
    if (!activeClass?.id) {
      setLoading(false);
      return;
    }
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    setLoading(true);
    setError('');
    try {
      const result = await classBoardApi.getWorkspace(activeClass.id);
      if (requestId !== requestRef.current) return;
      const nextBoards = Array.isArray(result?.boards) ? result.boards.map(normalizeClassBoard) : [];
      setBoards(nextBoards);
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
    return () => { requestRef.current += 1; };
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
      setNotice('스크린을 저장했습니다. 발표 화면에 최신 내용이 보입니다.');
      return saved;
    } catch (saveError) {
      setError(saveError.message || '스크린을 저장하지 못했습니다.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const createBoard = () => {
    if (dirty && !window.confirm('저장하지 않은 변경을 버리고 새 스크린을 만들까요?')) return;
    const next = createDefaultClassBoard(activeClass?.name);
    setBoard(next);
    setSavedSnapshot('');
    setSelectedInstanceId(next.widgets[0].instanceId);
    setNotice('내용을 다듬은 뒤 저장해 주세요. 이미지는 첫 저장 후 올릴 수 있습니다.');
  };

  const duplicate = async () => {
    if (!board?.id || dirty) return;
    setSaving(true);
    setError('');
    try {
      const copy = normalizeClassBoard(await classBoardApi.duplicate(board.id));
      setBoards((current) => [copy, ...current.map((item) => ({ ...item, isActive: false }))]);
      selectBoard(copy, { force: true });
      setNotice('복사본을 만들었습니다. 원본과 별도로 수정할 수 있습니다.');
    } catch (copyError) {
      setError(copyError.message || '스크린을 복제하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const archive = async () => {
    if (!board?.id || dirty || !window.confirm(`‘${board.title}’ 스크린을 보관할까요?`)) return;
    setSaving(true);
    setError('');
    try {
      await classBoardApi.archive(board.id);
      await loadWorkspace();
      setNotice('스크린을 보관했습니다. 이미지 파일은 복구와 복사본을 위해 그대로 보존됩니다.');
    } catch (archiveError) {
      setError(archiveError.message || '스크린을 보관하지 못했습니다.');
    } finally {
      setSaving(false);
    }
  };

  const addWidget = (widgetId) => {
    const order = Math.max(0, ...(board?.widgets || []).filter((item) => item.zone === getClassBoardWidget(widgetId)?.defaultPlacement.zone).map((item) => item.order)) + 10;
    const instance = createWidgetInstance(widgetId, order);
    updateBoard((current) => ({ ...current, widgets: [...current.widgets, instance] }));
    setSelectedInstanceId(instance.instanceId);
  };

  const updateSelected = (patch) => updateBoard((current) => ({
    ...current,
    widgets: current.widgets.map((widget) => widget.instanceId === selectedInstanceId ? { ...widget, ...patch } : widget),
  }));

  const moveSelected = (direction) => updateBoard((current) => {
    const sameZone = current.widgets.filter((item) => item.zone === selectedInstance.zone).sort((a, b) => a.order - b.order);
    const index = sameZone.findIndex((item) => item.instanceId === selectedInstanceId);
    const target = sameZone[index + direction];
    if (!target) return current;
    return {
      ...current,
      widgets: current.widgets.map((item) => {
        if (item.instanceId === selectedInstanceId) return { ...item, order: target.order };
        if (item.instanceId === target.instanceId) return { ...item, order: selectedInstance.order };
        return item;
      }),
    };
  });

  const removeSelected = () => {
    if (!selectedInstance || !window.confirm(`${getClassBoardWidget(selectedInstance.widgetId)?.name || '위젯'}을 화면에서 뺄까요?`)) return;
    updateBoard((current) => ({ ...current, widgets: current.widgets.filter((widget) => widget.instanceId !== selectedInstanceId) }));
    setSelectedInstanceId(null);
  };

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
          <button type="button" className="class-board-secondary" onClick={createBoard}>새 스크린</button>
          <button type="button" className="class-board-primary" disabled={!board || !dirty || saving} onClick={() => void save()}>{saving ? '저장 중…' : '저장'}</button>
          <button
            type="button"
            className="class-board-present"
            disabled={!board?.id || dirty || saving}
            title={dirty ? '먼저 변경 내용을 저장해 주세요.' : ''}
            onClick={() => window.open(`/class-board/${board.id}`, '_blank', 'noopener')}
          >발표 화면 열기 ↗</button>
        </div>
      </header>

      {error ? <div className="class-board-alert is-error">{error}<button type="button" onClick={() => setError('')}>닫기</button></div> : null}
      {notice ? <div className="class-board-alert is-notice">{notice}<button type="button" onClick={() => setNotice('')}>닫기</button></div> : null}

      <div className="class-board-toolbar">
        <label>
          <span>저장된 스크린</span>
          <select value={board?.id || ''} onChange={(event) => selectBoard(boards.find((item) => item.id === event.target.value))}>
            {!board?.id ? <option value="">새 스크린 (아직 저장 안 됨)</option> : null}
            {boards.map((item) => <option key={item.id} value={item.id}>{item.title}{item.isActive ? ' · 현재' : ''}</option>)}
          </select>
        </label>
        <label className="class-board-title-field">
          <span>스크린 제목</span>
          <input maxLength={80} disabled={!board} value={board?.title || ''} onChange={(event) => updateBoard((current) => ({ ...current, title: event.target.value }))} />
        </label>
        <div className="class-board-toolbar__actions">
          <button type="button" disabled={!board?.id || dirty || saving} onClick={() => void duplicate()}>복제</button>
          <button type="button" disabled={!board?.id || dirty || saving} onClick={() => void archive()}>보관</button>
        </div>
      </div>

      {!board ? (
        <div className="class-board-empty class-board-empty--create">
          <span>🧩</span><h3>첫 우리 반 스크린을 만들어 보세요</h3>
          <p>텍스트·이미지·글쓰기 현황 위젯이 담긴 기본 화면에서 시작합니다.</p>
          <button type="button" className="class-board-primary" onClick={createBoard}>첫 스크린 만들기</button>
        </div>
      ) : (
        <div className="class-board-editor__workspace">
          <div className="class-board-preview-panel">
            <div className="class-board-panel-heading"><strong>화면 미리보기</strong><span>왼쪽 자료 70% · 오른쪽 현황 30%</span></div>
            <BoardCanvas board={board} classId={activeClass.id} selectedInstanceId={selectedInstanceId} onSelect={setSelectedInstanceId} />
          </div>

          <aside className="class-board-settings-panel">
            <div className="class-board-panel-heading"><strong>위젯 설정</strong><span>{dirty ? '저장하지 않은 변경 있음' : '저장됨'}</span></div>
            <div className="class-board-add-widget">
              <span>위젯 추가</span>
              <div>{addableWidgets.map((manifest) => (
                <button key={manifest.id} type="button" onClick={() => addWidget(manifest.id)}>{manifest.icon} {manifest.name}</button>
              ))}</div>
            </div>
            {selectedInstance ? (
              <div className="class-board-selected-settings">
                <h3>{getClassBoardWidget(selectedInstance.widgetId)?.icon} {getClassBoardWidget(selectedInstance.widgetId)?.name}</h3>
                <WidgetSettingsHost
                  instance={selectedInstance}
                  classId={activeClass.id}
                  boardId={board.id}
                  onChange={(config) => updateSelected({ config })}
                />
                <div className="class-board-instance-controls">
                  <button type="button" onClick={() => moveSelected(-1)}>위로</button>
                  <button type="button" onClick={() => moveSelected(1)}>아래로</button>
                  <select value={selectedInstance.size} onChange={(event) => updateSelected({ size: event.target.value })} aria-label="위젯 크기">
                    <option value="small">작게</option><option value="medium">보통</option><option value="large">크게</option>
                  </select>
                  <button type="button" className="is-danger" onClick={removeSelected}>빼기</button>
                </div>
              </div>
            ) : <p className="class-board-note">미리보기에서 위젯을 눌러 내용을 수정하세요.</p>}
          </aside>
        </div>
      )}
    </section>
  );
}

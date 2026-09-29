import { useCallback, useEffect, useRef, useState } from 'react';

/*
 * 우리 반 스크린 자동 저장 (2026-09-29 선생님 요청 — 편집한 뒤 `저장`을 또 눌러야 남는 것이 불편하다).
 *
 * 발표 화면의 `화면 편집`과 학급운영도구의 스크린 편집이 같이 쓴다.
 *
 * - 바뀐 뒤 잠시(CLASS_BOARD_AUTOSAVE_DELAY_MS) 조용하면 한 번 저장한다. 끄는 동안에는 위젯 틀이 제
 *   상태만 바꾸고 손을 뗄 때 한 번 알리므로, 끌기 한 번에 저장 한 번이다.
 * - **한 번에 하나만 보낸다.** 보내는 동안 더 고친 것은 끝난 뒤 다시 본다.
 * - "바뀌었나"는 **마지막으로 보낸 내용**과 견준다. 서버가 돌려준 판과 견주면 서버가 다듬은 차이
 *   때문에 끝없이 다시 저장할 수 있다. 저장이 끝나도 편집 중인 판을 서버 판으로 바꾸지 않는다 —
 *   그 사이에 고친 것이 사라지기 때문이다. 버전 번호만 받아 쓴다(onSaved 에서).
 * - 다른 창이 먼저 저장했으면(서버 PT409) 멈추고 알린다. 덮어쓰지 않는다.
 * - 저장에 실패하면 저절로 다시 시도하지 않는다(`다시 저장`). 같은 실패로 요청이 쌓이지 않게 한다.
 */

export const CLASS_BOARD_AUTOSAVE_DELAY_MS = 1500;

/** 저장해야 하는 내용만 — 서버에 보내는 세 가지. 버전·선택 상태·기본 표시 같은 것은 넣지 않는다. */
export const classBoardContentKey = (board) => (board
  ? JSON.stringify({ title: board.title, layout: board.layout, widgets: board.widgets })
  : '');

export const isClassBoardConflict = (error) => error?.code === 'PT409'
  || /다른 화면에서 먼저 저장/u.test(String(error?.message || ''));

/** 지금 저장할 수 있는지. 탭 이름이 비면 서버가 거절하므로 보내지 않고 기다린다. */
export const getClassBoardAutosaveBlock = (board) => (
  board && !String(board.title || '').trim() ? 'untitled' : null
);

export const CLASS_BOARD_SAVE_STATUS_TEXT = Object.freeze({
  idle: '저장됨',
  pending: '고치는 중…',
  saving: '저장 중…',
  saved: '자동 저장됨',
  untitled: '탭 이름을 적으면 저장됩니다',
  paused: '캡처를 준비한 뒤 저장합니다',
  error: '저장하지 못했습니다',
  conflict: '다른 화면에서 먼저 저장했습니다 · 새로고침해 주세요',
});

export default function useClassBoardAutosave({ board, enabled, paused = false, save, onSaved, onError }) {
  const [status, setStatus] = useState('idle');
  const [lastSavedKey, setLastSavedKey] = useState(null);
  const boardRef = useRef(board);
  boardRef.current = board;
  const lastSavedKeyRef = useRef(null);
  const timerRef = useRef(0);
  const inFlightRef = useRef(null);
  const stoppedRef = useRef(false);
  const handlersRef = useRef({ save, onSaved, onError });
  handlersRef.current = { save, onSaved, onError };

  const setSavedKey = (key) => {
    lastSavedKeyRef.current = key;
    setLastSavedKey(key);
  };

  /** 편집을 시작하거나 다른 판을 열 때 "이미 저장된 상태"를 정한다. 새 판(저장 전)은 null 을 넘긴다. */
  const baseline = useCallback((savedBoard) => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = 0; }
    stoppedRef.current = false;
    setSavedKey(savedBoard ? classBoardContentKey(savedBoard) : '');
    setStatus('idle');
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = 0; }
    if (inFlightRef.current) await inFlightRef.current.catch(() => {});
    const current = boardRef.current;
    if (!current || stoppedRef.current) return !current || classBoardContentKey(current) === lastSavedKeyRef.current;
    const key = classBoardContentKey(current);
    if (key === lastSavedKeyRef.current) return true;
    const block = getClassBoardAutosaveBlock(current);
    if (block) { setStatus(block); return false; }
    setStatus('saving');
    const request = Promise.resolve(handlersRef.current.save(current));
    inFlightRef.current = request;
    try {
      const saved = await request;
      setSavedKey(key);
      handlersRef.current.onSaved?.(saved, current);
      const latestKey = classBoardContentKey(boardRef.current);
      setStatus(latestKey === key ? 'saved' : 'pending');
      return latestKey === key;
    } catch (error) {
      if (isClassBoardConflict(error)) {
        stoppedRef.current = true;
        setStatus('conflict');
      } else {
        setStatus('error');
      }
      handlersRef.current.onError?.(error);
      return false;
    } finally {
      if (inFlightRef.current === request) inFlightRef.current = null;
    }
  }, []);

  const contentKey = classBoardContentKey(board);
  const hasUnsaved = Boolean(board) && lastSavedKey !== null && contentKey !== lastSavedKey;

  useEffect(() => {
    if (!enabled || !board || lastSavedKey === null || stoppedRef.current) return undefined;
    if (contentKey === lastSavedKey) {
      // 저장되기 전에 되돌려 이미 저장된 상태로 돌아왔으면 보낼 것이 없다. `고치는 중…`에 멈춰 있지 않게 한다.
      setStatus((currentStatus) => (['pending', 'paused', 'untitled'].includes(currentStatus) ? 'saved' : currentStatus));
      return undefined;
    }
    if (paused) { setStatus('paused'); return undefined; }
    const block = getClassBoardAutosaveBlock(board);
    if (block) { setStatus(block); return undefined; }
    // 실패한 뒤에는 저절로 다시 보내지 않는다. 다시 고치면 그때 다시 시도한다.
    setStatus((currentStatus) => (currentStatus === 'error' || currentStatus === 'saving' ? currentStatus : 'pending'));
    timerRef.current = window.setTimeout(() => { timerRef.current = 0; void flush(); }, CLASS_BOARD_AUTOSAVE_DELAY_MS);
    return () => { if (timerRef.current) { window.clearTimeout(timerRef.current); timerRef.current = 0; } };
  }, [enabled, board, contentKey, lastSavedKey, paused, flush]);

  // 저장 전에 창을 닫으려 하면 한 번 묻는다.
  useEffect(() => {
    if (!hasUnsaved) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [hasUnsaved]);

  return { status, hasUnsaved, flush, baseline };
}

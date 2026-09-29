import { useCallback, useEffect, useRef, useState } from 'react';
import { classBoardContentKey } from './useClassBoardAutosave.js';

/*
 * 스크린 편집 `되돌리기` (2026-09-29). 자동 저장으로 바뀌면서 "변경 모두 취소"가 없어졌으므로,
 * 방금 한 것을 하나씩 되돌리는 단추를 둔다. 편집을 시작한 뒤 한 것은 모두 되돌릴 수 있다(상한 안에서).
 *
 * - 글자를 칠 때처럼 잇달아 바뀌는 것은 한 번으로 묶는다(CLASS_BOARD_UNDO_GROUP_MS 안의 변화).
 * - 되돌린 판도 자동 저장된다. 되돌리기 자체는 기록에 쌓지 않는다.
 * - 판을 바꾸거나 편집을 새로 시작하면 기록을 비운다(`reset`).
 */

export const CLASS_BOARD_UNDO_GROUP_MS = 1000;
export const CLASS_BOARD_UNDO_LIMIT = 100;

/** 판에서 되돌릴 내용만 꺼낸다 — 저장되는 세 가지. 버전·아이디는 지금 판의 것을 그대로 쓴다. */
const pickContent = (board) => ({ title: board.title, layout: board.layout, widgets: board.widgets });

/** 기록 쌓기 규칙(화면 밖에서도 검사할 수 있게 순수 함수로 둔다). */
export const pushClassBoardUndo = (stack, previous, now, lastPushAt) => {
  if (now - lastPushAt < CLASS_BOARD_UNDO_GROUP_MS && stack.length > 0) return { stack, pushed: false };
  const next = [...stack, previous];
  return { stack: next.length > CLASS_BOARD_UNDO_LIMIT ? next.slice(-CLASS_BOARD_UNDO_LIMIT) : next, pushed: true };
};

export default function useClassBoardUndo(board) {
  const [stack, setStack] = useState([]);
  const previousRef = useRef(null);
  const lastPushAtRef = useRef(0);
  const skipNextRef = useRef(false);
  const contentKey = classBoardContentKey(board);

  useEffect(() => {
    if (!board) { previousRef.current = null; return; }
    const previous = previousRef.current;
    previousRef.current = pickContent(board);
    if (!previous || classBoardContentKey(previous) === contentKey) return;
    if (skipNextRef.current) { skipNextRef.current = false; return; }
    const now = Date.now();
    // 직전 시각은 **지금** 읽어 둔다. 상태 갱신 함수 안에서 읽으면 아래에서 바꾼 값을 읽어 모든 변화가 한 묶음이 된다.
    const lastPushAt = lastPushAtRef.current;
    setStack((current) => pushClassBoardUndo(current, previous, now, lastPushAt).stack);
    lastPushAtRef.current = now;
    // board 전체가 아니라 저장되는 내용이 바뀔 때만 본다(버전 번호만 바뀐 것은 기록하지 않는다).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contentKey]);

  const reset = useCallback((nextBoard = null) => {
    setStack([]);
    previousRef.current = nextBoard ? pickContent(nextBoard) : null;
    lastPushAtRef.current = 0;
    skipNextRef.current = false;
  }, []);

  /** 되돌릴 내용을 돌려준다. 화면은 이것을 지금 판에 덮어쓴다(아이디·버전은 그대로). */
  const takeUndo = useCallback(() => {
    if (stack.length === 0) return null;
    const target = stack.at(-1);
    setStack(stack.slice(0, -1));
    skipNextRef.current = true;
    // 되돌린 뒤 바로 이어서 고치면 새 기록으로 쌓이게 묶음 시간을 끊는다.
    lastPushAtRef.current = 0;
    return target;
  }, [stack]);

  return { canUndo: stack.length > 0, undoCount: stack.length, takeUndo, reset };
}

import React from 'react';
import { getClassBoardWidgetLayerState } from './widgetLayers';

export default function WidgetLayerControls({ board, instanceId, disabled = false, onMove }) {
  const layer = getClassBoardWidgetLayerState(board, instanceId);
  if (layer.total === 0) return null;
  return (
    <section className="class-board-layer-controls" aria-label="위젯 겹침 순서">
      <div>
        <strong>겹침 순서</strong>
        <span>뒤에서 {layer.position}번째 · 전체 {layer.total}개</span>
      </div>
      <div role="group" aria-label="선택한 위젯 레이어 이동">
        <button
          type="button"
          disabled={disabled || !layer.canMoveBackward}
          onClick={() => onMove(-1)}
        >한 층 뒤로</button>
        <button
          type="button"
          disabled={disabled || !layer.canMoveForward}
          onClick={() => onMove(1)}
        >한 층 앞으로</button>
      </div>
      <small>겹친 자료끼리의 순서만 바뀝니다. 펼친 오늘 현황은 항상 가장 앞에 표시됩니다.</small>
    </section>
  );
}

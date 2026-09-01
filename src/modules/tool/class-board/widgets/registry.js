import { textWidgetManifest } from './text/manifest';
import { imageWidgetManifest } from './image/manifest';
import { writingStatusWidgetManifest } from './writing-status/manifest';
import { weatherWidgetManifest } from './weather/manifest';
import { timerWidgetManifest } from './timer/manifest';
import { stopwatchWidgetManifest } from './stopwatch/manifest';
import { studentPickerWidgetManifest } from './student-picker/manifest';

const widgets = Object.freeze([
  textWidgetManifest,
  imageWidgetManifest,
  writingStatusWidgetManifest,
  weatherWidgetManifest,
  timerWidgetManifest,
  stopwatchWidgetManifest,
  studentPickerWidgetManifest,
]);

const ids = new Set();
widgets.forEach((widget) => {
  if (!widget?.id || ids.has(widget.id)) throw new Error('우리 반 스크린 위젯 ID가 없거나 겹칩니다.');
  if (!Number.isInteger(widget.version) || typeof widget.load !== 'function') {
    throw new Error(`${widget.id} 위젯의 버전 또는 지연 로더가 없습니다.`);
  }
  if (!widget.projectorSafe || typeof widget.createDefaultConfig !== 'function') {
    throw new Error(`${widget.id} 위젯의 스크린 표시 안전 계약이 없습니다.`);
  }
  ids.add(widget.id);
});

export const getClassBoardWidgets = () => widgets;
export const getClassBoardWidget = (id) => widgets.find((widget) => widget.id === id) || null;

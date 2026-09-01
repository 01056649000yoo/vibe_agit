export const stopwatchWidgetManifest = Object.freeze({
  id: 'stopwatch',
  name: '스톱워치',
  description: '발표나 활동에 걸린 시간을 바로 재요',
  icon: '⏱️',
  version: 1,
  type: 'local-interactive',
  projectorSafe: true,
  maxInstances: 2,
  defaultPlacement: {
    zone: 'content',
    size: 'medium',
    placement: { x: 46.2, y: 50, width: 21.7, height: 32, pinned: false },
  },
  createDefaultConfig: () => ({ label: '걸린 시간' }),
  load: () => import('./StopwatchWidget'),
  loadSettings: () => import('./StopwatchSettings'),
});

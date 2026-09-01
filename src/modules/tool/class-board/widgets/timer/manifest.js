export const timerWidgetManifest = Object.freeze({
  id: 'timer',
  name: '타이머',
  description: '활동 시간을 크게 재고 잠시 멈출 수 있어요',
  icon: '⏳',
  version: 1,
  type: 'local-interactive',
  projectorSafe: true,
  maxInstances: 2,
  defaultPlacement: {
    zone: 'content',
    size: 'medium',
    placement: { x: 35, y: 50, width: 29, height: 32, pinned: false },
  },
  createDefaultConfig: () => ({ label: '활동 시간', durationSeconds: 300 }),
  load: () => import('./TimerWidget'),
  loadSettings: () => import('./TimerSettings'),
});

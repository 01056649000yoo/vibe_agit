export const studentPickerWidgetManifest = Object.freeze({
  id: 'student-picker',
  name: '학생 무작위 뽑기',
  description: '현재 학급 학생을 겹치지 않게 한 명씩 뽑아요',
  icon: '🎲',
  version: 1,
  type: 'live-once',
  projectorSafe: true,
  maxInstances: 1,
  requestBudget: { initial: 1, refreshMs: null, realtime: false, maxRows: 100 },
  defaultPlacement: {
    zone: 'content',
    size: 'medium',
    placement: { x: 2.1, y: 66, width: 31.5, height: 30, pinned: false },
  },
  createDefaultConfig: () => ({
    title: '오늘의 발표자',
    allowRepeats: false,
    soundEnabled: true,
    soundVolume: 0.55,
  }),
  load: () => import('./StudentPickerWidget'),
  loadSettings: () => import('./StudentPickerSettings'),
});

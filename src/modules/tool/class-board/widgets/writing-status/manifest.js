export const writingStatusWidgetManifest = Object.freeze({
  id: 'writing-status',
  name: '글쓰기 현황',
  description: '학생 이름 없이 과제 진행 숫자만 보여 줘요',
  icon: '✍️',
  version: 1,
  type: 'live',
  projectorSafe: true,
  maxInstances: 1,
  requestBudget: { initial: 1, refreshMs: 20_000, realtime: false },
  defaultPlacement: { zone: 'sidebar', size: 'large' },
  createDefaultConfig: () => ({ missionId: null }),
  load: () => import('./WritingStatusWidget'),
  loadSettings: () => import('./WritingStatusSettings'),
});


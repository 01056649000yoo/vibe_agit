export const arrangementBoardWidgetManifest = Object.freeze({
  id: 'arrangement-board',
  name: '자리·역할 배치',
  description: '자리 뽑기나 역할 뽑기로 정한 가장 최근 결과를 교실 화면에 그대로 띄워요',
  icon: '🪑',
  version: 1,
  // 결과는 배치 도구가 이미 저장해 둔 것이다. 열 때 **가장 최근 한 건만** 읽고 그 뒤로는 읽지 않는다.
  type: 'live-once',
  projectorSafe: true,
  maxInstances: 1,
  requestBudget: { initial: 1, refreshMs: null, realtime: false, maxRows: 1 },
  defaultPlacement: {
    zone: 'content',
    size: 'large',
    placement: { x: 5, y: 5, width: 46, height: 60, pinned: false },
  },
  createDefaultConfig: () => ({
    heading: '오늘의 자리',
    kind: 'seat',
  }),
  load: () => import('./ArrangementBoardWidget'),
  loadSettings: () => import('./ArrangementBoardSettings'),
});

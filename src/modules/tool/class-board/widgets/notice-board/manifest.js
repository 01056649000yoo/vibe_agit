export const noticeBoardWidgetManifest = Object.freeze({
  id: 'notice-board',
  name: '알림장',
  description: '오늘 날짜와 함께 그날의 알림을 보여 주고 지난 알림도 다시 불러와요',
  icon: '📒',
  version: 1,
  // 내용은 학급+날짜 표에 있고 제목·색만 보드 JSON에 남는다. 열 때 오늘 알림 1회만 읽는다.
  type: 'live-once',
  projectorSafe: true,
  maxInstances: 1,
  requestBudget: { initial: 1, refreshMs: null, realtime: false, maxRows: 30 },
  defaultPlacement: {
    zone: 'content',
    size: 'large',
    placement: { x: 51, y: 5, width: 46, height: 46, pinned: false },
  },
  createDefaultConfig: () => ({
    heading: '알림장',
    tone: 'yellow',
  }),
  load: () => import('./NoticeBoardWidget'),
  loadSettings: () => import('./NoticeBoardSettings'),
});

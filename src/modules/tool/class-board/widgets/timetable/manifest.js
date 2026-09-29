export const timetableWidgetManifest = Object.freeze({
  id: 'timetable',
  name: '시간표',
  description: '학급 시간표 관리에서 입력한 오늘·내일·이번 주 시간표를 보여 줘요',
  icon: '🗓️',
  version: 1,
  // 열 때 이번 주·다음 주를 한 번에 읽고(요청 1회), 오늘·내일·이번 주·자동 전환을 모두 그 안에서 그린다.
  // 자동 전환은 기기 시계로만 판단하며 다시 묻지 않는다. 폴링·실시간 없음.
  type: 'live-once',
  projectorSafe: true,
  // 오늘과 이번 주를 나란히 띄울 수 있게 둘까지(서버 검사와 같다).
  maxInstances: 2,
  requestBudget: { initial: 1, refreshMs: null, realtime: false, maxRows: 2 },
  defaultPlacement: {
    zone: 'content',
    size: 'large',
    placement: { x: 60, y: 5, width: 36, height: 60, pinned: false },
  },
  createDefaultConfig: () => ({
    heading: '시간표',
    view: 'auto',
    switchHour: 13,
    tone: 'sky',
  }),
  load: () => import('./TimetableWidget'),
  loadSettings: () => import('./TimetableSettings'),
});

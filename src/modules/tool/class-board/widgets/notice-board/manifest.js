export const noticeBoardWidgetManifest = Object.freeze({
  id: 'notice-board',
  name: '알림장',
  description: '교사가 작성한 알림을 저장해 다시 보여 줘요',
  icon: '📒',
  version: 1,
  type: 'static',
  projectorSafe: true,
  maxInstances: 1,
  defaultPlacement: {
    zone: 'content',
    size: 'large',
    placement: { x: 51, y: 5, width: 46, height: 46, pinned: false },
  },
  createDefaultConfig: () => ({
    heading: '알림장',
    body: '우리 반 알림을 입력해 주세요.',
    tone: 'yellow',
  }),
  load: () => import('./NoticeBoardWidget'),
  loadSettings: () => import('./NoticeBoardSettings'),
});

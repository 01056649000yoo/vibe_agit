export const textWidgetManifest = Object.freeze({
  id: 'text',
  name: '텍스트',
  description: '오늘의 안내나 수업 순서를 적어요',
  icon: '📝',
  version: 1,
  type: 'static',
  projectorSafe: true,
  maxInstances: 8,
  defaultPlacement: {
    zone: 'content',
    size: 'medium',
    placement: { x: 2.1, y: 4, width: 31.5, height: 42, pinned: false },
  },
  createDefaultConfig: () => ({
    heading: '오늘의 안내',
    body: '우리 반에 보여 줄 안내를 입력해 주세요.',
    tone: 'paper',
    fontScale: 1.5,
  }),
  load: () => import('./TextWidget'),
  loadSettings: () => import('./TextSettings'),
});

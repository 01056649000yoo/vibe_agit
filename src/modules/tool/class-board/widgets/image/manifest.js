export const imageWidgetManifest = Object.freeze({
  id: 'image',
  name: '이미지',
  description: '사진, 시간표, 학급 자료를 크게 보여 줘요',
  icon: '🖼️',
  version: 1,
  type: 'static',
  projectorSafe: true,
  maxInstances: 12,
  defaultPlacement: { zone: 'content', size: 'large' },
  createDefaultConfig: () => ({ path: '', caption: '', fit: 'contain' }),
  load: () => import('./ImageWidget'),
  loadSettings: () => import('./ImageSettings'),
});


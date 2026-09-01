export const weatherWidgetManifest = Object.freeze({
  id: 'weather',
  name: '날씨',
  description: '오늘 날씨와 교실 안내를 크게 보여 줘요',
  icon: '🌤️',
  version: 1,
  type: 'static',
  projectorSafe: true,
  maxInstances: 1,
  defaultPlacement: {
    zone: 'content',
    size: 'medium',
    placement: { x: 3, y: 50, width: 30, height: 32, pinned: false },
  },
  createDefaultConfig: () => ({ condition: 'sunny', temperature: 20, message: '오늘도 즐겁게 시작해요!' }),
  load: () => import('./WeatherWidget'),
  loadSettings: () => import('./WeatherSettings'),
});

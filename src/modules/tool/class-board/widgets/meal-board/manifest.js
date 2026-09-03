import { DEFAULT_MEAL_COLUMNS } from './mealColumns';

export const mealBoardWidgetManifest = Object.freeze({
  id: 'meal-board',
  name: '식단표',
  description: '얘들아, 밥 먹자!에 연결한 학교의 오늘 급식을 보여 줘요',
  icon: '🍚',
  version: 1,
  type: 'live-once',
  projectorSafe: true,
  maxInstances: 1,
  requestBudget: { initial: 2, refreshMs: null, realtime: false, maxRows: 10 },
  defaultPlacement: {
    zone: 'content',
    size: 'large',
    placement: { x: 3, y: 5, width: 46, height: 46, pinned: false },
  },
  createDefaultConfig: () => ({
    heading: '오늘의 급식',
    showAllergens: true,
    // 급식 이름을 몇 열로 세울지. 글씨는 남은 자리에 맞춰 저절로 커진다.
    columns: DEFAULT_MEAL_COLUMNS,
  }),
  load: () => import('./MealBoardWidget'),
  loadSettings: () => import('./MealBoardSettings'),
});

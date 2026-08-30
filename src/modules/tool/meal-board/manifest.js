export const mealBoardManifest = {
  id: 'meal-board',
  name: '얘들아, 밥 먹자!',
  description: '오늘 급식과 우리 반 학생별 비고를 확인해요',
  icon: '🍱',
  part: 'tool',
  audience: 'teacher',
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 100 },
  teacherEntry: () => import('./TeacherEntry'),
  tool: { order: 10, launchMode: 'embedded' }
};

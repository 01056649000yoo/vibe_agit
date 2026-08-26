export const mealBoardManifest = {
  id: 'meal-board',
  name: '얘들아, 밥 먹자!',
  description: '오늘 급식과 우리 반 개인별 건강 항목을 관리해요',
  icon: '🍱',
  part: 'tool',
  audience: 'teacher',
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 100 },
  teacherEntry: () => import('./TeacherEntry'),
  tool: { order: 30, launchMode: 'embedded' }
};

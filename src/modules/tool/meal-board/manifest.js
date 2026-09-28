export const mealBoardManifest = {
  id: 'meal-board',
  name: '얘들아, 밥 먹자!',
  description: '오늘 급식과 우리 반 학생별 비고를 확인해요',
  icon: '🍱',
  part: 'tool',
  audience: 'teacher',
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 100 },
  teacherEntry: () => import('./TeacherEntry'),
  // 머리말 단축 단추로 열면 곧바로 전체화면 급식판(2026-09-28 선생님 요청).
  tool: { order: 10, launchMode: 'embedded', shortcutLaunch: 'fullscreen' }
};

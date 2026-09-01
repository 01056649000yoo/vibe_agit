export const classBoardManifest = {
  id: 'class-board',
  name: '우리 반 스크린',
  description: '교실 화면에 안내와 글쓰기 현황을 함께 띄워요',
  icon: '🖥️',
  part: 'tool',
  audience: 'teacher',
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 20 },
  teacherEntry: () => import('./TeacherEntry'),
  tool: { order: 5, launchMode: 'embedded', beta: true },
};

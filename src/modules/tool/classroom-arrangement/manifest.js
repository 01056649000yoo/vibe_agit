export const classroomArrangementManifest = {
  id: 'classroom-arrangement',
  name: '자리·역할 배치',
  description: '우리 반 자리와 역할을 조건에 맞게 즐겁게 추첨',
  icon: '🎱',
  part: 'tool',
  audience: 'teacher',
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 50 },
  teacherEntry: () => import('./TeacherEntry'),
  tool: { order: 20, launchMode: 'embedded' }
};

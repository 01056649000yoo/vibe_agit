export const classNoticeManifest = {
  id: 'class-notice',
  name: '알림장',
  description: '날짜별 알림을 쓰고 지난 알림을 다시 봐요',
  icon: '📒',
  part: 'tool',
  audience: 'teacher',
  // 목록은 열 때 한 번, 날짜를 고를 때 그 한 건만 더 읽는다. 폴링·실시간은 쓰지 않는다.
  performance: { home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 40 },
  teacherEntry: () => import('./TeacherEntry'),
  tool: { order: 15, launchMode: 'embedded' }
};

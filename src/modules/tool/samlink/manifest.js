export const samlinkManifest = {
  id: 'samlink',
  name: 'QR 코드 관리',
  description: '쌤링크에서 수업 링크를 만들고 QR 코드로 바로 공유',
  icon: '🔗',
  part: 'tool',
  audience: 'teacher',
  performance: { home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 0 },
  teacherEntry: () => import('./TeacherEntry'),
  tool: {
    order: 10,
    launchMode: 'embedded',
    href: 'https://샘링크.kr'
  }
};

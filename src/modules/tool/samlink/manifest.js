export const samlinkManifest = {
  id: 'samlink',
  name: 'URL 단축하기',
  description: '쌤링크에서 수업 URL을 짧게 만들고 QR 코드로 바로 공유',
  icon: '🔗',
  part: 'tool',
  audience: 'teacher',
  performance: { home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 0 },
  teacherEntry: () => import('./TeacherEntry'),
  tool: {
    order: 30,
    launchMode: 'embedded',
    href: 'https://샘링크.kr'
  }
};

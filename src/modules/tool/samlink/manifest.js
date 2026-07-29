export const samlinkManifest = {
  id: 'samlink',
  name: '쌤링크',
  description: '수업 링크를 짧게 만들고 QR 코드로 바로 공유',
  icon: '🔗',
  part: 'tool',
  audience: 'teacher',
  teacherEntry: () => import('./TeacherEntry'),
  tool: {
    order: 10,
    launchMode: 'embedded',
    href: 'https://샘링크.kr'
  }
};

export default samlinkManifest;

export const classAgitManifest = {
    id: 'class-agit', name: '우리반 아지트', icon: '🏡',
    description: '우리 반의 글을 전시하고 문집으로 남기는 공간',
    part: 'community', audience: 'both', core: false,
    defaultEnabled: false, available: true,
    // 실제 공개는 DB 내부 단계·관리자 본인 학급·학급 ON·공개 전시 존재로 제한한다.
    teacherEntry: () => import('./teacher/TeacherEntry.jsx'),
    studentEntry: () => import('./student/StudentEntry.jsx'),
    studentRoute: 'class_agit',
    studentDashboard: { title: '우리반 아지트', description: '우리 반 작가들의 글꽃 전시관', tone: 'green', order: 15, visibilityKey: 'class_agit_available' },
    performance: { home: 'summary', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 100 },
};

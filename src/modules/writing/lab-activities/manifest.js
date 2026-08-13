export const labActivitiesManifest = {
    id: 'lab-activities',
    name: '글쓰기 연구소',
    description: '선생님이 연 우리 반 글쓰기 활동에 바로 참여하기',
    icon: '🧪',
    part: 'writing',
    audience: 'student',
    core: true,
    toggleable: false,
    performance: { home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 20 },
    studentRoute: 'lab_activities',
    studentDashboard: {
        title: '글쓰기 연구소',
        description: '우리 반 활동 시작·이어하기',
        tone: 'violet',
        order: 15
    },
    studentEntry: () => import('./LabActivitiesPage')
};

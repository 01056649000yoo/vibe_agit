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
        title: '글쓰기 연구소 (beta)',
        description: '우리 반 활동 시작·이어하기',
        tone: 'violet',
        order: 15,
        // 홈 RPC 가 주는 값 이름. 홈은 이 키만 보고 NEW 를 붙인다(따로 조회하지 않는다).
        newFlagKey: 'has_new_lab_activity'
    },
    studentEntry: () => import('./LabActivitiesPage')
};

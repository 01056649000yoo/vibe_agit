export const spellingLearningManifest = {
    id: 'spelling-learning',
    name: '맞춤법 배움 데이터',
    description: '우리 반이 자주 헷갈리는 표현을 만들고 살펴봅니다.',
    icon: '✍️',
    part: 'writing',
    audience: 'teacher',
    core: true,
    settingsEntry: () => import('./TeacherEntry'),
    settings: {
        order: 50,
        label: '맞춤법 배움 데이터',
        description: '우리 반 맞춤법 항목과 추천 후보'
    },
    performance: {
        home: 'none', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 100
    },
    dashboardCards: {
        'class-footprint': [{
            id: 'spelling-learning-labels',
            section: 'visualization',
            renderer: 'point-types',
            order: 70,
            title: '✍️ 우리 반 맞춤법 발자국',
            hint: '학생들이 직접 찾아본 표현을 유형별로 모았습니다.',
            modalHint: '검색했다는 이유만으로 틀렸다고 단정하지 않고, 우리 반이 궁금해한 표현을 보여줍니다.',
            rowsPath: 'detail.spelling_labels',
            emptyMessage: '아직 맞춤법 검색 기록이 없습니다.',
            color: '#7C3AED',
            unit: '회',
            surfaces: ['default', 'fullscreen', 'modal']
        }]
    }
};

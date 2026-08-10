export const neighborAgitManifest = {
    id: 'neighbor-agit',
    name: '이웃 아지트',
    description: '다른 학급과 글을 나누는 독립 공간',
    icon: '🤝',
    part: 'community',
    audience: 'teacher',
    core: true,
    settingsEntry: () => import('./SettingsEntry'),
    settings: {
        order: 60,
        label: '이웃 아지트',
        description: '다른 학급과 글 나누기'
    },
    performance: {
        home: 'none', load: 'on-open', writes: 'none', realtime: 'none', maxInitialRows: 0
    }
};

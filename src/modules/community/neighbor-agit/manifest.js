import {
    NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE,
    NEIGHBOR_AGIT_LIMITS
} from './policy';
import { NEIGHBOR_AGIT_WRITING_BRIDGE } from './writingBridge';

export const neighborAgitManifest = {
    id: 'neighbor-agit',
    name: '이웃 아지트',
    description: '다른 학급과 글을 나누는 독립 공간',
    icon: '🤝',
    part: 'community',
    audience: 'both',
    core: false,
    defaultEnabled: false,
    teacherEntry: () => import('./TeacherEntry'),
    studentEntry: () => import('./StudentEntry'),
    studentRoute: 'neighbor_agit',
    studentDashboard: {
        title: '이웃 아지트',
        description: '여러 반 친구들의 글 만나기',
        tone: 'violet',
        order: 20,
        visibilityKey: 'neighbor_agit_available',
        badgeCountKey: 'neighbor_agit_new_count'
    },
    rollout: {
        defaultMode: NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE,
        maxClassesPerSpace: NEIGHBOR_AGIT_LIMITS.maxClassesPerSpace,
        maxActiveSpacesPerClass: NEIGHBOR_AGIT_LIMITS.maxActiveSpacesPerClass
    },
    writingBridge: NEIGHBOR_AGIT_WRITING_BRIDGE,
    performance: {
        home: 'summary', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 20
    }
};

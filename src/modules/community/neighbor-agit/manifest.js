import {
    NEIGHBOR_AGIT_DEFAULT_ROLLOUT_MODE,
    NEIGHBOR_AGIT_LIMITS
} from './policy';
import { NEIGHBOR_AGIT_WRITING_BRIDGE } from './writingBridge';

export const neighborAgitManifest = {
    id: 'neighbor-agit',
    name: '모두의 아지트(제작 중)',
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
        title: '모두의 아지트',
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
    // 내 글에 이웃 반 댓글이 달리면 "내 글 소식"(module_id='feedback')으로 알린다(SQL 20261334).
    // 공감은 알리지 않는다(반이 많으면 알림이 넘친다). 누르면 내 글 소식 창이 모두의 아지트의 그 글을 연다.
    notifications: [
        {
            eventType: 'feedback.neighbor_comment_received',
            icon: '🤝',
            tone: 'default',
            title: '이웃 반 친구가 댓글을 남겼어요',
            message: (payload) => {
                const excerpt = payload.excerpt ? ` “${payload.excerpt}”` : '';
                return `${payload.actor_class_name || '이웃 반'} ${payload.actor_name || '친구'} 친구가 모두의 아지트의 ‘${payload.post_title || '내 글'}’에 댓글을 남겼어요.${excerpt}`;
            },
            action: 'post',
            actionLabel: '확인'
        }
    ],
    performance: {
        home: 'summary', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 20
    }
};

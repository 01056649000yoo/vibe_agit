/**
 * 학생 자율 글쓰기의 첫 모듈.
 * 과제 글쓰기와 저장소·기본 에디터는 공유하되 미션 제출 흐름과는 분리한다.
 */
const readingLogOperationCard = {
    id: 'reading-pending', section: 'actions', renderer: 'action', order: 20,
    icon: '📚', title: '독서록 확인', description: '학생이 등록한 미확인 독서록',
    dataPath: 'actions.reading_pending',
    tone: { background: '#F0FDF4', border: '#BBF7D0', badge: '#DCFCE7', text: '#15803D' },
    detailPaths: ['title'], detailFallback: '제목 없는 독서록', actionLabel: '독서록 확인',
    navigate: { tab: 'reading-logs', kind: 'reading-review', includeFirstItem: true }
};

const readingLogNotifications = Object.freeze([
    {
        eventType: 'reading-log.review_completed',
        icon: '✅',
        tone: 'positive',
        title: '독서록을 확인했어요',
        message: (payload) => `선생님이 ‘${payload.post_title || '내 독서록'}’을 확인했어요.${payload.marathon_applied ? ' 독서마라톤에도 반영됐어요.' : ''}`,
        action: 'post',
        actionLabel: '내 독서록 확인하기'
    },
    {
        /*
         * 2026-09-03: 완주하면 메달이 조용히 쌓이기만 해 아이가 모르고 지나갔다.
         * 다른 성취와 같은 원장에 넣어 🔔 와 학생 홈에 함께 뜨게 한다.
         */
        eventType: 'reading-log.marathon_completed',
        icon: '🏅',
        tone: 'positive',
        title: '독서마라톤을 완주했어요!',
        message: (payload) => (payload.medal_kind === 'team'
            ? `${payload.team_name ? `‘${payload.team_name}’와 함께 ` : '친구들과 함께 '}‘${payload.campaign_title || '독서마라톤'}’을 완주했어요. 메달을 확인해 보세요!`
            : `‘${payload.campaign_title || '독서마라톤'}’ 목표 거리를 다 달렸어요. 메달을 확인해 보세요!`),
        action: 'confirm',
        actionLabel: '메달 보러 가기'
    },
    {
        eventType: 'reading-log.revision_requested',
        icon: '✏️',
        tone: 'rewrite',
        title: '독서록을 조금 더 살펴봐 주세요',
        message: (payload) => payload.has_comment
            ? `선생님이 ‘${payload.post_title || '내 독서록'}’에 보완할 내용을 남겼어요.`
            : `선생님이 ‘${payload.post_title || '내 독서록'}’의 보완을 요청했어요.`,
        action: 'post',
        actionLabel: '선생님 의견 보기'
    }
]);

export const readingLogManifest = {
    id: 'reading-log',
    name: '나의 독서록',
    description: '읽은 책과 내 생각을 언제든 기록하기',
    icon: '📚',
    part: 'writing',
    audience: 'student',
    core: true,
    performance: { home: 'summary', load: 'on-open', writes: 'rpc', realtime: 'core-only', maxInitialRows: 50 },
    studentRoute: 'reading_logs',
    studentRecommendation: {
        icon: '📚', title: '오늘 읽은 책을 남겨 봐',
        message: '책에서 기억에 남은 장면과 내 생각을 독서록 한 편으로 적어 둘 수 있어.',
        ctaLabel: '독서록 쓰기', order: 30,
        action: { type: 'navigate', target: 'reading_logs' }
    },
    communityFeed: {
        group: 'self',
        label: '독서록',
        icon: '📚',
        description: '친구들이 공개한 독서록',
        emptyMessage: '아직 친구에게 공개된 독서록이 없어요.',
        order: 10,
    },
    writingPolicy: {
        type: 'reading_log',
        completionFlow: 'student_complete',
        defaults: {
            min_chars: 200,
            min_paragraphs: 1,
            base_reward: 100,
            bonus_enabled: false,
            bonus_threshold: 0,
            bonus_reward: 0,
            repeat_bonus_enabled: false,
            repeat_bonus_threshold: 0,
            repeat_bonus_reward: 0,
            repeat_bonus_max_count: 0,
            daily_reward_limit: 1
        }
    },
    notifications: readingLogNotifications,
    myAgitEntry: () => import('./marathon/ReadingMarathonMedalCase'),
    myAgit: { order: 25 },
    studentEntry: () => import('./ReadingLogPage'),
    teacherEntry: () => import('./teacher/TeacherReadingLogManager'),
    dashboardCards: {
        'class-operations': [readingLogOperationCard]
    }
};

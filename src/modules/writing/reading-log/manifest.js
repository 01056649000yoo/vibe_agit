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
            daily_reward_limit: 1
        }
    },
    studentEntry: () => import('./ReadingLogPage'),
    teacherEntry: () => import('./teacher/TeacherReadingLogManager'),
    dashboardCards: {
        'class-operations': [readingLogOperationCard]
    }
};

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
    studentRoute: 'reading_logs',
    studentEntry: () => import('./ReadingLogPage'),
    teacherEntry: () => import('./teacher/TeacherReadingLogManager'),
    dashboardCards: {
        'class-operations': [readingLogOperationCard]
    }
};

export default readingLogManifest;

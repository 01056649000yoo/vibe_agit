const BLUE = { background: '#EFF6FF', border: '#BFDBFE', badge: '#DBEAFE', text: '#1D4ED8' };
const ORANGE = { background: '#FFF7ED', border: '#FED7AA', badge: '#FFEDD5', text: '#C2410C' };
const PURPLE = { background: '#FAF5FF', border: '#E9D5FF', badge: '#F3E8FF', text: '#7E22CE' };

/** 학급 운영 코어 카드. 선택 기능의 카드는 각 모듈 manifest.dashboardCards에서 보탠다. */
export const CLASS_OPERATIONS_CORE_CARDS = [
    {
        id: 'accessed-students', section: 'summary', renderer: 'metric', order: 10,
        icon: '🔑', label: '접속 학생', background: '#EFF6FF', color: '#1D4ED8',
        metric: { type: 'ratio', numeratorPath: 'summary.accessed_students', denominatorPath: 'summary.students', unit: '명', noteLabel: '접속률' }
    },
    {
        id: 'active-students', section: 'summary', renderer: 'metric', order: 15,
        icon: '👥', label: '글쓰기 활동 학생', background: '#F5F3FF', color: '#6D28D9',
        metric: { type: 'ratio', numeratorPath: 'summary.active_students', denominatorPath: 'summary.students', unit: '명', noteLabel: '참여율' }
    },
    {
        id: 'submitted-posts', section: 'summary', renderer: 'metric', order: 20,
        icon: '📝', label: '작성 완료 글', metric: { path: 'summary.submitted_posts', unit: '편' }
    },
    {
        id: 'rewrite-requests', section: 'summary', renderer: 'metric', order: 30,
        icon: '↩️', label: '다시쓰기 요청', background: '#F0FDF4', color: '#15803D',
        metric: { path: 'summary.rewrite_requests', unit: '회' }
    },
    {
        id: 'revision-submissions', section: 'summary', renderer: 'metric', order: 35,
        icon: '♻️', label: '수정 제출', background: '#ECFDF5', color: '#047857',
        metric: { path: 'summary.revision_submissions', unit: '회' }
    },
    {
        id: 'comments', section: 'summary', renderer: 'metric', order: 40,
        icon: '💬', label: '댓글 활동', metric: { path: 'summary.comments', unit: '회' }
    },
    {
        id: 'feedback-updates', section: 'summary', renderer: 'metric', order: 50,
        icon: '💡', label: '피드백 반영', background: '#FFF7ED', color: '#C2410C',
        note: 'AI 피드백·교사 의견 저장',
        metric: { path: 'summary.feedback_updates', unit: '회' }
    },
    {
        id: 'average-characters', section: 'summary', renderer: 'metric', order: 60,
        icon: '🔤', label: '평균 글자 수', metric: { path: 'summary.avg_chars', unit: '자' }
    },
    {
        id: 'assignment-pending', section: 'actions', renderer: 'action', order: 10,
        icon: '📥', title: '과제 제출 확인', description: '제출했지만 아직 확인하지 않은 글',
        dataPath: 'actions.assignment_pending', tone: BLUE,
        detailPaths: ['mission_title', 'title'], detailFallback: '선생님 과제', actionLabel: '제출 글 확인',
        navigate: { tab: 'dashboard', kind: 'assignment-review', includeFirstItem: true }
    },
    {
        id: 'evaluation-pending', section: 'actions', renderer: 'action', order: 30,
        icon: '🧭', title: '평가 입력', description: '루브릭은 설정됐지만 평가가 없는 글',
        dataPath: 'actions.evaluation_pending', tone: ORANGE,
        detailPaths: ['mission_title', 'title'], detailFallback: '평가 과제', actionLabel: '평가 입력',
        navigate: { tab: 'dashboard', kind: 'evaluation-entry', includeFirstItem: true }
    },
    {
        id: 'inactive-students', section: 'actions', renderer: 'action', order: 40,
        icon: '🌙', title: '최근 활동 없음', description: '7일 넘게 글쓰기 활동이 없는 학생',
        dataPath: 'actions.inactive_students', tone: PURPLE,
        detailRenderer: 'last-activity', actionLabel: '학생 명단 보기',
        navigate: { tab: 'students', kind: 'student-roster' }
    }
];

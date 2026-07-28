/**
 * 교사 대시보드 상단 업무 영역.
 *
 * 대시보드와 UI 작업실(`src/dev/UiPreview.jsx`)이 같은 정의를 보도록 분리했다.
 * 메뉴를 고칠 때 두 곳이 어긋나지 않게 하려는 목적이다.
 */
export const TEACHER_NAV_GROUPS = [
    {
        id: 'writing',
        label: '글쓰기',
        icon: '✍️',
        defaultTab: 'dashboard',
        tabs: [
            { id: 'dashboard', label: '선생님 과제' },
            { id: 'reading-logs', label: '학생 독서록' },
            { id: 'archive', label: '보관함' }
        ]
    },
    {
        id: 'students',
        label: '학생',
        icon: '👥',
        defaultTab: 'students',
        tabs: [{ id: 'students', label: '학생 관리' }],
        // 화면 안에서 다시 나뉘는 구조 (UI 작업실 표시용)
        inner: '학생 명단 / 최근 활동 / 학급 분석 / 학급 설정 좌측 메뉴로 나뉩니다.'
    },
    {
        id: 'records',
        label: '평가·기록',
        icon: '📝',
        defaultTab: 'evaluation',
        tabs: [
            { id: 'evaluation', label: '학생 평가' },
            { id: 'activity', label: '평어 도우미' }
        ]
    },
    {
        id: 'playground',
        label: '포인트·놀이',
        icon: '🎮',
        defaultTab: 'playground',
        tabs: [{ id: 'playground', label: '포인트·놀이' }],
        inner: '드래곤 키우기·어휘의 탑 관리 카드와 모듈 on/off로 구성됩니다.'
    },
    {
        id: 'settings',
        label: '설정',
        icon: '⚙️',
        defaultTab: 'settings',
        tabs: [
            { id: 'settings', label: '관리 설정' },
            { id: 'guide', label: '사용 안내' }
        ]
    }
];

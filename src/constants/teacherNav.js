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
        secondaryShape: 'sidebar',
        tabs: [
            { id: 'dashboard', label: '선생님 과제' },
            { id: 'reading-logs', label: '학생 독서록' },
            { id: 'diaries', label: '학생 일기' },
            { id: 'archive', label: '보관함' }
        ]
    },
    {
        id: 'writing-lab',
        label: '글쓰기 연구소',
        icon: '🧪',
        launchHref: '/lab/dashboard',
        tabs: []
    },
    {
        id: 'operations',
        label: '학급 운영',
        icon: '📊',
        defaultTab: 'operations',
        secondaryShape: 'sidebar',
        tabs: [
            { id: 'operations', label: '운영 현황' },
            { id: 'student-agits', label: '학생 아지트' },
            { id: 'recent-activity', label: '최근 활동' },
            { id: 'comments', label: '학생 댓글' }
        ]
    },
    {
        id: 'students',
        label: '학생',
        icon: '👥',
        defaultTab: 'students',
        // 학생 탭은 개인 관리로만 쓴다. 학급 전체 흐름은 바로 앞의 학급 운영에서 본다.
        tabs: [{ id: 'students', label: '학생 명단 관리' }]
    },
    {
        id: 'records',
        label: '평가·기록',
        icon: '📝',
        defaultTab: 'evaluation',
        secondaryShape: 'sidebar',
        tabs: [
            { id: 'evaluation', label: '학생 평가' },
            { id: 'activity', label: '평어 도우미' }
        ]
    },
    {
        id: 'playground',
        label: '아지트 놀이터',
        icon: '🎡',
        defaultTab: 'playground',
        tabs: [{ id: 'playground', label: '아지트 놀이터' }],
        // 화면 안이 카드로 구성된다 (GameManager).
        // 켜고 끄는 버튼은 별도 화면이 아니라 각 카드 머리에 붙어 있다.
        innerShape: 'cards',
        innerItems: ['드래곤 키우기 관리', '어휘의 탑 관리'],
        innerNote: '각 카드 머리의 "학생 화면 ON/OFF" 버튼으로 켜고 끕니다.'
    },
    {
        id: 'footprints',
        label: '학급 발자국',
        icon: '👣',
        defaultTab: 'footprints',
        tabs: [{ id: 'footprints', label: '학급 발자국' }]
    },
    {
        id: 'tools',
        label: '수업 도구',
        icon: '🧰',
        defaultTab: 'tools',
        tabs: [{ id: 'tools', label: '수업 도구' }]
    },
    {
        id: 'settings',
        label: '설정',
        icon: '⚙️',
        defaultTab: 'settings',
        // 학급 자체 관리와 서비스 설정은 한 화면에서 관리한다.
        // 학생 명단은 자주 쓰는 업무이므로 학생 메뉴에 그대로 둔다.
        tabs: [{ id: 'settings', label: '통합 설정' }]
    }
];

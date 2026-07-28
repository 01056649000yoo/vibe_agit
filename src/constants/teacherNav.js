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
        // 좌측 메뉴로 나뉘어 있던 셋을 한 화면에 모았다(2026-07-28).
        // 학급 자체를 만들고 지우는 일은 성격이 달라 설정 > 학급 관리로 옮겼다.
        innerShape: 'stack',
        innerItems: ['요약 띠 (학생·오늘·최근 7일·평균 글자)', '학생 명단', '최근 활동', '학급 분석 (접힘)'],
        innerNote: '한 화면에 위아래로 놓입니다. 명단과 최근 활동은 좌우 2단, 분석은 눌러서 폅니다.'
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
        // 화면 안이 카드로 구성된다 (GameManager).
        // 켜고 끄는 버튼은 별도 화면이 아니라 각 카드 머리에 붙어 있다.
        innerShape: 'cards',
        innerItems: ['드래곤 키우기 관리', '어휘의 탑 관리'],
        innerNote: '각 카드 머리의 "학생 화면 ON/OFF" 버튼으로 켜고 끕니다.'
    },
    {
        id: 'settings',
        label: '설정',
        icon: '⚙️',
        defaultTab: 'settings',
        tabs: [
            // 맨 앞은 defaultTab 과 같아야 한다. 설정을 누르면 여기로 들어온다.
            { id: 'settings', label: '관리 설정' },
            // 학급을 새로 만들고 지우고 되살리는 곳. 학기 초에 몇 번 쓰는 일이라
            // 매일 보는 학생 화면이 아니라 설정에 둔다. 학급 전환은 상단 드롭다운.
            { id: 'classes', label: '학급 관리' },
            { id: 'guide', label: '사용 안내' }
        ]
    }
];

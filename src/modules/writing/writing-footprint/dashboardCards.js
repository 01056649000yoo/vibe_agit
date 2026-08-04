export const CLASS_FOOTPRINT_CARDS = [
    {
        id: 'participating-students', section: 'summary', renderer: 'stat', order: 10,
        icon: '👥', label: '참여 학생', accent: '#1D4ED8',
        metric: { type: 'ratio', numeratorPath: 'totals.active_students', denominatorPath: 'totals.total_students', unit: '명' }
    },
    {
        id: 'completed-posts', section: 'summary', renderer: 'stat', order: 20,
        icon: '📝', label: '완료 글', metric: { path: 'totals.total_posts', unit: '편' }
    },
    {
        id: 'total-characters', section: 'summary', renderer: 'stat', order: 30,
        icon: '✍️', label: '쓴 글자', metric: { path: 'totals.total_chars', unit: '자' }
    },
    {
        id: 'posts-per-student', section: 'summary', renderer: 'stat', order: 40,
        icon: '📊', label: '학생당 평균', metric: { path: 'totals.avg_posts_per_student', unit: '편' }
    },
    {
        id: 'characters-per-post', section: 'summary', renderer: 'stat', order: 50,
        icon: '📏', label: '한 편 평균', metric: { path: 'totals.avg_chars_per_post', unit: '자' }
    },
    {
        id: 'friend-interactions', section: 'summary', renderer: 'stat', order: 60,
        icon: '💬', label: '친구 교류', metric: { type: 'sum', paths: ['totals.comments', 'totals.reactions'], unit: '회' }
    },
    {
        id: 'calendar', section: 'visualization', renderer: 'calendar', order: 10,
        title: '🔥 학급 글쓰기 달력',
        hint: '학급 전체가 쓴 날을 합쳐, 활동이 많았던 날을 진하게 표시합니다.',
        modalHint: '학급 전체가 글을 쓴 날을 합쳐 활동이 많았던 날을 진하게 표시합니다.',
        rowsPath: 'detail.daily', schoolYearPath: 'detail.school_year',
        surfaces: ['default', 'fullscreen', 'modal']
    },
    {
        id: 'monthly-posts', section: 'visualization', renderer: 'monthly-bars', order: 20,
        title: '📈 달마다 완료한 글',
        hint: '승인된 글을 기준으로 월별 학급 활동량을 봅니다.',
        modalHint: '승인된 과제와 제출 완료한 독서록을 기준으로 월별 학급 활동량을 봅니다.',
        rowsPath: 'months', valueKey: 'posts', unit: '편',
        surfaces: ['default', 'fullscreen', 'modal']
    },
    {
        id: 'average-characters', section: 'visualization', renderer: 'trend-line', order: 30,
        title: '✍️ 글 길이 변화',
        hint: '월별로 글 한 편의 평균 글자 수가 어떻게 달라졌는지 봅니다.',
        rowsPath: 'months', valueKey: 'avg_chars', unit: '자',
        surfaces: ['default', 'fullscreen', 'modal']
    },
    {
        id: 'point-flow', section: 'visualization', renderer: 'point-flow', order: 40,
        title: '💰 학급 포인트 흐름',
        hint: '학급에서 모은 포인트에서 사용·조정된 포인트를 뺀 누적 흐름입니다.',
        rowsPath: 'cumulativePoints', valueKey: 'total', unit: 'P',
        earnedPath: 'totals.points_earned', usedPath: 'totals.points_used',
        surfaces: ['default', 'fullscreen', 'modal']
    },
    {
        id: 'point-sources', section: 'visualization', renderer: 'point-types', order: 50,
        title: '🎁 포인트 획득처',
        hint: '이번 학년도에 학급이 포인트를 모은 활동입니다.',
        modalHint: '이번 학년도에 학급이 어떤 활동으로 포인트를 모았는지 보여줍니다.',
        rowsPath: 'detail.points_by_type', emptyMessage: '아직 모은 포인트가 없습니다.',
        surfaces: ['default', 'fullscreen', 'modal']
    },
    {
        id: 'point-spending', section: 'visualization', renderer: 'point-types', order: 60,
        title: '🛍️ 포인트 사용처',
        hint: '학생이 직접 선택해 사용한 포인트만 표시합니다.',
        modalHint: '학생이 직접 선택해 사용한 포인트를 활동 종류별로 보여줍니다.',
        rowsPath: 'detail.spending_by_type', emptyMessage: '아직 사용한 포인트가 없습니다.', color: '#F59E0B',
        surfaces: ['default', 'fullscreen', 'modal']
    }
];


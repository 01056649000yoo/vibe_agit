/**
 * 학생 자율 글쓰기의 두 번째 모듈: 일기.
 *
 * 독서록을 복사하지 않았다. 독서록 부피의 절반 이상이 책 카탈로그·내 서재·책 기준 초안이라
 * 일기에는 버릴 코드다. 공용 층(글쓰기 작업대·정책·보상 원장·모듈 레지스트리)에 유형만 하나 더 얹는다.
 *
 * 축이 다르다 — 독서록은 `책 한 권에 하나`, 일기는 **`하루에 하나`** 다.
 * 공개 기본값도 반대다. 일기는 개인적인 글이라 기본 비공개이고 학생이 원할 때만 친구에게 연다.
 */
export const diaryManifest = {
    id: 'diary',
    name: '나의 일기',
    description: '기록할 날짜를 고르고 그날 있었던 일과 내 마음을 한 편씩 남기기',
    icon: '📔',
    part: 'writing',
    audience: 'student',
    core: true,
    performance: { home: 'summary', load: 'on-open', writes: 'rpc', realtime: 'core-only', maxInitialRows: 50 },
    studentRoute: 'diaries',
    communityFeed: {
        group: 'self',
        label: '일기',
        icon: '📔',
        description: '친구에게 공개한 우리 반 일기',
        emptyMessage: '아직 친구에게 공개된 일기가 없어요.',
        order: 20,
    },
    writingPolicy: {
        type: 'diary',
        completionFlow: 'student_complete',
        defaults: {
            min_chars: 150,
            min_paragraphs: 1,
            base_reward: 80,
            bonus_enabled: false,
            bonus_threshold: 0,
            bonus_reward: 0,
            daily_reward_limit: 1
        }
    },
    notifications: [
        {
            eventType: 'diary.review_completed',
            icon: '✅',
            tone: 'positive',
            title: '일기를 확인했어요',
            message: (payload) => `선생님이 ‘${payload.post_title || '내 일기'}’를 확인했어요.`,
            action: 'post',
            actionLabel: '내 일기 확인하기'
        },
        {
            eventType: 'diary.revision_requested',
            icon: '✏️',
            tone: 'rewrite',
            title: '일기를 조금 더 살펴봐 주세요',
            message: (payload) => payload.has_comment
                ? `선생님이 ‘${payload.post_title || '내 일기'}’에 보완할 내용을 남겼어요.`
                : `선생님이 ‘${payload.post_title || '내 일기'}’의 보완을 요청했어요.`,
            action: 'post',
            actionLabel: '선생님 의견 보기'
        }
    ],
    studentEntry: () => import('./DiaryPage'),
    teacherEntry: () => import('./teacher/TeacherDiaryManager')
};

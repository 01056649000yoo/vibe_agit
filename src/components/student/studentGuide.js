/**
 * 학생 홈 전체 사용법의 단일 원본.
 *
 * 하단 메뉴로 갈 수 있는 항목은 route 이름을 다시 적지 않고 tabId만 가리킨다.
 * 실제 pageName/overlay 연결은 studentNavigation.js가 결정한다.
 */
export const STUDENT_GUIDE_SECTIONS = Object.freeze([
    Object.freeze({
        id: 'writing',
        title: '글을 써요',
        description: '과제도 쓰고, 내 생각도 자유롭게 남길 수 있어요.',
        items: Object.freeze([
            Object.freeze({
                id: 'missions', icon: '📝', title: '과제 글쓰기',
                description: '선생님이 낸 글을 확인하고 써요. 다 쓰면 제출해요.',
                ctaLabel: '과제 보기', destination: Object.freeze({ type: 'tab', tabId: 'mission_list' })
            }),
            Object.freeze({
                id: 'reading-logs', icon: '📚', title: '독서록',
                description: '읽은 책에서 기억에 남은 점과 내 생각을 적어요.',
                ctaLabel: '독서록 쓰기', destination: Object.freeze({ type: 'tab', tabId: 'reading_logs' })
            }),
            Object.freeze({
                id: 'diaries', icon: '📔', title: '일기',
                description: '오늘 있었던 일과 내 마음을 적어요. 처음에는 나만 볼 수 있어요.',
                ctaLabel: '일기 쓰기', destination: Object.freeze({ type: 'route', pageName: 'diaries' })
            })
        ])
    }),
    Object.freeze({
        id: 'agit',
        title: '아지트를 둘러봐요',
        description: '내가 쓴 글을 모아 보고 친구의 공개 글도 읽어 보세요.',
        items: Object.freeze([
            Object.freeze({
                id: 'my-agit', icon: '🏡', title: '나의 아지트',
                description: '내 글, 칭호, 수호룡과 독서 기록을 한곳에서 봐요.',
                ctaLabel: '내 아지트 보기', destination: Object.freeze({ type: 'tab', tabId: 'my_agit' })
            }),
            Object.freeze({
                id: 'friends-hideout', icon: '👀', title: '친구 아지트',
                description: '친구가 공개한 글을 읽고 따뜻한 반응이나 댓글을 남겨요.',
                ctaLabel: '친구 글 보기', destination: Object.freeze({ type: 'tab', tabId: 'friends_hideout' })
            }),
            Object.freeze({
                id: 'playground', icon: '🎡', title: '아지트 놀이터',
                description: '어휘의 탑과 수호룡처럼 선생님이 열어 준 활동을 골라 해요.',
                ctaLabel: '놀이터 가기', destination: Object.freeze({ type: 'tab', tabId: 'playground' })
            })
        ])
    }),
    Object.freeze({
        id: 'news',
        title: '내 소식을 확인해요',
        description: '선생님과 친구가 남긴 소식, 내가 걸어온 기록을 확인해요.',
        items: Object.freeze([
            Object.freeze({
                id: 'feedback', icon: '🔔', title: '내 글 소식',
                description: '내 글에 온 선생님 의견, 친구 반응과 댓글을 확인해요.',
                ctaLabel: '소식 보기', destination: Object.freeze({ type: 'dashboard-action', action: 'feedback' })
            }),
            Object.freeze({
                id: 'activity', icon: '🏅', title: '활동 알림',
                description: '글 승인, 포인트, 칭호처럼 내가 한 활동의 새 소식을 봐요.',
                ctaLabel: '알림 보기', destination: Object.freeze({ type: 'dashboard-action', action: 'activity' })
            }),
            Object.freeze({
                id: 'footprint', icon: '👣', title: '글쓰기 발자국',
                description: '내가 쓴 글과 활동이 얼마나 쌓였는지 살펴봐요.',
                ctaLabel: '발자국 보기', destination: Object.freeze({ type: 'dashboard-action', action: 'footprint' })
            })
        ])
    })
]);

export const STUDENT_GUIDE_ITEMS = Object.freeze(
    STUDENT_GUIDE_SECTIONS.flatMap((section) => section.items)
);

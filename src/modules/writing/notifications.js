export const writingNotificationDefinitions = Object.freeze([
    {
        eventType: 'writing.rewrite_requested',
        icon: '♻️',
        tone: 'rewrite',
        title: '다시쓰기 요청이 왔어요',
        message: (payload) => `‘${payload.mission_title || payload.post_title || '과제 글'}’을 다시 살펴봐 주세요.`,
        action: 'rewrite',
        actionLabel: '고치러 가기'
    },
    {
        eventType: 'writing.approved',
        icon: '🎉',
        tone: 'positive',
        title: '글이 승인되었어요',
        message: (payload) => {
            const points = Number(payload.point_delta || 0);
            const reward = points > 0 ? ` ${points}P도 받았어요!` : '';
            return `‘${payload.post_title || payload.mission_title || '과제 글'}’이 승인되었어요.${reward}`;
        },
        action: 'post',
        actionLabel: '내 글 확인하기'
    },
    {
        eventType: 'writing.approval_recovered',
        icon: '↩️',
        tone: 'warning',
        title: '글 승인이 취소되었어요',
        message: (payload) => {
            const points = Math.abs(Number(payload.point_delta || 0));
            const recovery = points > 0 ? ` 지급됐던 ${points}P가 회수되었어요.` : '';
            return `‘${payload.post_title || payload.mission_title || '과제 글'}’의 승인 상태가 바뀌었어요.${recovery}`;
        },
        action: 'post',
        actionLabel: '내 글 확인하기'
    }
]);

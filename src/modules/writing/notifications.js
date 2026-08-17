import { getReactionOption } from './reactions/registry';

// 내 글 소식 갈래(module_id = 'feedback'). 친구 반응·친구/선생님 댓글은 글쓰기 모듈이
// 소유하므로 표시 문구도 여기서 정한다. 누르면 친구 아지트의 그 글로 이동한다.
export const feedbackNotificationDefinitions = Object.freeze([
    {
        eventType: 'feedback.reaction_received',
        icon: '💛',
        tone: 'positive',
        title: '친구가 반응을 남겼어요',
        message: (payload) => {
            const option = getReactionOption(payload.reaction_type);
            return `${payload.actor_name || '친구'} 친구가 ‘${payload.post_title || '내 글'}’에 ${option.emoji} ${option.label} 반응을 남겼어요.`;
        },
        action: 'post',
        actionLabel: '확인'
    },
    {
        eventType: 'feedback.comment_received',
        icon: '💬',
        tone: 'default',
        title: '새 댓글이 달렸어요',
        message: (payload) => {
            const writer = payload.is_teacher ? '🍎 선생님' : `${payload.actor_name || '친구'} 친구`;
            const excerpt = payload.excerpt ? ` “${payload.excerpt}”` : '';
            return `${writer}이 ‘${payload.post_title || '내 글'}’에 댓글을 남겼어요.${excerpt}`;
        },
        action: 'post',
        actionLabel: '확인'
    }
]);

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

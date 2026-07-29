import { countContentChars } from '../lib/textMetrics.js';

/**
 * 작가 레벨.
 *
 * 대시보드 훅과 발자국 화면이 같은 정의를 보도록 한 곳에 둔다.
 * (예전에는 훅 안에만 있어서, 다른 화면에서 레벨을 보여 주려면 계산을 베껴야 했다.)
 *
 * ⚠️ 지금 기준은 **누적 글자 수 하나**다. 길게 쓰기만 하면 오르고,
 * 꾸준히 쓴 날·고쳐 쓰기·친구와 나눈 기록은 레벨에 반영되지 않는다.
 * 개선 계획은 WORKLOG "작가 레벨 개편 계획" 항목 참고.
 */
export const WRITER_LEVELS = [
    { level: 1, name: '새싹 작가', emoji: '🌱', from: 0 },
    { level: 2, name: '초보 작가', emoji: '🌿', from: 1401 },
    { level: 3, name: '숙련 작가', emoji: '🌳', from: 4201 },
    { level: 4, name: '대문호', emoji: '👑', from: 8401 },
    { level: 5, name: '전설의 작가', emoji: '✨', from: 14001 }
];

/**
 * @param {number} totalChars 누적 글자 수
 * @returns {{level:number, name:string, emoji:string, from:number, next:number|null}}
 */
export const getWriterLevel = (totalChars = 0) => {
    const chars = Number(totalChars) || 0;
    const index = WRITER_LEVELS.reduce(
        (found, item, i) => (chars >= item.from ? i : found),
        0
    );
    const current = WRITER_LEVELS.at(index);
    const upcoming = WRITER_LEVELS.at(index + 1);
    return { ...current, next: upcoming ? upcoming.from : null };
};

/**
 * 독자 칭호.
 * 친구 글을 여러 편 읽고 반응하거나 정성스러운 댓글을 남기는 행동을 인정한다.
 * 등수·포인트 보상과는 연결하지 않고 자기 성장 표시로만 사용한다.
 */
export const READER_LEVELS = [
    { level: 1, name: '조용한 독자', emoji: '👀', from: 0 },
    { level: 2, name: '첫 독자', emoji: '📖', from: 1 },
    { level: 3, name: '이야기 친구', emoji: '💬', from: 3 },
    { level: 4, name: '단짝 독자', emoji: '🤝', from: 8 },
    { level: 5, name: '든든한 독자', emoji: '🌟', from: 20 },
    { level: 6, name: '열혈 독자', emoji: '🏅', from: 45 },
    { level: 7, name: '아지트 지킴이', emoji: '💎', from: 90 }
];

export const getReaderLevel = (score = 0) => {
    const safeScore = Math.max(0, Number(score) || 0);
    const index = READER_LEVELS.reduce(
        (found, item, i) => (safeScore >= item.from ? i : found),
        0
    );
    const current = READER_LEVELS.at(index);
    const upcoming = READER_LEVELS.at(index + 1);
    return { ...current, next: upcoming ? upcoming.from : null };
};

/**
 * 서로 다른 친구 글마다 기본 1점 + 그 글에 남긴 댓글 20자당 1점(최대 3점).
 * 반응과 댓글을 둘 다 남겨도 기본점은 한 번만 센다.
 */
export const calculateReaderScore = ({ comments = [], reactions = [], ownPostIds = [] } = {}) => {
    const ownPosts = new Set(ownPostIds);
    const activityByPost = new Map();

    reactions.forEach((reaction) => {
        if (!reaction?.post_id || ownPosts.has(reaction.post_id)) return;
        if (!activityByPost.has(reaction.post_id)) {
            activityByPost.set(reaction.post_id, { commentChars: 0 });
        }
    });

    comments.forEach((comment) => {
        if (!comment?.post_id || ownPosts.has(comment.post_id)) return;
        const current = activityByPost.get(comment.post_id) || { commentChars: 0 };
        current.commentChars += countContentChars(comment.content || '');
        activityByPost.set(comment.post_id, current);
    });

    let score = 0;
    activityByPost.forEach(({ commentChars }) => {
        score += 1 + Math.min(Math.floor(commentChars / 20), 3);
    });

    return { score, postCount: activityByPost.size };
};

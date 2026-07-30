import { countContentChars } from '../lib/textMetrics.js';

/**
 * 작가 레벨.
 *
 * 대시보드 훅과 발자국 화면이 같은 정의를 보도록 한 곳에 둔다.
 * (예전에는 훅 안에만 있어서, 다른 화면에서 레벨을 보여 주려면 계산을 베껴야 했다.)
 *
 * 첫 단계는 승인 글 1편 완성, 그 다음부터는 누적 글자 수로 오른다.
 * 등수·포인트 보상과는 연결하지 않고 자기 성장 표시로만 쓴다.
 */
export const WRITER_LEVELS = [
    { level: 1, name: '새싹 작가', emoji: '🌱', from: 0, criterion: 'chars' },
    { level: 2, name: '첫걸음 작가', emoji: '✏️', from: 1, criterion: 'posts' },
    { level: 3, name: '연필 작가', emoji: '📝', from: 300, criterion: 'chars' },
    { level: 4, name: '이야기 작가', emoji: '📖', from: 700, criterion: 'chars' },
    { level: 5, name: '초보 작가', emoji: '🪶', from: 1400, criterion: 'chars' },
    { level: 6, name: '꾸준한 작가', emoji: '🔥', from: 2500, criterion: 'chars' },
    { level: 7, name: '숙련 작가', emoji: '🌳', from: 4200, criterion: 'chars' },
    { level: 8, name: '대문호', emoji: '👑', from: 8400, criterion: 'chars' },
    { level: 9, name: '빛나는 작가', emoji: '💫', from: 12000, criterion: 'chars' },
    { level: 10, name: '전설의 작가', emoji: '✨', from: 20000, criterion: 'chars' }
];

/**
 * 작가 레벨이 세는 글 묶음.
 *
 * **과제글은 미션별 한 편(가장 최근 것), 자율글은 각 글을 한 편**으로 센다.
 * 재작성으로 같은 미션에 승인 글이 여러 편 쌓여도 누적 글자가 부풀지 않게 하려는 규칙이다.
 *
 * SQL 쪽 짝은 `get_my_writing_footprint_detail` 의 `level_posts` CTE다.
 * 한쪽만 고치면 **같은 학생이 나의 아지트와 발자국에서 다른 칭호를 본다**
 * (실제로 그랬다 — 발자국은 중복 제거 없이 전부 합산하고 있었다).
 *
 * @param {Array<{id:string, mission_id:string|null, char_count:number|null, created_at:string}>} posts 승인된 글
 * @returns {{totalChars:number, completedPosts:number, completedMissions:number}}
 */
export const collectWriterPosts = (posts = []) => {
    // 호출처의 정렬에 기대지 않는다. 미션별로 어떤 글이 남는지가 합계를 바꾼다.
    const newestFirst = [...posts].sort(
        (a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0)
    );

    const byKey = new Map();
    newestFirst.forEach((post) => {
        if (!post) return;
        const key = post.mission_id ? `mission:${post.mission_id}` : `post:${post.id}`;
        if (!byKey.has(key)) byKey.set(key, post);
    });

    const kept = Array.from(byKey.values());
    return {
        totalChars: kept.reduce((sum, post) => sum + (Number(post.char_count) || 0), 0),
        completedPosts: kept.length,
        completedMissions: new Set(kept.map((post) => post.mission_id).filter(Boolean)).size
    };
};

/**
 * @param {number} totalChars 누적 글자 수 (`collectWriterPosts` 규칙으로 센 값)
 * @param {number} completedPosts 승인 글 수 — 미션 수가 아니다. 자율글도 한 편으로 센다.
 * @returns {{level:number, name:string, emoji:string, from:number, next:number|null, nextUnit:string, progressValue:number, progressFrom:number}}
 */
export const getWriterLevel = (totalChars = 0, completedPosts = 0) => {
    const chars = Math.max(0, Number(totalChars) || 0);
    // 기존 호출처가 글 수를 아직 넘기지 않아도 승인 글에서 나온
    // 누적 글자가 있다면 최소 1편을 쓴 것으로 하위 호환한다.
    const posts = Math.max(0, Number(completedPosts) || 0, chars > 0 ? 1 : 0);
    const index = WRITER_LEVELS.reduce(
        (found, item, i) => {
            const value = item.criterion === 'posts' ? posts : chars;
            return value >= item.from ? i : found;
        },
        0
    );
    const current = WRITER_LEVELS.at(index);
    const upcoming = WRITER_LEVELS.at(index + 1);
    const progressUsesPosts = upcoming?.criterion === 'posts';
    const progressValue = progressUsesPosts ? posts : chars;
    const progressFrom = upcoming
        ? (progressUsesPosts ? 0 : (current.criterion === 'chars' ? current.from : 0))
        : current.from;

    return {
        ...current,
        next: upcoming ? upcoming.from : null,
        nextUnit: progressUsesPosts ? '편' : '자',
        progressValue,
        progressFrom
    };
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

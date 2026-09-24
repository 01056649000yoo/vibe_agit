/**
 * 글을 주제(과제·활동 이름)별로 묶는다. 최근에 글이 올라온 주제가 앞에 온다. 주제가 없으면 '자율 글'.
 * 학생 반별 이웃 글 마당과 교사 ③ 댓글·반응이 같은 묶음 규칙을 쓴다.
 * @param {Array<{topic?: string, published_at?: string}>} posts
 * @returns {Array<{topic: string, posts: Array}>}
 */
export function groupByTopic(posts = []) {
    const groups = new Map();
    for (const post of posts) {
        const topic = (post.topic || '').trim() || '자율 글';
        if (!groups.has(topic)) groups.set(topic, []);
        groups.get(topic).push(post);
    }
    const latest = (items) => items.reduce((max, item) => (item.published_at > max ? item.published_at : max), '');
    return [...groups.entries()]
        .map(([topic, items]) => ({ topic, posts: items }))
        .sort((a, b) => latest(b.posts).localeCompare(latest(a.posts)) || a.topic.localeCompare(b.topic, 'ko'));
}

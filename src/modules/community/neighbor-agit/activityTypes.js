/** 교사·학생 모두의 아지트 화면이 함께 쓰는 활동 이름과 표시 순서.
 *  2026-09-06에 글짝 교환 활동을 제품에서 뺐다(SQL 61254).
 *  2026-09-23에 📚 문집 나눔을 더했다(SQL 20261335) — 글 한 편이 아니라 확정한 학급 문집을 소개하고 방문록을 받는다. */
export const NEIGHBOR_ACTIVITY_TABS = Object.freeze([
    Object.freeze({ id: 'gallery', icon: '🖼️', label: '글 나눔 공간' }),
    Object.freeze({ id: 'topic', icon: '✍️', label: '함께 쓰는 주제' }),
    Object.freeze({ id: 'books', icon: '📚', label: '문집 나눔' })
]);

export const getNeighborActivityLabel = (activityId) => (
    NEIGHBOR_ACTIVITY_TABS.find(({ id }) => id === activityId)?.label || ''
);

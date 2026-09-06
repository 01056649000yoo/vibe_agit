/** 교사·학생 이웃 아지트 화면이 함께 쓰는 활동 이름과 표시 순서.
 *  2026-09-06에 글짝 교환 활동을 제품에서 뺐다(SQL 61254). 남은 것은 이 둘뿐이다. */
export const NEIGHBOR_ACTIVITY_TABS = Object.freeze([
    Object.freeze({ id: 'gallery', icon: '🖼️', label: '글 나눔 공간' }),
    Object.freeze({ id: 'topic', icon: '✍️', label: '함께 쓰는 주제' })
]);

export const getNeighborActivityLabel = (activityId) => (
    NEIGHBOR_ACTIVITY_TABS.find(({ id }) => id === activityId)?.label || ''
);

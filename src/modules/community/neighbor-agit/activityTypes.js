/** 교사·학생 모두의 아지트 화면이 함께 쓰는 공간 이름·소개와 표시 순서. 공간 목록의 원본은 여기 하나다.
 *  2026-09-06에 글짝 교환 활동을 제품에서 뺐다(SQL 61254).
 *  2026-09-23에 📚 문집 나눔을 더했다(SQL 20261335) — 글 한 편이 아니라 확정한 학급 문집을 소개하고 방문록을 받는다.
 *  2026-09-23: 세 공간이 "필터" 가 아니라 "따로 있는 방" 으로 보이게, 공간마다 색(spaces.css 의 data-space)과
 *  한 줄 소개를 둔다. 새 공간을 더할 때는 여기 한 줄 + spaces.css 에 색 한 벌이면 두 화면에 모두 나타난다. */
export const NEIGHBOR_ACTIVITY_TABS = Object.freeze([
    Object.freeze({
        id: 'gallery', icon: '🖼️', label: '글 나눔 공간',
        studentSummary: '이웃 반 친구들의 글을 읽고 댓글을 남겨요',
        teacherSummary: '우리 반 글을 골라 이웃 반에 소개해요'
    }),
    Object.freeze({
        id: 'topic', icon: '✍️', label: '함께 쓰는 주제',
        studentSummary: '같은 주제로 여러 반이 함께 쓰고 읽어요',
        teacherSummary: '선생님들이 함께 정한 주제로 모든 반이 써요'
    }),
    Object.freeze({
        id: 'books', icon: '📚', label: '문집 나눔',
        studentSummary: '반마다 만든 문집을 읽고 방문록을 남겨요',
        teacherSummary: '우리 반 문집을 소개하고 방문록을 확인해요'
    })
]);

export const getNeighborActivityLabel = (activityId) => (
    NEIGHBOR_ACTIVITY_TABS.find(({ id }) => id === activityId)?.label || ''
);

export const getNeighborSpace = (activityId) => NEIGHBOR_ACTIVITY_TABS.find(({ id }) => id === activityId) || null;

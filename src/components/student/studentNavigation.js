/**
 * 학생 메뉴·활성 탭·뒤로가기·방문 기록의 단일 원본.
 * 새 메뉴나 하위 화면을 추가하기 전에 같은 폴더의 README.md 계약을 따른다.
 */
export const STUDENT_HOME_ROUTE = Object.freeze({ name: 'main', params: Object.freeze({}) });

export const STUDENT_BOTTOM_NAV_TABS = Object.freeze([
    Object.freeze({ id: 'main', label: '홈', icon: '🏠', pageName: 'main' }),
    Object.freeze({ id: 'mission_list', label: '과제', icon: '📝', pageName: 'mission_list' }),
    Object.freeze({ id: 'reading_logs', label: '독서록', icon: '📚', pageName: 'reading_logs' }),
    Object.freeze({ id: 'my_agit', label: '나의 아지트', icon: '🏡', pageName: 'main', overlay: 'my_agit' }),
    Object.freeze({ id: 'playground', label: '아지트 놀이터', icon: '🎡', pageName: 'main', overlay: 'playground' }),
    Object.freeze({ id: 'friends_hideout', label: '친구 아지트', icon: '👀', pageName: 'friends_hideout' })
]);

const BOTTOM_NAV_BY_ID = new Map(STUDENT_BOTTOM_NAV_TABS.map((tab) => [tab.id, tab]));

const normalizeParams = (params) => (
    params && typeof params === 'object' && !Array.isArray(params) ? params : {}
);

export const getStudentBottomNavDestination = (tabId) => {
    const tab = BOTTOM_NAV_BY_ID.get(tabId) || BOTTOM_NAV_BY_ID.get('main');
    return {
        pageName: tab.pageName,
        params: {},
        overlay: tab.overlay || null
    };
};

export const getStudentActiveBottomTab = (pageName, overlay = null) => {
    if (overlay && BOTTOM_NAV_BY_ID.has(overlay)) return overlay;
    if (pageName === 'writing') return 'mission_list';
    return BOTTOM_NAV_BY_ID.has(pageName) ? pageName : null;
};

export const getStudentBackDestination = ({ name, params = {} } = STUDENT_HOME_ROUTE) => {
    if (name === 'writing' && params?.returnTo === 'neighbor_agit') {
        return { name: 'neighbor_agit', params: {} };
    }
    if (name === 'writing') return { name: 'mission_list', params: {} };
    if (name === 'friends_hideout' && params?.returnTo === 'mission_list') {
        return { name: 'mission_list', params: {} };
    }
    return { name: 'main', params: {} };
};

export const createStudentHistoryState = (name, params = {}, parent = null) => ({
    studentPage: name || 'main',
    studentParams: normalizeParams(params),
    ...(parent ? {
        studentParent: {
            studentPage: parent.name || 'main',
            studentParams: normalizeParams(parent.params)
        }
    } : {})
});

export const readStudentHistoryState = (state) => ({
    name: state?.studentPage || 'main',
    params: normalizeParams(state?.studentParams)
});

export const readStudentHistoryParent = (state) => (
    state?.studentParent ? readStudentHistoryState(state.studentParent) : null
);

export const getStudentRouteKey = ({ name, params = {} } = STUDENT_HOME_ROUTE) => (
    `${name || 'main'}:${JSON.stringify(normalizeParams(params))}`
);

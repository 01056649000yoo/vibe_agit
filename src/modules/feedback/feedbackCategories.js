/*
 * 제보 종류의 원본. 화면과 관리자 목록이 이 파일 하나를 함께 읽는다.
 *
 * 왜 종류를 먼저 고르게 하나:
 *   예전에는 제목·내용 두 칸이 백지였다. 낱말 하나 틀린 것을 알리려 해도 제목을 지어내고
 *   상황을 글로 써야 해서, 선생님 203명 중 아무도 보내지 않았다(2026-08-21 기준 0건).
 *   종류를 먼저 고르면 물어볼 것이 정해지고, 제목은 앱이 만들어 준다.
 *
 * `correction` 을 맨 앞에 두는 이유:
 *   어휘·맞춤법 자료가 수백 개라 선생님이 가장 많이 발견하는 것이 내용 오류이고,
 *   그 제보가 관리자 `📚 검수` 화면으로 바로 이어진다.
 */

export const FEEDBACK_CATEGORIES = Object.freeze([
    {
        id: 'correction',
        icon: '✏️',
        label: '내용이 틀렸어요',
        hint: '낱말 뜻·맞춤법·예문이 잘못됐을 때',
        // 이 종류만 칸이 다르다. 어디서 봤는지 · 틀린 것 · 맞는 것을 나눠 받는다.
        shape: 'correction'
    },
    {
        id: 'bug',
        icon: '🐞',
        label: '오류가 나요',
        hint: '눌러도 안 되거나 화면이 이상할 때',
        shape: 'bug'
    },
    {
        id: 'idea',
        icon: '💡',
        label: '이런 게 있으면 좋겠어요',
        hint: '있었으면 하는 기능',
        shape: 'free'
    },
    {
        id: 'howto',
        icon: '❓',
        label: '사용법을 모르겠어요',
        hint: '어떻게 하는지 물어보기',
        shape: 'free'
    }
]);

export const FEEDBACK_CATEGORY_MAP = Object.freeze(
    Object.fromEntries(FEEDBACK_CATEGORIES.map((item) => [item.id, item]))
);

// 옛 제보(종류 없이 들어온 것)도 목록에서 이름이 비지 않게 한다.
export const describeFeedbackCategory = (id) => Reflect.get(FEEDBACK_CATEGORY_MAP, id)
    || { id: 'other', icon: '📝', label: '기타', hint: '' };

/** 내용 정정 제보에서 "어디서 봤는지" 고르는 곳. */
export const CORRECTION_PLACES = Object.freeze([
    '어휘의 탑',
    '맞춤법 찾아보기',
    '글쓰기 연구소',
    '독서록·일기',
    '학생 홈·아지트',
    '교사 화면',
    '그 밖'
]);

export const FEEDBACK_STATUSES = Object.freeze({
    open: { label: '접수됨', tone: 'open' },
    in_progress: { label: '확인 중', tone: 'progress' },
    done: { label: '처리 완료', tone: 'done' }
});

export const describeFeedbackStatus = (status) => Reflect.get(FEEDBACK_STATUSES, status)
    || { label: status || '접수됨', tone: 'open' };

/*
 * 제목은 선생님이 짓지 않는다 — 고른 종류와 쓴 내용으로 앱이 만든다.
 * 제목을 지어내는 일이 제보를 포기하게 만드는 가장 큰 턱이었다.
 * 서버는 2~120자를 요구하므로 짧으면 종류 이름으로 채우고 길면 자른다.
 */
export const buildFeedbackTitle = (categoryId, fields = {}) => {
    const category = describeFeedbackCategory(categoryId);
    const gist = (
        categoryId === 'correction' ? `${fields.place || ''} ${fields.wrong || ''}`
            : categoryId === 'bug' ? fields.tried || ''
                : fields.title || ''
    ).replace(/\s+/g, ' ').trim();

    const base = gist ? `[${category.label}] ${gist}` : `[${category.label}]`;
    return base.length > 120 ? `${base.slice(0, 117)}...` : base;
};

/** 종류별로 나눠 받은 칸을 하나의 본문으로 합친다. 관리자가 읽을 형태다. */
export const buildFeedbackContent = (categoryId, fields = {}) => {
    if (categoryId === 'correction') {
        return [
            `[어디서] ${fields.place || '(고르지 않음)'}`,
            `[틀린 내용] ${fields.wrong || ''}`,
            `[맞는 내용] ${fields.right || ''}`,
            fields.note ? `[덧붙임] ${fields.note}` : ''
        ].filter(Boolean).join('\n');
    }
    if (categoryId === 'bug') {
        return [
            `[무엇을 하려다] ${fields.tried || ''}`,
            `[어떻게 됐나] ${fields.happened || ''}`,
            fields.note ? `[덧붙임] ${fields.note}` : ''
        ].filter(Boolean).join('\n');
    }
    return fields.content || '';
};

/*
 * 어느 화면·어느 기기에서 겪은 일인지 앱이 스스로 담는다.
 * 선생님이 적지 않아도 관리자가 다시 물어볼 일이 없어야 한다.
 * ⚠️ 학생 이름·학급 이름 같은 개인정보는 절대 담지 않는다. 서버도 2000자까지만 받는다.
 */
export const buildFeedbackContext = (extra = {}) => {
    if (typeof window === 'undefined') return {};
    return {
        screen: `${window.location?.pathname || ''}${window.location?.hash || ''}`.slice(0, 200),
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        ua: String(window.navigator?.userAgent || '').slice(0, 300),
        at: new Date().toISOString(),
        ...extra
    };
};

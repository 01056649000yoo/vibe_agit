export const SPELLING_LOOKUP_OPEN_EVENT = 'agit:spelling-lookup-open';

/**
 * 맞춤법 수첩을 열어 달라고 알린다.
 *
 * `correction` 을 함께 주면 수첩이 "무엇을 무엇으로 고치면 되는지"를 먼저 보여 준다.
 * 사전 검색은 학생이 쓴 틀린 말이 아니라 `correction.lookup`(표제어)으로 한다 —
 * 틀린 말은 사전에 없으니 그대로 찾으면 늘 빈손으로 돌아온다.
 */
export const openSpellingLookup = (query = '', correction = null) => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(SPELLING_LOOKUP_OPEN_EVENT, {
        detail: {
            query: String(query || '').trim(),
            correction: correction && {
                wrong: correction.wrong || '',
                right: correction.right || '',
                lookup: String(correction.lookup || correction.right || '').trim()
            }
        }
    }));
};

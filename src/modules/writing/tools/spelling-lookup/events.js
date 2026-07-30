export const SPELLING_LOOKUP_OPEN_EVENT = 'agit:spelling-lookup-open';

export const openSpellingLookup = (query = '') => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(SPELLING_LOOKUP_OPEN_EVENT, {
        detail: { query: String(query || '').trim() }
    }));
};

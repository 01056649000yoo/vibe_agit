const exhibitionId = (value) => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value) ? value : null;
const workId = (value) => typeof value === 'string' && /^published-([1-9]|[1-5][0-9]|60)$/.test(value) ? value : null;

// 방문 기록에는 작은 주소만 둔다. 전문·학생 식별자·DOM·함수는 넣지 않는다.
export function normalizeClassAgitParams(params = {}) {
    if (!params || typeof params !== 'object') return {};
    if (params.mode === 'books') return { mode: 'books' };
    if (['book', 'chapter'].includes(params.mode)) {
        const editionId = exhibitionId(params.editionId);
        if (!editionId) return { mode: 'books' };
        const base = { mode: 'book', editionId };
        return params.mode === 'chapter' && typeof params.workId === 'string' && /^chapter-([1-9]|[1-9][0-9]|100)$/.test(params.workId || '') ? { ...base, mode: 'chapter', workId: params.workId } : base;
    }
    const id = exhibitionId(params.exhibitionId);
    if (!id) return {};
    if (!['room', 'work'].includes(params.mode)) return { exhibitionId: id, mode: 'lobby' };
    const room = Number.isInteger(params.room) && params.room >= 1 && params.room <= 5 ? params.room : 1;
    const base = { exhibitionId: id, mode: 'room', room, view: params.view === 'list' ? 'list' : 'room' };
    const selected = workId(params.workId);
    if (params.mode !== 'work' || !selected || !Number.isSafeInteger(params.publicationNo) || params.publicationNo < 1) return base;
    return { ...base, mode: 'work', workId: selected, publicationNo: params.publicationNo };
}

export const classAgitRoute = (params = {}) => ({ name: 'class_agit', params: normalizeClassAgitParams(params) });

export function getClassAgitBackDestination(params) {
    const route = normalizeClassAgitParams(params);
    if (route.mode === 'chapter') return classAgitRoute({ mode: 'book', editionId: route.editionId });
    if (route.mode === 'book') return classAgitRoute({ mode: 'books' });
    if (route.mode === 'books') return classAgitRoute();
    if (route.mode === 'work') return classAgitRoute({ ...route, mode: 'room' });
    if (route.mode === 'room') return classAgitRoute({ exhibitionId: route.exhibitionId });
    if (route.mode === 'lobby') return classAgitRoute();
    return { name: 'main', params: {} };
}

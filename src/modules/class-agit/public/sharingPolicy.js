import { CLASS_AGIT_LIMITS } from '../policy.js';
import { assertRoomDraft, normalizeRoomDraft, orderedRoomItems } from '../rooms.js';

export const externalAuthor = (item) => item.shareAuthor ?? item.authorName ?? item.author ?? '';
export const hasBlockedShareWorks = (items) => items.some((item) => item.unavailable || item.sourceChanged || item.revoked);
export function createShareDraft(data) {
    const draft = normalizeRoomDraft({ rooms: data.share_rooms || data.rooms, items: data.candidates });
    const ids = new Set(draft.rooms.map((room) => room.id));
    return { rooms: draft.rooms.map((room) => ({ ...room })), items: draft.items.map((item) => ({ ...item,
        title: item.shareTitle ?? item.title, author: externalAuthor(item),
        roomId: ids.has(item.shareRoomId) ? item.shareRoomId : item.roomId,
    })) };
}
export function prepareShareWorks(items, rooms) {
    if (!Array.isArray(items) || items.length < 1 || items.length > CLASS_AGIT_LIMITS.maxWorks) throw new Error(`공개할 작품은 1~${CLASS_AGIT_LIMITS.maxWorks}편이어야 합니다.`);
    if (hasBlockedShareWorks(items)) throw new Error('공개할 수 없는 작품이 있습니다. 전시 편집에서 원글을 다시 확인하거나 작품을 빼고 저장해 주세요.');
    if (new Set(items.map((item) => item.itemId)).size !== items.length) throw new Error('같은 작품을 중복 수록할 수 없습니다.');
    const ordered = rooms ? orderedRoomItems(assertRoomDraft({ items, rooms }, true)) : items;
    return ordered.map((item) => {
        const title = (item.title || '').trim(), author = (item.author ?? externalAuthor(item)).trim();
        if (!title || Array.from(title).length > CLASS_AGIT_LIMITS.titleLength || !author || Array.from(author).length > CLASS_AGIT_LIMITS.authorLength) throw new Error('작품 제목은 1~80자, 지은이는 1~30자로 적어 주세요.');
        return { itemId: item.itemId, sourceRevision: item.sourceRevision, title, author, roomId: item.roomId };
    });
}
export function moveShareWork(draft, itemId, roomId) {
    return assertRoomDraft({ ...draft, items: draft.items.map((item) => item.itemId === itemId ? { ...item, roomId } : item) });
}
// 순서는 전시실 안에서만 바꾼다. 공개 순번은 전시실 차례대로 다시 매긴다.
export function moveShareWorkOrder(draft, itemId, position) {
    const roomId = draft.items.find((item) => item.itemId === itemId)?.roomId ?? null;
    const inRoom = draft.items.filter((item) => (item.roomId ?? null) === roomId);
    const index = inRoom.findIndex((item) => item.itemId === itemId), target = Math.trunc(position) - 1;
    if (index < 0 || !Number.isInteger(target) || target < 0 || target >= inRoom.length || target === index) return draft;
    const moved = [...inRoom];
    moved.splice(target, 0, moved.splice(index, 1)[0]);
    const rest = draft.items.filter((item) => (item.roomId ?? null) !== roomId);
    return { ...draft, items: orderedRoomItems({ ...draft, items: [...rest, ...moved] }) };
}
export function samlinkShareUrl(value) {
    if (typeof value !== 'string') return '';
    try { const url = new URL(value); return url.protocol === 'https:' && url.hostname === 'xn--9y2br3k43n.kr' && /^\/[a-zA-Z0-9_-]{1,30}$/.test(url.pathname) && !url.search && !url.hash && !url.username && !url.password && !url.port ? `https://샘링크.kr${url.pathname}` : ''; } catch { return ''; }
}

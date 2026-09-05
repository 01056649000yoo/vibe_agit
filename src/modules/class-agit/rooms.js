import { CLASS_AGIT_LIMITS as limits } from './policy.js';

export function newExhibitionRoom(index = 0, title = '', id = crypto.randomUUID()) {
    return { id, title: title || `${index + 1} 전시실`, introduction: '', variant: index % 4 };
}
export function normalizeRoomDraft(draft) {
    if (Array.isArray(draft.rooms)) return draft;
    // 과거 초안은 기존 12편 경계를 그대로 보존한다.
    const rooms = Array.from({ length: Math.max(1, Math.ceil(draft.items.length / 12)) }, (_, index) => ({ ...newExhibitionRoom(index, '', `room-${index + 1}`), variant: 0 }));
    return { ...draft, rooms, layoutVersion: 2, items: draft.items.map((item, index) => ({ ...item, roomId: rooms[Math.floor(index / 12)].id })) };
}
export function assertRoomDraft(input, publishing = false) {
    const draft = normalizeRoomDraft(input);
    if (draft.items.length > limits.maxWorks || draft.rooms.length > limits.maxRooms) throw new Error('전시는 최대 120편·10개 전시실입니다.');
    const ids = new Set();
    for (const room of draft.rooms) {
        if (typeof room.id !== 'string' || !/^[a-zA-Z0-9-]{1,40}$/.test(room.id) || ids.has(room.id)
            || typeof room.title !== 'string' || !room.title.trim() || Array.from(room.title).length > limits.roomTitleLength
            || typeof room.introduction !== 'string' || Array.from(room.introduction).length > limits.roomIntroductionLength
            || !Number.isInteger(room.variant) || room.variant < 0 || room.variant > 3) throw new Error('전시실 이름·소개·배경을 확인해 주세요.');
        ids.add(room.id);
        if (draft.items.filter((item) => item.roomId === room.id).length > limits.worksPerRoom) throw new Error('한 전시실에는 최대 20편만 담을 수 있습니다.');
    }
    if (draft.items.some((item) => item.roomId != null && !ids.has(item.roomId))) throw new Error('작품의 전시실을 확인해 주세요.');
    if (publishing && draft.items.some((item) => item.roomId == null)) throw new Error('미배정 작품을 전시실에 넣거나 초안에서 빼 주세요.');
    return draft;
}
export function orderedRoomItems(input) {
    const draft = normalizeRoomDraft(input);
    return [...draft.rooms.flatMap((room) => draft.items.filter((item) => item.roomId === room.id)), ...draft.items.filter((item) => item.roomId == null)];
}
export function editRooms(input, change) {
    const draft = normalizeRoomDraft(input);
    let rooms = draft.rooms, items = draft.items;
    if (change.type === 'room-add') {
        rooms = [...rooms, newExhibitionRoom(rooms.length, change.title, change.id)];
    } else if (change.type === 'room-edit') {
        rooms = rooms.map((room) => room.id === change.id ? { ...room, ...change.patch, id: room.id } : room);
    } else if (change.type === 'room-delete') {
        rooms = rooms.filter((room) => room.id !== change.id);
        items = items.map((item) => item.roomId === change.id ? { ...item, roomId: null } : item);
    } else if (change.type === 'room-move') {
        const index = rooms.findIndex((room) => room.id === change.id), target = index + change.direction;
        if (![-1, 1].includes(change.direction) || index < 0 || target < 0 || target >= rooms.length) return draft;
        rooms = [...rooms];
        const moved = rooms.splice(index, 1)[0]; rooms.splice(target, 0, moved);
    } else if (change.type === 'room-assign') {
        const ids = new Set(change.sourceIds);
        const moving = items.filter((item) => ids.has(item.sourceId || item.itemId));
        items = [...items.filter((item) => !ids.has(item.sourceId || item.itemId)), ...moving.map((item) => ({ ...item, roomId: change.roomId || null }))];
    } else throw new Error('지원하지 않는 전시실 편집입니다.');
    const next = assertRoomDraft({ ...draft, rooms, items, layoutVersion: 2, revision: draft.revision + 1 });
    return { ...next, items: orderedRoomItems(next) };
}

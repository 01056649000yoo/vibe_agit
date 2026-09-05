import { CLASS_AGIT_LIMITS } from '../policy.js';

export const GALLERY_ROOM = Object.freeze({ width: 1000, height: 900, columns: 4, x: 128, y: 108, slotWidth: 166, slotHeight: 190, gapX: 26, gapY: 24 });

export function getGallerySlot(index) {
    if (!Number.isInteger(index) || index < 0 || index >= CLASS_AGIT_LIMITS.worksPerRoom) throw new Error('전시실 액자 위치를 확인해 주세요.');
    return { x: GALLERY_ROOM.x + (index % GALLERY_ROOM.columns) * (GALLERY_ROOM.slotWidth + GALLERY_ROOM.gapX),
        y: GALLERY_ROOM.y + Math.floor(index / GALLERY_ROOM.columns) * (GALLERY_ROOM.slotHeight + GALLERY_ROOM.gapY),
        width: GALLERY_ROOM.slotWidth, height: GALLERY_ROOM.slotHeight };
}

export function galleryRoomHeight(count) {
    const rows = Math.max(3, Math.ceil(count / GALLERY_ROOM.columns));
    return Math.max(GALLERY_ROOM.height, Math.ceil((GALLERY_ROOM.y + rows * GALLERY_ROOM.slotHeight + (rows - 1) * GALLERY_ROOM.gapY + 30) / .83));
}
export function arrangeGalleryRooms(works, definitions) {
    if (works.length > CLASS_AGIT_LIMITS.maxWorks) throw new Error(`전시는 최대 ${CLASS_AGIT_LIMITS.maxWorks}편입니다.`);
    if (definitions) return definitions.map((room, index) => ({ ...room, number: index + 1, works: works.filter((work) => work.roomId === room.id) })).filter((room) => room.works.length);
    // 명시적 구성이 없는 과거 표시본만 12편 단위로 읽는다.
    const rooms = [];
    for (let start = 0; start < works.length; start += 12) {
        rooms.push({ id: `room-${rooms.length + 1}`, title: `${rooms.length + 1} 전시실`, introduction: '', variant: 0, number: rooms.length + 1, works: works.slice(start, start + 12) });
    }
    return rooms;
}

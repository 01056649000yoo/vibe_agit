import { CLASS_AGIT_LIMITS } from '../policy.js';

export const GALLERY_ROOM = Object.freeze({ width: 1000, height: 900, columns: 4, x: 128, y: 108, slotWidth: 166, slotHeight: 190, gapX: 26, gapY: 24 });

export function getGallerySlot(index) {
    if (!Number.isInteger(index) || index < 0 || index >= CLASS_AGIT_LIMITS.worksPerRoom) throw new Error('전시실 액자 위치를 확인해 주세요.');
    return { x: GALLERY_ROOM.x + (index % GALLERY_ROOM.columns) * (GALLERY_ROOM.slotWidth + GALLERY_ROOM.gapX),
        y: GALLERY_ROOM.y + Math.floor(index / GALLERY_ROOM.columns) * (GALLERY_ROOM.slotHeight + GALLERY_ROOM.gapY),
        width: GALLERY_ROOM.slotWidth, height: GALLERY_ROOM.slotHeight };
}

export function arrangeGalleryRooms(works) {
    if (works.length > CLASS_AGIT_LIMITS.maxWorks) throw new Error(`전시는 최대 ${CLASS_AGIT_LIMITS.maxWorks}편입니다.`);
    const rooms = [];
    for (let start = 0; start < works.length; start += CLASS_AGIT_LIMITS.worksPerRoom) {
        rooms.push({ id: `room-${rooms.length + 1}`, number: rooms.length + 1, works: works.slice(start, start + CLASS_AGIT_LIMITS.worksPerRoom) });
    }
    return rooms;
}

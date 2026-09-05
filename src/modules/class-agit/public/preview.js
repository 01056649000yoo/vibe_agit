import { arrangeGalleryRooms } from '../gallery/roomLayout.js';
// 공개 전송 전에 같은 방 구성과 안전한 표시 필드를 검증한다.
export function createPublicPreviewApi({ title, introduction, works, rooms: definitions, theme = 'garden' }) {
    const arranged = arrangeGalleryRooms(works, definitions);
    return { async read(_token, room = 0, workId = null) {
        const rooms = arranged.map(({ number, title, introduction, variant, works }) => ({ number, title, introduction, variant, count: works.length }));
        const items = room && !workId ? (arranged.find((entry) => entry.number === room)?.works || []).map(({ id, title, author, format, kindLabel, excerpt }) => ({ id, title, author, format, kindLabel, excerpt })) : [];
        const selected = workId ? arranged.flatMap((entry) => entry.works).find((work) => work.id === workId) : null;
        const work = selected ? { id: selected.id, title: selected.title, author: selected.author, format: selected.format, kindLabel: selected.kindLabel, excerpt: selected.excerpt, blocks: selected.blocks } : null;
        return { version: 1, title, introduction, theme, publication_no: 1, room, rooms, total_count: arranged.reduce((sum, entry) => sum + entry.works.length, 0), items, work };
    } };
}

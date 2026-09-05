// 공개 전송 전, 화면에서 선택한 안전한 필드로 같은 외부 뷰어를 확인한다. 실제 토큰이나 저장은 없다.
export function createPublicPreviewApi({ title, introduction, works }) {
    return { async read(_token, room = 0, workId = null) {
        const rooms = Array.from({ length: Math.ceil(works.length / 12) }, (_, i) => ({ number: i + 1, count: Math.min(12, works.length - i * 12) }));
        const items = room && !workId ? works.slice((room - 1) * 12, room * 12).map(({ id, title, author, format, kindLabel, excerpt }) => ({ id, title, author, format, kindLabel, excerpt })) : [];
        return { version: 1, title, introduction, publication_no: 1, room, rooms, total_count: works.length, items, work: workId ? works.find((work) => work.id === workId) : null };
    } };
}

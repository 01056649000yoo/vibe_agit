import { createPreviewDraft, previewClass } from './classAgitFixtures.js';
import { createGalleryPresentation } from '../../modules/class-agit/exhibitionDraft.js';
import { assertStudentExhibitions, assertStudentRoom, assertStudentWork } from '../../modules/class-agit/api/studentContract.js';

export const studentExhibitionId = '11111111-1111-4111-8111-111111111111';

export function createClassAgitStudentFixture(count, onRead = () => {}) {
    const works = createGalleryPresentation(createPreviewDraft(count)).works.map((item, index) => ({ ...item, id: `published-${index + 1}` }));
    let publicationNo = 1;
    let open = true;
    let slowNext = false;
    let failNext = false;
    const withdrawn = new Set();
    const counts = { list: 0, room: 0, work: 0 };
    const record = (kind) => { Reflect.set(counts, kind, Reflect.get(counts, kind) + 1); onRead({ ...counts }); };
    const ensureOpen = (id = studentExhibitionId) => {
        if (!open || id !== studentExhibitionId) throw new Error('지금은 이 전시를 볼 수 없어요. 다른 전시를 둘러봐 주세요.');
    };
    const visible = () => works.filter((item) => !withdrawn.has(item.id));
    const base = () => ({ id: studentExhibitionId, title: `${previewClass.name}의 작은 발견`, introduction: '우리 반 작가들이 발견한 일상의 이야기를 만나 보세요.', publication_no: publicationNo, published_at: '2026-09-05T00:00:00Z' });
    return {
        api: {
            async getStudentBooks() { ensureOpen(); return { version: 1, books: [] }; },
            async getExhibitions() {
                record('list'); ensureOpen();
                return assertStudentExhibitions({ version: 1, exhibitions: count ? [base()] : [] });
            },
            async getRoom(id, room = 0) {
                record('room'); ensureOpen(id);
                const all = visible();
                const rooms = Array.from({ length: Math.ceil(all.length / 12) }, (_, index) => ({ number: index + 1, count: Math.min(12, all.length - index * 12) }));
                const items = room ? all.slice((room - 1) * 12, room * 12).map(({ id, title, author, format, kindLabel, excerpt }) => ({ id, title, author, format, kindLabel, excerpt })) : [];
                return assertStudentRoom({ version: 1, exhibition_id: id, title: base().title, introduction: base().introduction,
                    publication_no: publicationNo, room, rooms, total_count: all.length, items }, id, room);
            },
            async getWork(id, edition, workId) {
                record('work'); ensureOpen(id);
                if (failNext) { failNext = false; throw new Error('작품을 불러오지 못했어요. 전시실에서 다시 골라 주세요.'); }
                if (edition !== publicationNo) throw new Error('전시가 새로 바뀌었어요. 전시실에서 작품을 다시 골라 주세요.');
                const all = visible();
                const index = all.findIndex((item) => item.id === workId);
                if (index < 0) throw new Error('이 작품은 지금 읽을 수 없어요. 다른 작품을 골라 주세요.');
                const response = assertStudentWork({ version: 1, publication_no: edition, work: structuredClone(all.at(index)),
                    previous_id: index > 0 ? all.at(index - 1).id : null, next_id: all.at(index + 1)?.id || null }, workId, edition);
                if (slowNext) { slowNext = false; await new Promise((resolve) => setTimeout(resolve, 10000)); }
                return response;
            },
        },
        controls: {
            withdrawFirst() { withdrawn.add('published-1'); },
            republish() { publicationNo += 1; },
            close() { open = false; },
            delayNext() { slowNext = true; },
            failNext() { failNext = true; },
        },
    };
}

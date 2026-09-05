import { CLASS_AGIT_LIMITS } from '../policy.js';
import { getSourceExclusion, presentSource } from '../sourceContract.js';

export const ANTHOLOGY_PRINT_SETTINGS = Object.freeze({ paper: 'A4', body_pt: 12, poem_pt: 14, version: 1 });

export function bookItemFromSource(source, classId, confirmed = false) {
    const reason = getSourceExclusion(source, classId);
    if (reason) throw new Error(reason);
    return { ...presentSource(source), sourceId: source.id, studentId: source.student_id, sourceRevision: source.source_revision,
        author: source.student_name, group: source.group_title || '', anthologyConfirmed: confirmed };
}
export function addBookItems(book, items) {
    const ids = new Set(book.items.map((item) => item.sourceId));
    const next = items.filter((item) => { if (ids.has(item.sourceId)) return false; ids.add(item.sourceId); return true; });
    if (book.items.length + next.length > CLASS_AGIT_LIMITS.anthologyWorks) throw new Error('한 문집에 100편까지 담을 수 있습니다. 여러 권으로 나눠 주세요.');
    return { ...book, items: [...book.items, ...next] };
}
export function buildBookSavePayload(book) {
    return { book_id: book.id, expected_revision: book.revision, title: book.title, subtitle: book.subtitle,
        introduction: book.introduction, class_label: book.class_label, term: book.term, issue_date: book.issue_date, grouping: book.grouping,
        items: book.items.map((item) => ({ sourceId: item.sourceId, sourceRevision: item.sourceRevision, anthologyConfirmed: item.anthologyConfirmed === true })) };
}
export function sortBookItems(items, grouping) {
    if (!['author', 'topic'].includes(grouping)) return items;
    const key = grouping === 'author' ? 'author' : 'group';
    return [...items].sort((a, b) => String(Reflect.get(a, key)).localeCompare(String(Reflect.get(b, key)), 'ko'));
}
export function assertBookWorkspace(data, classId) {
    if (data?.version !== 1 || data.class_id !== classId || !Array.isArray(data.books) || data.books.length > 20
        || !Array.isArray(data.students) || data.students.length > 100
        || (data.book && (data.book.class_id !== classId || !Array.isArray(data.book.items) || data.book.items.length > 100
            || !Array.isArray(data.book.editions) || data.book.editions.length > 20))) throw new Error('문집 응답을 확인할 수 없습니다.');
    return data;
}
export function assertBookEdition(data) {
    if (data?.version !== 1 || !data.id || !Number.isInteger(data.number) || !data.book?.title
        || Object.entries(ANTHOLOGY_PRINT_SETTINGS).some(([key, value]) => Reflect.get(data.book.print || {}, key) !== value)
        || !Array.isArray(data.book.works) || data.book.works.length < 1 || data.book.works.length > 100
        || data.book.works.some((work) => !Array.isArray(work.blocks) || work.blocks.length > 200 || Array.from(work.blocks.join(' ')).length > 20000)) throw new Error('확정판을 확인할 수 없습니다.');
    return data;
}

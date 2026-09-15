import { getBookPaper, getBookDesign, getBookPageLayout, validBookPrintSettings } from '../designs.js';
import { CLASS_AGIT_LIMITS } from '../policy.js';
import { assertDraftSources, getSourceExclusion, presentSource } from '../sourceContract.js';

export const ANTHOLOGY_PRINT_SETTINGS = Object.freeze({ paper: 'A4', body_pt: 12, poem_pt: 14, version: 1 });
export const bookCoverKicker = (book = {}) => Reflect.has(book, 'cover_kicker')
    ? String(book.cover_kicker || '')
    : (book.book_type === 'personal' ? '나의 글 모음' : '우리 반의 이야기');

export function bookItemFromSource(source, classId) {
    const reason = getSourceExclusion(source, classId);
    if (reason) throw new Error(reason);
    return { ...presentSource(source), sourceId: source.id, studentId: source.student_id, missionId: source.mission_id, sourceRevision: source.source_revision,
        author: source.student_name, group: source.group_title || '' };
}
export function addBookItems(book, items) {
    const ids = new Set(book.items.map((item) => item.sourceId));
    const next = items.filter((item) => { if (ids.has(item.sourceId)) return false; ids.add(item.sourceId); return true; });
    if (book.items.length + next.length > CLASS_AGIT_LIMITS.anthologyWorks) throw new Error(`한 문집에 ${CLASS_AGIT_LIMITS.anthologyWorks}편까지 담을 수 있습니다. 여러 권으로 나눠 주세요.`);
    return { ...book, items: [...book.items, ...next] };
}
export function buildBookSavePayload(book) {
    assertDraftSources(book.items);
    return { book_id: book.id, expected_revision: book.revision, title: book.title, subtitle: book.subtitle, cover_kicker: bookCoverKicker(book),
        introduction: book.introduction, class_label: book.class_label, issue_date: book.issue_date, grouping: book.grouping,
        book_type: book.book_type || 'class', owner_student_id: book.owner_student_id || null,
        paper_format: getBookPaper(book.paper_format).id, design_id: getBookDesign(book.design_id).id,
        page_layout: getBookPageLayout(book.page_layout).id,
        // 그 앞에서 쪽을 넘길 작품의 원글 id. 순서를 바꿔도 교사가 정한 것이 따라간다.
        page_breaks: normalizeBookPageBreaks(book.page_breaks, book.items),
        items: book.items.map((item) => ({ sourceId: item.sourceId, sourceRevision: item.sourceRevision })) };
}
export function sortBookItems(items, grouping) {
    if (!['author', 'topic'].includes(grouping)) return items;
    const key = grouping === 'author' ? 'author' : 'group';
    return [...items].sort((a, b) => String(Reflect.get(a, key)).localeCompare(String(Reflect.get(b, key)), 'ko'));
}
export function assertBookWorkspace(data, classId) {
    if (data?.version !== 1 || data.class_id !== classId || !Array.isArray(data.books) || data.books.length > CLASS_AGIT_LIMITS.anthologyShelfBooks
        || !Array.isArray(data.students) || data.students.length > CLASS_AGIT_LIMITS.maxCandidates
        || (data.book && (data.book.class_id !== classId || !Array.isArray(data.book.items) || data.book.items.length > CLASS_AGIT_LIMITS.anthologyWorks
            || !Array.isArray(data.book.editions) || data.book.editions.length > 20))) throw new Error('문집 응답을 확인할 수 없습니다.');
    return data;
}
export function assertBookEdition(data) {
    if (data?.version !== 1 || !data.id || !Number.isInteger(data.number) || !data.book?.title
        || !validBookPrintSettings(data.book.print)
        || !Array.isArray(data.book.works) || data.book.works.length < 1 || data.book.works.length > CLASS_AGIT_LIMITS.anthologyWorks
        || data.book.works.some((work) => !Array.isArray(work.blocks) || work.blocks.length > 200 || Array.from(work.blocks.join(' ')).length > 20000)) throw new Error('확정판을 확인할 수 없습니다.');
    return data;
}

/**
 * 쪽 나누기 목록을 지금 문집에 있는 작품만 남겨 정리한다.
 *
 * 작품을 빼면 그 표시도 함께 사라져야 한다 — 남겨 두면 다음에 그 작품을 다시 담았을 때
 * 교사가 정한 적 없는 쪽 넘김이 되살아난다.
 */
export function normalizeBookPageBreaks(breaks, items = []) {
    const present = new Set(items.map((item) => item.sourceId));
    return [...new Set((Array.isArray(breaks) ? breaks : []).filter((id) => present.has(id)))];
}

export function toggleBookPageBreak(book, sourceId) {
    const current = normalizeBookPageBreaks(book.page_breaks, book.items);
    const next = current.includes(sourceId) ? current.filter((id) => id !== sourceId) : [...current, sourceId];
    return { ...book, page_breaks: next };
}

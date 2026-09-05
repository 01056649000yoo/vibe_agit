const text = (v, max) => typeof v === 'string' && Array.from(v).length <= max;
const keys = (v, allowed) => v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).every((key) => allowed.includes(key));
const id = (v) => typeof v === 'string' && /^chapter-([1-9]|[1-9][0-9]|100)$/.test(v);
const fail = () => { throw new Error('문집 응답을 확인하지 못했어요. 다시 열어 주세요.'); };
export function assertStudentBooks(data, editionId = null, workId = null) {
    if (data?.version !== 1) fail();
    if (!editionId) {
        if (!keys(data, ['version', 'books']) || !Array.isArray(data.books) || data.books.length > 20 || data.books.some((b) => !keys(b, ['id', 'number', 'created_at', 'title', 'subtitle']) || !text(b.id, 36) || !Number.isInteger(b.number) || b.number < 1 || !text(b.title, 80) || !text(b.subtitle, 120))) fail();
    } else {
        if (!keys(data, ['version', 'id', 'number', 'book', 'works', 'work']) || data.id !== editionId || !Number.isInteger(data.number) || data.number < 1
            || !keys(data.book, ['title', 'subtitle', 'introduction', 'class_label', 'term', 'issue_date', 'grouping']) || !text(data.book.title, 80) || !text(data.book.introduction, 2000)) fail();
        if (workId) {
            const work = data.work;
            if (data.works !== null || !keys(work, ['id', 'title', 'author', 'format', 'kindLabel', 'excerpt', 'blocks', 'group']) || work?.id !== workId || !id(work.id) || !text(work.title, 200) || !text(work.author, 30)
                || !['prose', 'poem'].includes(work.format) || !Array.isArray(work.blocks) || !work.blocks.length || work.blocks.length > 200 || work.blocks.some((b) => !text(b, 20000)) || !text(work.blocks.join(' '), 20000)) fail();
        } else if (data.work !== null || !Array.isArray(data.works) || data.works.length > 100 || data.works.some((w) => !keys(w, ['id', 'title', 'author', 'group']) || !id(w.id) || !text(w.title, 200) || !text(w.author, 30) || !text(w.group, 200))) fail();
    }
    return data;
}

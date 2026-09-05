import { createClassAgitPersistenceFixture } from './classAgitPersistenceFixture.js';
import { previewClass, previewSources, previewStudents } from './classAgitFixtures.js';
import { bookItemFromSource, buildBookSavePayload, ANTHOLOGY_PRINT_SETTINGS } from '../../modules/class-agit/anthology/contract.js';
import { createPublicPreviewApi } from '../../modules/class-agit/public/preview.js';
const clone = (value) => structuredClone(value);
export async function createClassAgitReleaseFixture() {
    const sources = Array.from({ length: 100 }, (_, i) => ({ ...clone(previewSources[i % 64]), id: `sample-post-${i + 1}`, title: `${i + 1}. ${previewSources[i % 64].title}` }));
    sources[2].content = Array.from({ length: 100 }, (_, i) => `${i + 1}번째 기억. 운동장에서 작은 꽃을 발견했다. 친구와 나눈 이야기는 오래 기억하고 싶다. 한글과 🌱 이모지를 함께 기록한다.`).join('\n\n');
    const base = createClassAgitPersistenceFixture(sources); const sourceApi = base.api;
    const books = new Map(); const shares = new Map(); let settings = { mode: 'internal', external_enabled: false, revision: 1 };
    let selectedClasses = []; let lastToken = null;
    const source = (id) => sourceApi.getSource(previewClass.id, id);
    const currentBook = (id) => { const b = books.get(id); if (!b) throw new Error('문집을 찾을 수 없습니다.'); return b; };
    const workspace = async (id) => ({ version: 1, class_id: previewClass.id, students: clone(previewStudents), books: [...books.values()].map((b) => ({ id: b.id, title: b.title, archived: b.archived })), book: id ? { ...clone(currentBook(id)), items: await Promise.all(currentBook(id).items.map(async (item) => { try { const s = await source(item.sourceId); return { ...item, sourceChanged: s.source_revision !== item.sourceRevision }; } catch { return { ...item, unavailable: true }; } })), editions: currentBook(id).editions.map((e) => ({ id: e.id, title: e.title, number: e.number, student_visible: e.student_visible, created_at: e.created_at })) } : null });
    const visibleWorks = async (book, edition) => {
        const works = [];
        for (const work of edition.snapshot.works) {
            const latest = book.history.get(work.sourceId);
            try { await source(work.sourceId); } catch { continue; }
            if (!latest || latest.revoked || latest.consentId !== work.consentId) continue;
            const { sourceId: _sourceId, consentId: _consent, ...safe } = work; works.push(safe);
        }
        return works;
    };
    const getShare = async (_class, exId) => {
        const d = (await sourceApi.getWorkspace(previewClass.id, exId)).draft; const share = shares.get(exId);
        return { version: 1, external_enabled: settings.external_enabled, exhibition_revision: d.revision,
            candidates: d.items.map((i) => ({ ...i, unavailable: i.unavailable || i.revoked })),
            share: share ? { revision: share.revision, publication_no: share.publication_no, title: share.title, introduction: share.introduction, expires_at: share.expires_at, revoked: share.revoked, expired: Date.parse(share.expires_at) < Date.now() } : null,
            published_items: share?.works.map((w) => ({ id: w.itemId, title: w.title, author: w.author, revoked: w.revoked })) || [] };
    };
    const api = {
        getAccess: async () => ({ allowed: settings.mode !== 'disabled', is_admin: true }),
        async manageRollout(payload) { if (payload) { if (payload.expected_revision !== settings.revision) throw new Error('공개 설정을 다시 불러와 주세요.'); settings = { mode: payload.mode, external_enabled: payload.external_enabled, revision: settings.revision + 1 }; selectedClasses = payload.class_ids; } return { version: 1, settings: clone(settings), class_ids: selectedClasses, classes: [{ id: previewClass.id, name: previewClass.name }, { id: 'sample-class-2', name: '별빛반' }] }; },
        getBooks: (_class, id = null) => workspace(id),
        saveBook: (classId, b) => api.bookAction(classId, 'save', buildBookSavePayload(b)),
        async bookAction(_class, action, p) {
            if (action === 'create') { if (!books.has(p.book_id)) books.set(p.book_id, { id: p.book_id, class_id: previewClass.id, title: '우리 반의 이야기', subtitle: '', introduction: '', class_label: '', term: '', issue_date: '2026-09-05', grouping: 'custom', revision: 1, archived: false, items: [], editions: [], history: new Map() }); return workspace(p.book_id); }
            const book = currentBook(p.book_id);
            if (p.expected_revision !== book.revision) throw new Error('다른 화면에서 문집이 변경되었습니다. 최신 문집을 불러와 주세요.');
            if (action === 'save') {
                const items = [];
                if (p.items.length > 100 || new Set(p.items.map((i) => i.sourceId)).size !== p.items.length) throw new Error('수록 작품을 확인해 주세요.');
                for (const input of p.items) { const s = await source(input.sourceId); if (s.source_revision !== input.sourceRevision || !input.anthologyConfirmed) throw new Error('원글과 문집 수록 의사를 다시 확인해 주세요.'); const old = book.history.get(s.id); items.push({ ...bookItemFromSource(s, previewClass.id, true), itemId: old?.itemId || crypto.randomUUID(), consentId: old && !old.revoked ? old.consentId : crypto.randomUUID(), revoked: false }); }
                Object.assign(book, { title: p.title, subtitle: p.subtitle, introduction: p.introduction, class_label: p.class_label, term: p.term, issue_date: p.issue_date, grouping: p.grouping, items });
                items.forEach((i) => book.history.set(i.sourceId, i));
            } else if (action === 'finalize') {
                if (!book.items.length || book.items.some((i) => i.revoked)) throw new Error('수록할 작품을 확인해 주세요.');
                for (const item of book.items) if ((await source(item.sourceId)).source_revision !== item.sourceRevision) throw new Error('원글 전문을 다시 확인해 주세요.');
                const snapshot = { print: ANTHOLOGY_PRINT_SETTINGS, title: book.title, subtitle: book.subtitle, introduction: book.introduction, class_label: book.class_label, term: book.term, issue_date: book.issue_date, grouping: book.grouping, works: book.items.map((i, index) => ({ id: `chapter-${index + 1}`, title: i.title, author: i.author, group: i.group, format: i.format, kindLabel: i.kindLabel, excerpt: i.excerpt, blocks: i.blocks, sourceId: i.sourceId, consentId: i.consentId })) };
                book.editions.unshift({ id: crypto.randomUUID(), number: book.editions.length + 1, title: book.title, created_at: new Date().toISOString(), student_visible: false, snapshot: clone(snapshot) });
            } else if (action === 'show' || action === 'hide') book.editions.forEach((e) => { if (action === 'show' || e.id === p.edition_id) e.student_visible = action === 'show' && e.id === p.edition_id; });
            else if (action === 'withdraw') { const item = book.items.find((i) => i.itemId === p.item_id); item.revoked = true; item.anthologyConfirmed = false; }
            else if (action === 'archive' || action === 'restore') { book.archived = action === 'archive'; book.editions.forEach((e) => { e.student_visible = false; }); }
            book.revision++; return workspace(book.id);
        },
        async getBookPreview(_class, id, revision) {
            const book = currentBook(id); if (book.revision !== revision) throw new Error('최신 문집을 불러와 주세요.');
            const works = [];
            for (const item of book.items) { if (item.revoked || (await source(item.sourceId)).source_revision !== item.sourceRevision) throw new Error('원글과 수록 의사를 확인해 주세요.'); works.push({ id: `chapter-${works.length + 1}`, title: item.title, author: item.author, group: item.group, format: item.format, kindLabel: item.kindLabel, excerpt: item.excerpt, blocks: item.blocks }); }
            return { version: 1, id, number: 0, draft: true, book: { title: book.title, subtitle: book.subtitle, introduction: book.introduction, class_label: book.class_label, term: book.term, issue_date: book.issue_date, grouping: book.grouping, print: ANTHOLOGY_PRINT_SETTINGS, works } };
        },
        async getEdition(_class, id) { const book = [...books.values()].find((b) => b.editions.some((e) => e.id === id)); const ed = book?.editions.find((e) => e.id === id); if (!ed) throw new Error('확정판이 없습니다.'); const works = await visibleWorks(book, ed); if (works.length !== ed.snapshot.works.length) throw new Error('수록이 철회된 작품이 있습니다. 새 판을 만들어 주세요.'); return { version: 1, id, number: ed.number, book: { ...clone(ed.snapshot), works } }; },
        async getStudentBooks(id = null, workId = null) {
            const open = settings.mode !== 'disabled' && (await sourceApi.getWorkspace(previewClass.id)).class.module_enabled;
            if (!open) throw new Error('지금은 문집 서가가 닫혀 있어요.');
            const editions = [...books.values()].filter((b) => !b.archived).flatMap((b) => b.editions.filter((e) => e.student_visible).map((e) => ({ b, e })));
            if (!id) return { version: 1, books: editions.map(({ e }) => ({ id: e.id, number: e.number, title: e.title, subtitle: e.snapshot.subtitle, created_at: e.created_at })) };
            const found = editions.find(({ e }) => e.id === id); if (!found) throw new Error('지금은 이 문집을 읽을 수 없어요.');
            const works = await visibleWorks(found.b, found.e); const { works: _works, print: _print, ...book } = clone(found.e.snapshot);
            const work = works.find((w) => w.id === workId); if (workId && !work) throw new Error('이 작품은 지금 읽을 수 없어요.');
            return { version: 1, id, number: found.e.number, book, works: workId ? null : works.map(({ id, title, author, group }) => ({ id, title, author, group })), work: workId ? work : null };
        },
        getShare,
        async shareAction(_class, exId, action, p) {
            let share = shares.get(exId);
            if ((share?.revision || 0) !== p.expected_revision) throw new Error('최신 공유 설정을 불러와 주세요.');
            if (['publish', 'rotate', 'extend'].includes(action) && !settings.external_enabled) throw new Error('외부 공유가 중지되어 있습니다.');
            if (action === 'publish') {
                const d = (await sourceApi.getWorkspace(previewClass.id, exId)).draft;
                if (!p.confirmed || !p.items.length || p.exhibition_revision !== d.revision) throw new Error('공개 내용을 다시 확인해 주세요.');
                const works = [];
                for (const [i, input] of p.items.entries()) { const original = d.items.find((item) => item.itemId === input.itemId); const current = await source(original.sourceId); if (current.source_revision !== input.sourceRevision) throw new Error('원글을 다시 확인해 주세요.'); works.push({ id: `published-${i + 1}`, itemId: crypto.randomUUID(), sourceId: original.sourceId, title: original.title, author: input.publicAlias, format: original.format, kindLabel: original.kindLabel, excerpt: original.excerpt, blocks: clone(original.blocks), revoked: false }); }
                share = { title: p.title, introduction: p.introduction, works, token: p.token, revoked: false, publication_no: (share?.publication_no || 0) + 1, revision: share?.revision || 0 }; shares.set(exId, share);
            }
            if (['publish', 'rotate', 'extend'].includes(action)) share.expires_at = new Date(Date.now() + p.days * 86400000).toISOString();
            if (action === 'rotate') share.token = p.token;
            if (action === 'revoke') share.revoked = true;
            if (action === 'withdraw') share.works.find((w) => w.itemId === p.item_id).revoked = true;
            if (p.token) lastToken = p.token;
            share.revision++; return getShare(_class, exId);
        },
    };
    const publicApi = { async read(token, room, workId, publicationNo) {
        const s = [...shares.values()].find((s) => s.token === token && !s.revoked && Date.parse(s.expires_at) > Date.now());
        if (!s || !settings.external_enabled || settings.mode === 'disabled') throw new Error('공유가 끝났거나 지금 볼 수 없는 전시입니다.');
        if (workId && publicationNo !== s.publication_no) throw new Error('전시가 새로 바뀌었습니다.');
        const works = [];
        for (const item of s.works) { try { await source(item.sourceId); } catch { continue; } if (!item.revoked) { const { sourceId: _s, itemId: _i, revoked: _r, ...safe } = item; works.push(safe); } }
        const result = await createPublicPreviewApi({ title: s.title, introduction: s.introduction, works }).read(token, room, workId);
        if (workId && !result.work) throw new Error('이 작품은 지금 읽을 수 없습니다.');
        return { ...result, publication_no: s.publication_no };
    } };
    const initialExhibitionId = crypto.randomUUID(); await sourceApi.runAction(previewClass.id, 'create', { exhibition_id: initialExhibitionId });
    const initialExhibitionItems = sources.slice(0, 12).map((s) => ({ sourceId: s.id, sourceRevision: s.source_revision, classAcknowledged: true, publicAlias: '새싹 작가' }));
    await sourceApi.runAction(previewClass.id, 'save', { exhibition_id: initialExhibitionId, expected_revision: 1, title: '우리들의 작은 발견', introduction: '한 학기의 문장을 만나요.', items: initialExhibitionItems });
    return { api, sourceApi, publicApi, controls: { ...base.controls, expire() { for (const s of shares.values()) s.expires_at = new Date(0).toISOString(); }, token: () => lastToken,
        async sampleBook100() { const id = crypto.randomUUID(); const ws = await api.bookAction(previewClass.id, 'create', { book_id: id }); const book = { ...ws.book, title: '백 개의 작은 이야기', subtitle: '긴 글과 시가 만나는 문집', class_label: '햇살반', term: '2026년 2학기', introduction: '서로 다른 목소리가 한 권의 책에서 만납니다.\n\n한 문장씩 천천히 읽어 주세요.', items: sources.map((s) => bookItemFromSource(s, previewClass.id, true)) }; const saved = await api.saveBook(previewClass.id, book); await api.bookAction(previewClass.id, 'finalize', { book_id: id, expected_revision: saved.book.revision, confirmed: true }); } } };
}

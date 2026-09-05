import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GALLERY_THEMES, BOOK_PAPERS, BOOK_DESIGNS, createBookPrintSettings, validBookPrintSettings } from '../src/modules/class-agit/designs.js';
import { assertStudentBooks } from '../src/modules/class-agit/anthology/studentContract.js';
import { ANTHOLOGY_PRINT_SETTINGS } from '../src/modules/class-agit/anthology/contract.js';
import { buildAnthologyHtml } from '../src/modules/class-agit/anthology/print.js';
import { createClassAgitReleaseFixture } from '../src/dev/fixtures/classAgitReleaseFixture.js';
import { previewClass } from '../src/dev/fixtures/classAgitFixtures.js';
import { TEACHER_NAV_GROUPS, CLASS_AGIT_TEACHER_TABS } from '../src/constants/teacherNav.js';
import { TEACHER_GUIDES } from '../src/constants/teacherGuides.js';
import { assertStudentRoom } from '../src/modules/class-agit/api/studentContract.js';
import { assertPublicGalleryResponse } from '../src/modules/class-agit/public/publicApi.js';
import { createPublicPreviewApi } from '../src/modules/class-agit/public/preview.js';
const migration = 'supabase/migrations/20261246_class_agit_designs_and_deletion.sql';
const sql = readFileSync(migration, 'utf8');
const body = (name) => {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    return start < 0 ? undefined : sql.slice(start, sql.indexOf('$$;', start) + 3);
};
const viewerSources = [
    [readFileSync('src/modules/class-agit/gallery/GalleryViewer.jsx', 'utf8'), 'exhibition.theme'],
    [readFileSync('src/modules/class-agit/teacher/PublishedExhibition.jsx', 'utf8'), 'page.exhibition.theme'],
    [readFileSync('src/modules/class-agit/student/StudentEntry.jsx', 'utf8'), 'roomData.theme'],
    [readFileSync('src/modules/class-agit/public/PublicGallery.jsx', 'utf8'), 'data.theme'],
];

test('전시·문집 메뉴는 글쓰기와 같은 공용 sidebar와 별도 도움말 대상으로 등록한다', () => {
    const group = TEACHER_NAV_GROUPS.find((group) => group.id === 'class-agit');
    assert.equal(group.secondaryShape, TEACHER_NAV_GROUPS.find((group) => group.id === 'writing').secondaryShape);
    assert.equal(group.tabs, CLASS_AGIT_TEACHER_TABS);
    assert.deepEqual(group.tabs.map(({ id, section }) => [id, section]), [['class-agit', 'exhibitions'], ['class-agit-books', 'books']]);
    const entry = readFileSync('src/modules/class-agit/teacher/TeacherEntry.jsx', 'utf8');
    assert.match(entry, /visited\.includes\('books'\)[\s\S]*hidden=\{current !== 'books'\}/);
    assert.match(entry, /visited\.includes\('exhibitions'\)[\s\S]*hidden=\{current !== 'exhibitions'\}/);
});
test('같이 쓰는 디자인·판형 ID는 UI 레지스트리와 DB의 모든 저장 경계가 일치한다', () => {
    const expected = GALLERY_THEMES.map(({ id }) => `'${id}'`).join(',');
    for (const table of ['class_agit_exhibitions', 'class_agit_external_shares', 'class_agit_publication_catalog']) {
        assert.ok(sql.includes(`ALTER TABLE public.${table} ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'garden' CHECK(theme IN (${expected}))`));
    }
    assert.deepEqual(BOOK_PAPERS.map(({ id, width, height }) => [id, width, height]), [['A4', 210, 297], ['A5', 148, 210], ['B5', 182, 257]]);
    assert.ok(sql.includes(`CHECK(paper_format IN (${BOOK_PAPERS.map(({ id }) => `'${id}'`).join(',')}))`));
    assert.ok(sql.includes(`CHECK(design_id IN (${BOOK_DESIGNS.map(({ id }) => `'${id}'`).join(',')}))`));
    for (const id of GALLERY_THEMES.map((theme) => theme.id)) assert.ok(body('run_class_agit_action_v1').includes(`'${id}'`));
    for (const id of [...BOOK_PAPERS, ...BOOK_DESIGNS].map((entry) => entry.id)) assert.ok(body('run_class_agit_book_action_v1').includes(`'${id}'`));
});
test('기존 확정판은 A4 v1로 읽고 새 판은 허용 판형·디자인만 받아 12pt 이상으로 출력한다', async () => {
    assert.equal(validBookPrintSettings(ANTHOLOGY_PRINT_SETTINGS), true);
    for (const print of [null, { ...ANTHOLOGY_PRINT_SETTINGS, paper: 'A5' }, { ...createBookPrintSettings(), body_pt: 10 }, { ...createBookPrintSettings(), design: '<script>' }, { ...createBookPrintSettings(), paper: 'A3' }]) assert.equal(validBookPrintSettings(print), false);
    for (const paper of BOOK_PAPERS) for (const design of BOOK_DESIGNS) {
        const print = createBookPrintSettings({ paper_format: paper.id, design_id: design.id });
        const html = await buildAnthologyHtml({ version: 1, id: 'edition', number: 1, book: { title: '<표지>', subtitle: '', introduction: '', class_label: '', term: '', issue_date: '2026-09-05', print, works: [{ title: '긴 글', author: '작가', format: 'prose', blocks: ['<본문>'] }] } });
        assert.ok(html.includes(`@page { size:${paper.width}mm ${paper.height}mm; margin:0; }`));
        assert.ok(html.includes(`width:${paper.width}mm;height:${paper.height}mm;`));
        assert.ok(html.includes(`data-design="${design.id}"`));
        assert.match(html, /font-size:12pt/); assert.match(html, /&lt;본문&gt;/);
    }
});
test('초안 디자인은 저장되며 이미 만든 전시·문집의 설정은 바뀌지 않는다', async () => {
    const f = await createClassAgitReleaseFixture();
    const workspace = await f.sourceApi.getWorkspace(previewClass.id);
    const id = workspace.projects[0].id;
    let draft = (await f.sourceApi.getWorkspace(previewClass.id, id)).draft;
    draft = (await f.sourceApi.save(previewClass.id, { ...draft, theme: 'night' }, draft.revision)).draft;
    await f.sourceApi.runAction(previewClass.id, 'set_enabled', { expected_enabled: false, enabled: true });
    draft = (await f.sourceApi.runAction(previewClass.id, 'publish', { exhibition_id: id, expected_revision: draft.revision, confirmed: true })).draft;
    await f.sourceApi.save(previewClass.id, { ...draft, theme: 'museum' }, draft.revision);
    assert.equal((await f.sourceApi.getPublication(previewClass.id, id)).exhibition.theme, 'night');
    await f.controls.sampleBook100();
    const books = await f.api.getBooks(previewClass.id);
    let book = (await f.api.getBooks(previewClass.id, books.books[0].id)).book;
    const edition = book.editions[0];
    book = (await f.api.saveBook(previewClass.id, { ...book, paper_format: 'A5', design_id: 'editorial' })).book;
    assert.equal(book.paper_format, 'A5');
    assert.equal((await f.api.getEdition(previewClass.id, edition.id)).book.print.paper, 'A4');
    assert.equal((await f.api.getEdition(previewClass.id, edition.id)).book.print.design, 'botanical');
    await f.api.bookAction(previewClass.id, 'show', { book_id: book.id, expected_revision: book.revision, edition_id: edition.id });
    const shelf = assertStudentBooks(await f.api.getStudentBooks());
    assert.equal(shelf.books[0].design, 'botanical');
    assert.equal(shelf.books[0].paper, 'A4');
    assertStudentBooks(await f.api.getStudentBooks(edition.id), edition.id);
    assert.throws(() => assertStudentBooks({ ...shelf, books: [{ ...shelf.books[0], design: 'url(evil)' }] }));
});
test('학생·외부 응답은 디자인 ID만 추가하며 임의 데이터나 디자인은 차단한다', async () => {
    const data = await createPublicPreviewApi({ title: '전시', introduction: '', works: [], theme: 'night' }).read('', 0);
    assert.equal(assertPublicGalleryResponse(data, 0).theme, 'night');
    assert.throws(() => assertPublicGalleryResponse({ ...data, theme: 'url(evil)' }, 0));
    assert.throws(() => assertPublicGalleryResponse({ ...data, private_source: 'leak' }, 0));
    const { work: _, ...room } = data;
    assert.equal(assertStudentRoom({ ...room, exhibition_id: 'test' }, 'test', 0).theme, 'night');
    for (const [source, expression] of viewerSources) assert.ok(source.includes(`<GalleryRoom theme={${expression}}`));
});
test('삭제는 담당 교사·최신 revision·명시한 삭제 동작을 요구하고 원글을 쓰지 않는다', () => {
    for (const [name, table] of [['run_class_agit_action_v1', 'class_agit_exhibitions'], ['run_class_agit_book_action_v1', 'class_agit_books']]) {
        const fn = body(name), deletion = fn.slice(fn.indexOf("IF p_action = 'delete'") >= 0 ? fn.indexOf("IF p_action = 'delete'") : fn.indexOf("IF p_action='delete'"));
        assert.ok(fn.indexOf('assert_class_agit_manager_v1') < fn.indexOf("'delete'"));
        assert.ok(fn.indexOf('expected_revision') < fn.indexOf("'delete'"));
        assert.match(deletion, /p_payload->'confirmed' IS DISTINCT FROM 'true'::JSONB/);
        assert.ok(deletion.includes(`DELETE FROM public.${table} WHERE class_id=p_class_id AND id=v_id`));
        assert.doesNotMatch(fn, /(?:DELETE FROM|UPDATE) public\.student_posts/);
    }
    for (const name of ['get_my_class_agit_exhibitions_v1', 'get_my_class_agit_room_v1', 'get_class_agit_publication_v1', 'read_public_class_agit_v1']) {
        assert.ok(body(name)); assert.doesNotMatch(body(name), /class_agit_current_source_v1|student_posts/);
    }
});

test('학기는 표지·판권·학생 화면과 저장 payload 어디에도 남기지 않는다', async () => {
    const print = createBookPrintSettings();
    const book = { title: '우리 책', subtitle: '부제', introduction: '', class_label: '햇살반', term: '2026년 2학기', issue_date: '2026-09-05', print, works: [{ title: '글', author: '작가', format: 'prose', blocks: ['본문'] }] };
    const html = await buildAnthologyHtml({ version: 1, id: 'edition', number: 1, book });
    // 이미 확정한 판에 학기가 남아 있어도 다시 출력할 때는 보이지 않아야 한다.
    assert.ok(!html.includes('2026년 2학기'), '인쇄본에 학기가 남았습니다.');
    assert.ok(html.includes('우리 반의 이야기'), '표지 문구가 미리보기와 다릅니다.');
    const anthology = [readFileSync('src/modules/class-agit/anthology/BookCover.jsx', 'utf8'), readFileSync('src/modules/class-agit/anthology/StudentBooks.jsx', 'utf8'),
        readFileSync('src/modules/class-agit/anthology/AnthologyManager.jsx', 'utf8'), readFileSync('src/modules/class-agit/anthology/contract.js', 'utf8')];
    for (const source of anthology) assert.doesNotMatch(source, /\bterm\b|학기/);
    assert.doesNotMatch(JSON.stringify(TEACHER_GUIDES['class-agit-books']), /학기/);
});
test('문집 제작은 전시 준비처럼 네 단계 탭으로 나뉜다', () => {
    const source = readFileSync('src/modules/class-agit/anthology/AnthologyManager.jsx', 'utf8');
    const steps = [...source.matchAll(/\{ id: '([a-z]+)', title: '([^']+)'/g)].map((m) => m[1]);
    assert.deepEqual(steps, ['cover', 'design', 'works', 'publish']);
    assert.match(source, /role="tablist"/);
    for (const id of steps) assert.ok(source.includes(`role: 'tabpanel'`) && source.includes(`panel('${id}')`), `${id} 패널이 없습니다.`);
    // 작품을 담는 3단계가 따로 있어야 차례가 길어져도 다른 단계가 밀리지 않는다.
    const works = source.slice(source.indexOf("panel('works')"), source.indexOf("panel('publish')"));
    for (const label of ['학생 글에서 담기', '전시 작품 가져오기', '차례 · ']) assert.ok(works.includes(label), `3단계에 ${label}이 없습니다.`);
    assert.ok(source.slice(source.indexOf("panel('publish')")).includes('새 판 확정'));
    assert.match(source, /이전 단계/); assert.match(source, /BOOK_STEPS\[stepIndex \+ 1\].title/);
});

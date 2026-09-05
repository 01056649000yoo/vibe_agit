import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname, extname } from 'node:path';
import { addBookItems, bookItemFromSource, buildBookSavePayload, sortBookItems, ANTHOLOGY_PRINT_SETTINGS } from '../src/modules/class-agit/anthology/contract.js';
import { assertStudentBooks } from '../src/modules/class-agit/anthology/studentContract.js';
import { normalizeClassAgitParams, getClassAgitBackDestination } from '../src/modules/class-agit/student/navigation.js';
import { buildAnthologyHtml } from '../src/modules/class-agit/anthology/print.js';
import { createShareToken, validShareToken, buildShareUrl, assertPublicGalleryResponse } from '../src/modules/class-agit/public/publicApi.js';
import { previewSources, previewClass } from '../src/dev/fixtures/classAgitFixtures.js';
import { BOOK_PAPERS, GALLERY_THEMES, bookCoverStyle, galleryCoverStyle } from '../src/modules/class-agit/designs.js';
import { TEACHER_GUIDES } from '../src/constants/teacherGuides.js';
const sql = readFileSync('supabase/migrations/20261241_class_agit_internal_publication.sql', 'utf8') + readFileSync('supabase/migrations/20261242_class_agit_120_works.sql', 'utf8') + readFileSync('supabase/migrations/20261243_class_agit_frozen_public_reads.sql', 'utf8');
const fn = (name) => sql.split(`CREATE OR REPLACE FUNCTION public.${name}(`).at(-1)?.split('$$;')[0] || '';
const editionId = '11111111-1111-4111-8111-111111111111';
const work = { id: 'chapter-1', title: '봄', author: '글쓴이', format: 'poem', kindLabel: '시', group: '계절', excerpt: '안녕 봄', blocks: ['안녕\n봄', '또 만나'] };
const book = { title: '우리 책', subtitle: '', introduction: '', class_label: '', term: '', issue_date: '2026-09-05', grouping: 'custom' };
test('문집은 별도 확인 없이 중복 제거·100편 상한을 지키고 서버에 본문을 보내지 않는다', () => {
    const item = bookItemFromSource(previewSources[0], previewClass.id);
    assert.equal('anthologyConfirmed' in item, false);
    const next = addBookItems({ items: [] }, [item, item]); assert.equal(next.items.length, 1);
    const full = { items: Array.from({ length: 100 }, (_, i) => ({ sourceId: String(i) })) };
    assert.throws(() => addBookItems(full, [item]), /100편/);
    const payload = buildBookSavePayload({ ...book, id: editionId, revision: 2, items: [item] });
    assert.deepEqual(Object.keys(payload.items[0]).sort(), ['sourceId', 'sourceRevision']);
    assert.equal(payload.expected_revision, 2);
    assert.deepEqual(sortBookItems([{ author: '하늘' }, { author: '가람' }], 'author').map((i) => i.author), ['가람', '하늘']);
    assert.throws(() => bookItemFromSource({ ...previewSources[0], class_id: 'other' }, previewClass.id));
});
test('학생 서가·차례·전문 응답은 교사 식별자와 전문의 과다 노출을 거부한다', () => {
    const outline = { version: 1, id: editionId, number: 1, book, works: [{ id: work.id, title: work.title, author: work.author, group: work.group }], work: null };
    assert.equal(assertStudentBooks(outline, editionId), outline);
    assert.throws(() => assertStudentBooks({ ...outline, works: [{ ...outline.works[0], blocks: work.blocks }] }, editionId));
    const detailed = { ...outline, works: null, work };
    assert.equal(assertStudentBooks(detailed, editionId, work.id), detailed);
    assert.throws(() => assertStudentBooks({ ...detailed, work: { ...work, studentId: 'private' } }, editionId, work.id));
    assert.throws(() => assertStudentBooks({ ...detailed, work: { ...work, blocks: ['글'.repeat(20001)] } }, editionId, work.id));
});
test('문집 방문 기록에는 판·작품 주소만 남고 뒤로가기는 차례와 서가로 간다', () => {
    const route = normalizeClassAgitParams({ mode: 'chapter', editionId, workId: 'chapter-100', blocks: ['private'] });
    assert.deepEqual(route, { mode: 'chapter', editionId, workId: 'chapter-100' });
    assert.deepEqual(getClassAgitBackDestination(route).params, { mode: 'book', editionId });
    assert.deepEqual(getClassAgitBackDestination({ mode: 'book', editionId }).params, { mode: 'books' });
    assert.equal(normalizeClassAgitParams({ ...route, workId: 'chapter-101' }).mode, 'book');
    assert.equal(normalizeClassAgitParams({ ...route, workId: { toString: () => 'chapter-1' } }).mode, 'book');
});
test('확정판 A4 출력은 공용 장르 렌더러·고정 설정·HTML 이스케이프를 사용한다', async () => {
    const html = await buildAnthologyHtml({ version: 1, id: editionId, number: 1, book: { ...book, print: ANTHOLOGY_PRINT_SETTINGS, works: [{ ...work, title: '<img onerror=alert(1)>', blocks: ['첫 행\n둘째 행', '</script> <script>alert(1)</script>'] }] } });
    assert.match(html, /poem-sheet__stanza/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /<script>|<img onerror/);
    assert.match(html, /data-toc-row="0"/); assert.match(html, /@page \{ size:210mm 297mm; margin:0; \}/);
    assert(sql.includes(`'print','${JSON.stringify(ANTHOLOGY_PRINT_SETTINGS)}'::JSONB`));
    await assert.rejects(buildAnthologyHtml({ version: 1, id: editionId, number: 1, book: { ...book, print: { ...ANTHOLOGY_PRINT_SETTINGS, version: 2 }, works: [work] } }));
});
test('외부 공유 토큰은 256비트 난수이며 주소 fragment에만 들어간다', () => {
    const tokens = new Set(Array.from({ length: 100 }, createShareToken)); assert.equal(tokens.size, 100);
    for (const token of tokens) { assert(validShareToken(token)); const url = new URL(buildShareUrl(token, 'https://example.invalid')); assert.equal(url.pathname, '/exhibition'); assert.equal(url.search, ''); assert.equal(url.hash.slice(1), token); }
    assert.equal(validShareToken('a'.repeat(63)), false);
    assert.equal(validShareToken('x'.repeat(64)), false);
});
test('외부 응답은 목록과 전문의 필드를 제한하고 발행판 불일치를 거절한다', () => {
    const summary = { id: 'published-1', title: '봄', author: '새싹 작가', format: 'poem', kindLabel: '시', excerpt: '봄' };
    const room = { version: 1, title: '우리 전시', introduction: '', publication_no: 1, room: 1, total_count: 1, rooms: [{ number: 1, count: 1 }], items: [summary], work: null };
    assert.equal(assertPublicGalleryResponse(room, 1), room);
    assert.throws(() => assertPublicGalleryResponse({ ...room, class_id: 'private' }, 1));
    const detail = { ...room, items: [], work: { ...summary, blocks: ['봄\n여름'] } };
    assert.equal(assertPublicGalleryResponse(detail, 1, 'published-1', 1), detail);
    assert.throws(() => assertPublicGalleryResponse(detail, 1, 'published-1', 2));
    assert.throws(() => assertPublicGalleryResponse({ version: 1, error: 'rate_limited' }, 0), /잠시/);
});
test('공개 진입점 전체 import 경로에는 인증·앱 셸·저장소·개발 샘플이 없다', () => {
    const visited = new Set();
    const visit = (file) => {
        if (visited.has(file)) return; visited.add(file);
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- 저장소의 import 경로만 순회한다.
        const content = readFileSync(file, 'utf8');
        assert.doesNotMatch(content, /supabaseClient|\/App\.jsx|localStorage|sessionStorage|\/dev\/|get_student_home_bootstrap|analytics/i, file);
        for (const match of content.matchAll(/(?:from\s*|import\s*\()['"]([^'"]+)['"]/g)) {
            if (!match[1].startsWith('.')) continue;
            const child = resolve(dirname(file), match[1]);
            // eslint-disable-next-line security/detect-non-literal-fs-filename -- 위에서 해석한 저장소 import만 검사한다.
            if (existsSync(child) && ['.js', '.jsx'].includes(extname(child))) visit(child);
        }
    };
    visit(resolve('src/modules/class-agit/public/PublicEntry.jsx')); assert(visited.size >= 7);
    const main = readFileSync('src/main.jsx', 'utf8'); assert(main.indexOf("import('./modules/class-agit/public/PublicEntry.jsx')") < main.indexOf("import('./App.jsx')"));
    const api = readFileSync('src/modules/class-agit/public/publicApi.js', 'utf8'); assert.match(api, /method: 'POST', cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer'/);
});
test('서버는 문집 철회 세대와 외부 별도 확인·토큰 해시·만료·제한을 모두 검증한다', () => {
    assert.match(fn('class_agit_book_visible_works_v1'), /i\.consent_id=\(w\.value->>'consentId'\)::UUID/);
    assert.match(fn('run_class_agit_book_action_v1'), /anthologyConfirmed/);
    assert.match(fn('run_class_agit_share_action_v1'), /externalConfirmed/);
    assert.match(fn('run_class_agit_share_action_v1'), /extensions\.digest\(v_token,'sha256'\)/);
    assert.match(fn('run_class_agit_share_action_v1'), /v_external_item,'external','confirmed'/);
    const read = fn('read_public_class_agit_v1'); assert.match(read, /expires_at>statement_timestamp\(\)/); assert.match(read, /class_agit_class_is_allowed_v1/); const budget = fn('take_class_agit_public_read_budget_v1'); assert.match(budget, /'global',3000/); assert.match(budget, /'share:'\|\|v_id,600/);
    assert.doesNotMatch(read, /RAISE EXCEPTION/); assert.match(read, /statement_timeout='3s'/);
    assert.match(fn('manage_class_agit_rollout_v1'), /jsonb_array_length\(p_payload->'class_ids'\)>2/);
    assert.match(fn('manage_class_agit_rollout_v1'), /role='ADMIN' AND is_approved IS TRUE/);
    assert.match(readFileSync('Caddyfile.container', 'utf8'), />Referrer-Policy "no-referrer"/);
});

test('보관하거나 초안이 비어도 기존 외부 주소 관리에 진입할 수 있다', () => {
    const workbench = readFileSync('src/modules/class-agit/teacher/ExhibitionWorkbench.jsx', 'utf8');
    assert.match(workbench, /nextStep === 'share'[\s\S]*await saveDraft\(\); if \(!current\) return/);
    assert.match(workbench, /persistence\.renderShare\(\{ key: shareRevision, onStateChange: setShareState \}\)/);
    const manager = readFileSync('src/modules/class-agit/public/ShareManager.jsx', 'utf8');
    assert.match(manager, /disabled=\{busy \|\| archived \|\| blocked \|\| !items.length/);
    assert.match(manager, /보관한 전시의 기존 공유 주소를 관리할 수 있습니다/);
});

test('전시·문집·이웃 글의 업무 충돌은 PostgREST 재시도 없이 HTTP 409로 끝난다', () => {
    const neighbor = readFileSync('supabase/migrations/20261240_neighbor_publication_matching_hardening.sql', 'utf8');
    for (const migration of [sql, neighbor]) { assert.doesNotMatch(migration, /ERRCODE\s*=\s*'40001'/); assert.match(migration, /ERRCODE\s*=\s*'PT409'/); }
    assert.match(fn('get_class_agit_book_preview_v1'), /ERRCODE='PT409'/);
});
import { prepareShareWorks, hasBlockedShareWorks } from '../src/modules/class-agit/public/sharingPolicy.js';
import { EXHIBITION_RIGHTS } from '../src/modules/class-agit/gallery/rightsNotice.js';

test('외부 공유는 전체 작품의 편집한 제목·지은이를 전송하고 부적격 작품을 조용히 누락하지 않는다', () => {
    const items = Array.from({ length: 120 }, (_, index) => ({ itemId: `item-${index}`, sourceRevision: `revision-${index}`, publicAlias: '옛 별명', title: `작품 ${index}`, author: `지은이 ${index}`, authorName: '등록 이름', included: false }));
    const payload = prepareShareWorks(items);
    assert.equal(payload.length, 120);
    assert.equal(payload[0].author, '지은이 0');
    assert.equal(payload[119].author, '지은이 119');
    assert.deepEqual(Object.keys(payload[0]).sort(), ['author', 'itemId', 'roomId', 'sourceRevision', 'title']);
    assert.doesNotMatch(JSON.stringify(payload), /옛 별명|등록 이름|included/);
    assert.throws(() => prepareShareWorks([]));
    assert.throws(() => prepareShareWorks([...items, items[0]]));
    for (const key of ['revoked', 'unavailable', 'sourceChanged']) {
        const blocked = items.map((item, index) => index === 50 ? { ...item, [key]: true } : item);
        assert.equal(hasBlockedShareWorks(blocked), true);
        assert.throws(() => prepareShareWorks(blocked), /공개할 수 없는 작품/);
    }
});

test('전시 입구와 개인정보처리방침·약관은 같은 작품 보호 문구를 사용한다', () => {
    assert.match(EXHIBITION_RIGHTS.notice, /복제·배포·재게시/);
    assert.match(EXHIBITION_RIGHTS.notice, /도용/);
    assert.match(EXHIBITION_RIGHTS.ownership, /저작자/);
    for (const code of [
        readFileSync('src/modules/class-agit/gallery/GalleryViewer.jsx', 'utf8'),
        readFileSync('src/modules/class-agit/student/StudentEntry.jsx', 'utf8'),
        readFileSync('src/modules/class-agit/public/PublicGallery.jsx', 'utf8'),
    ]) {
        assert.match(code, /<ExhibitionRightsNotice/);
        assert.match(code, /EXHIBITION_RIGHTS.enter/);
    }
    for (const code of [readFileSync('src/components/layout/PrivacyPolicy.jsx', 'utf8'), readFileSync('src/components/layout/TermsOfService.jsx', 'utf8')]) assert.match(code, /EXHIBITION_RIGHTS.notice/);
    for (const code of [readFileSync('src/modules/class-agit/public/ShareManager.jsx', 'utf8'), readFileSync('src/modules/class-agit/teacher/ExhibitionWorkbench.jsx', 'utf8')]) assert.doesNotMatch(code, /외부 공개에 포함|ExternalWorkSettings|changeItem\(/);
});

test('학급 공개 상태는 모든 단계에서 보이고 마지막 단계가 공개로 끝난다', () => {
    const source = readFileSync('src/modules/class-agit/teacher/ExhibitionWorkbench.jsx', 'utf8');
    // 상태 꼬리표가 요약줄에 있어야 4단계 어디서든 비공개인지 알 수 있다.
    const summary = source.slice(source.indexOf('class-agit-workbench-summary'), source.indexOf('class-agit-steps'));
    assert.match(summary, /class-agit-publication-state/);
    assert.match(summary, /비공개 초안 · 학생은 아직 볼 수 없어요/);
    // 마지막 단계 기본 버튼은 공개 전이면 '전시 목록으로'가 아니라 공개여야 한다.
    const footer = source.slice(source.indexOf('class-agit-step-footer'));
    assert.match(footer, /draft.state === 'published' \? <Button[^>]*>전시 목록으로<\/Button>\s*:\s*publishButton\(\)/);
    // 외부 공유 단계에는 학급 공개가 아직 안 됐다는 안내와 그 자리에서 누를 버튼이 있어야 한다.
    const share = source.slice(source.indexOf("panel-share"), source.indexOf('class-agit-step-footer'));
    assert.match(share, /class-agit-publish-reminder/);
    assert.match(share, /아직 학급에 공개하지 않았습니다/);
    assert.match(share, /publishButton\('primary'\)/);
    // 공개 조건은 한 곳에서만 정한다.
    assert.equal(source.match(/const publishBlocked =/g).length, 1);
});
test('학생 화면은 전시관과 문집 서가를 나누어 게시 방식의 차이를 알려 준다', () => {
    const source = readFileSync('src/modules/class-agit/student/StudentEntry.jsx', 'utf8');
    const gallery = source.slice(source.indexOf('class-agit-gallery-heading'), source.indexOf('class-agit-books-heading'));
    assert.match(gallery, /글꽃 전시관/);
    assert.match(gallery, /새로 꾸미면 걸린 글도 바뀌어요/);
    const books = source.slice(source.indexOf('class-agit-books-heading'));
    assert.match(books, /글꽃 책방/);
    assert.match(books, /한번 나온 판은 그대로 남아서/);
    assert.equal((source.match(/class-agit-student-shelf/g) || []).length, 2);
    assert.match(readFileSync('src/modules/class-agit/anthology/StudentBooks.jsx', 'utf8'), /확정한 판이 그대로 남아 있어요/);
    // 문집 표지는 첫 화면에 바로 놓인다 — 서가로 한 번 더 들어가게 하지 않는다.
    assert.match(source, /readBooks/);
    assert.match(books, /\{books\.data && <div className="class-agit-student-exhibitions">/);
    assert.match(books, /class-agit-book-cover/);
    assert.match(books, /bookCoverStyle\(book.design, book.paper\)/);
    assert.match(books, /editionId: book.id/);
    assert.doesNotMatch(books, /mode: 'books'/);
});
test('학생 첫 화면의 전시 표지와 문집 표지는 같은 종이 비율로 같은 칸에 선다', () => {
    const a4 = BOOK_PAPERS[0];
    // 전시 카드가 텅 비어 커 보이지 않도록 문집 표지와 같은 비율·자리를 쓴다.
    for (const theme of GALLERY_THEMES) {
        const style = galleryCoverStyle(theme.id);
        assert.equal(style.aspectRatio, `${a4.width} / ${a4.height}`);
        assert.equal(style['--gallery-wall'], theme.wall);
        assert.ok(style['--gallery-ink'], `${theme.id} 테마의 글자색이 없습니다.`);
    }
    assert.equal(galleryCoverStyle('없는테마').aspectRatio, bookCoverStyle('botanical', 'A4').aspectRatio);
    const source = readFileSync('src/modules/class-agit/student/StudentEntry.jsx', 'utf8');
    assert.match(source, /className="class-agit-exhibition-card" style=\{galleryCoverStyle\(exhibition.theme\)\}/);
    // 소개가 비면 빈 칸을 남기지 않는다.
    assert.match(source, /\{exhibition.introduction && <p>\{exhibition.introduction\}<\/p>\}/);
    const css = readFileSync('src/modules/class-agit/classAgit.css', 'utf8');
    assert.match(css, /\.class-agit-student-shelf \.class-agit-student-exhibitions \{ grid-template-columns/);
});

test('전체 교사 공개 단계는 승인 교사만 열고 학급 모듈 스위치는 그대로 둔다', () => {
    const open = readFileSync('supabase/migrations/20261252_class_agit_open_rollout.sql', 'utf8');
    assert.match(open, /CHECK\(mode IN\('internal','pilot','open','disabled'\)\)/);
    // open 은 지정 목록 없이 열되 승인·담임·삭제 검사는 그대로 통과해야 한다.
    assert.match(open, /r\.mode='open' AND p\.role IN\('ADMIN','TEACHER'\)/);
    assert.match(open, /c\.deleted_at IS NULL AND p\.is_approved IS TRUE/);
    assert.doesNotMatch(open, /r\.mode='open'[^)]*class_agit_pilot_classes/);
    // 학급마다 교사가 켜는 스위치(class_agit_class_is_open_v1)는 건드리지 않는다.
    assert.doesNotMatch(open, /CREATE OR REPLACE FUNCTION public\.class_agit_class_is_open_v1/);
    // 관리 RPC 가 새 단계를 받아야 관리자가 되돌릴 수 있다.
    assert.match(open, /NOT IN\('internal','pilot','open','disabled'\)/);
    assert.match(open, /'mode'='pilot' AND jsonb_array_length\(p_payload->'class_ids'\)=0/);
    assert.match(open, /UPDATE public\.class_agit_rollout SET mode='open'[\s\S]*?WHERE singleton AND mode='pilot'/);
    // 관리자 전용 유지.
    assert.match(open, /관리자만 공개 단계를 관리할 수 있습니다/);
    assert.match(open, /GRANT EXECUTE ON FUNCTION public\.manage_class_agit_rollout_v1\(JSONB\) TO authenticated/);
});
test('공개 단계 화면과 도움말이 전체 교사 공개를 함께 안내한다', () => {
    const ui = readFileSync('src/modules/class-agit/teacher/RolloutManager.jsx', 'utf8');
    assert.match(ui, /<option value="open">전체 교사 공개<\/option>/);
    assert.match(ui, /지정 학급 목록은 그대로 두므로/);
    for (const mode of ['internal', 'pilot', 'open', 'disabled']) assert.ok(ui.includes(`value="${mode}"`), `${mode} 선택지가 없습니다.`);
    const guide = JSON.stringify(TEACHER_GUIDES['class-agit']);
    assert.match(guide, /전체 교사 공개/);
    assert.match(guide, /학급 학생 공개 켜기/);
    // 옛 제한 운영 설명이 남아 있으면 안 된다.
    assert.doesNotMatch(guide, /관리자가 지정한 학급에서 제한 운영/);
});

test('학급 학생 공개 스위치는 전시 준비 1단계 한 곳만 남는다', () => {
    const entry = readFileSync('src/modules/class-agit/teacher/TeacherEntry.jsx', 'utf8');
    // 전체 교사 공개로 바뀌어 '제한 운영' 띠와 중복 체크박스를 걷어냈다.
    assert.doesNotMatch(entry, /제한 운영|class-agit-live-access/);
    assert.doesNotMatch(entry, /학급 학생 공개 켜기/);
    // 스위치 자체는 살아 있어야 한다 — 이게 없으면 학생 입구를 켤 방법이 사라진다.
    assert.match(entry, /setEnabled: changeAccess/);
    assert.match(entry, /'set_enabled'/);
    const workbench = readFileSync('src/modules/class-agit/teacher/ExhibitionWorkbench.jsx', 'utf8');
    assert.equal((workbench.match(/학급 학생 공개 켜기/g) || []).length, 1);
    // 문집만 만드는 교사가 스위치를 못 찾지 않도록 길을 알려 준다.
    assert.match(readFileSync('src/modules/class-agit/anthology/AnthologyManager.jsx', 'utf8'), /글꽃 전시관 → 1 기본 설정 → 학급 학생 공개 켜기/);
    for (const css of [readFileSync('src/modules/class-agit/classAgit.css', 'utf8'), readFileSync('src/modules/class-agit/management.css', 'utf8')]) {
        assert.doesNotMatch(css, /class-agit-live-access/);
    }
});

test('전시관·책방 이름은 좌측 메뉴·도움말·학생 화면이 한 이름으로 맞춰져 있다', () => {
    // 이름을 한 곳만 바꾸고 끝내면 메뉴와 도움말이 갈라진다.
    const nav = readFileSync('src/constants/teacherNav.js', 'utf8');
    assert.match(nav, /label: '글꽃 전시관'/);
    assert.match(nav, /label: '글꽃 책방'/);
    const screens = [readFileSync('src/modules/class-agit/student/StudentEntry.jsx', 'utf8'),
        readFileSync('src/modules/class-agit/anthology/StudentBooks.jsx', 'utf8'),
        readFileSync('src/modules/class-agit/anthology/AnthologyManager.jsx', 'utf8'),
        readFileSync('src/modules/class-agit/gallery/GalleryViewer.jsx', 'utf8')];
    for (const source of screens) assert.doesNotMatch(source, /글 전시관|학급 문집|문집 서가/);
    assert.equal(TEACHER_GUIDES['class-agit'].title, '우리반 아지트 · 글꽃 전시관');
    assert.equal(TEACHER_GUIDES['class-agit-books'].title, '우리반 아지트 · 글꽃 책방');
    assert.doesNotMatch(JSON.stringify(TEACHER_GUIDES['class-agit']), /글 전시관|학급 문집|문집 서가/);
    assert.doesNotMatch(JSON.stringify(TEACHER_GUIDES['class-agit-books']), /글 전시관|학급 문집|문집 서가/);
    // 샘링크에 저장된 라벨은 DB 값이라 그대로 둔다(기존 행과 어긋나면 안 된다).
    assert.match(readFileSync('supabase/migrations/20261251_class_agit_longer_share_slug.sql', 'utf8'), /'아지트 글 전시관'/);
});

test('공개 단계 관리는 교사 화면이 아니라 관리자 대시보드 `기능 공개` 탭에 있다', () => {
    const entry = readFileSync('src/modules/class-agit/teacher/TeacherEntry.jsx', 'utf8');
    // 관리자만 쓰는 화면이 교사 메뉴에 섞여 있지 않아야 한다.
    assert.doesNotMatch(entry, /공개 단계 관리|RolloutManager/);
    const dashboard = readFileSync('src/components/admin/AdminDashboard.jsx', 'utf8');
    assert.match(dashboard, /const ClassAgitRolloutManager = React\.lazy\(\(\) => import\('\.\.\/\.\.\/modules\/class-agit\/teacher\/RolloutManager\.jsx'\)\)/);
    // 이웃 아지트 공개 관리와 같은 `기능 공개` 탭 안에 나란히 둔다.
    const tab = dashboard.slice(dashboard.indexOf("currentTab === 'rollout'"), dashboard.indexOf("currentTab === 'settings'"));
    assert.match(tab, /<AdminNeighborAgitPanel \/>/);
    assert.match(tab, /<ClassAgitRolloutManager \/>/);
    assert.match(dashboard, /\{ id: 'rollout', label: '기능 공개' \}/);
    // 돌아갈 곳이 없는 대시보드에서는 나가기 버튼을 숨긴다.
    assert.match(readFileSync('src/modules/class-agit/teacher/RolloutManager.jsx', 'utf8'), /\{onExit && <Button variant="outline" type="button" disabled=\{busy\} onClick=\{onExit\}>관리 화면으로<\/Button>\}/);
});

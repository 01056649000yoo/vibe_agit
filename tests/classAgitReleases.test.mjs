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

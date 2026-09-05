import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createExhibitionDraft, editExhibition, createGalleryPresentation } from '../src/modules/class-agit/exhibitionDraft.js';
import { getSourceExclusion, presentSource } from '../src/modules/class-agit/sourceContract.js';
import { GALLERY_ROOM, arrangeGalleryRooms, getGallerySlot } from '../src/modules/class-agit/gallery/roomLayout.js';
import { CLASS_AGIT_LIMITS } from '../src/modules/class-agit/policy.js';
import { classAgitManifest } from '../src/modules/class-agit/manifest.js';
import { validateManifest } from '../src/modules/types.js';
import { poemMissionType } from '../src/modules/writing/mission-types/poem/manifest.js';

const source = (index = 1, overrides = {}) => ({
    id: `post-${index}`, class_id: 'our-class', student_id: `student-${index}`, student_name: `등록이름${index}`,
    source_revision: `revision-${index}`, writing_context: 'assignment', is_submitted: true, is_confirmed: true,
    title: `작품 ${index}`, content: '첫 문단입니다.\n\n둘째 문단입니다.', ...overrides,
});
const add = (draft, item) => editExhibition(draft, { type: 'add', source: item, classAcknowledged: true });
const makeDraft = (count) => Array.from({ length: count }, (_, i) => source(i + 1)).reduce(add, createExhibitionDraft('our-class'));

test('class-agit은 기본 OFF이며 홈 요약 신호로 학생 카드를 제한한다', () => {
    assert.deepEqual(validateManifest(classAgitManifest), []);
    assert.equal(classAgitManifest.available, true);
    assert.equal(classAgitManifest.defaultEnabled, false);
    assert.equal(classAgitManifest.core, false);
    assert.equal(typeof classAgitManifest.studentEntry, 'function');
    assert.equal(classAgitManifest.studentDashboard.visibilityKey, 'class_agit_available');
    assert.deepEqual(classAgitManifest.performance, { home: 'summary', load: 'on-open', writes: 'rpc', realtime: 'none', maxInitialRows: 100 });
    const files = readdirSync('src/modules/class-agit', { recursive: true }).filter((path) => /\.(jsx?|css)$/.test(path));
    for (const file of files) {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- 고정 모듈 폴더 안의 저장소 파일만 검사한다.
        const text = readFileSync(`src/modules/class-agit/${file}`, 'utf8');
        assert.doesNotMatch(text, /setInterval|postgres_changes|localStorage|sessionStorage|\/dev\/|fixtures/, file);
        if (file !== 'public/publicApi.js') assert.doesNotMatch(text, /fetch\(/, file);
        if (!file.startsWith('api/')) assert.doesNotMatch(text, /supabase|\.rpc\(/, file);
    }
    assert.match(readFileSync('src/modules/registry.js', 'utf8'), /classAgitManifest/);
});

test('후보 선정은 다른 학급·비공개·미확인·회수·사진 장르·버전 없는 글을 거절한다', () => {
    assert.equal(getSourceExclusion(source(), 'our-class'), '');
    for (const override of [
        { class_id: 'other-class' }, { is_submitted: false }, { is_confirmed: false }, { is_returned: true },
        { recalled_at: 'now' }, { deleted_at: 'now' }, { visibility: 'private' },
        { writing_context: 'self', visibility: 'class' }, { input_template: 'report' },
        { has_images: true }, { content: ' \n\n ' }, { source_revision: null },
        { structured_content: { unrecognized: 'data' } }, { input_template: 'unknown-genre' },
        { input_template: 'poem', structured_content: { template: 'report', stanzas: ['사진 자료'] } },
    ]) {
        const item = source(1, override);
        assert.ok(getSourceExclusion(item, 'our-class'), JSON.stringify(override));
        assert.throws(() => add(makeDraft(0), item), Error, JSON.stringify(override));
    }
});

test('시는 기존 장르 계약으로 연·행을 보존하고 평문 호환도 지킨다', () => {
    const structured_content = { template: 'poem', stanzas: ['봄\r\n작은 잎', '', '나무\n느린 하루'] };
    const poem = source(1, { input_template: 'poem', structured_content, content: '표시하지 않을 평문' });
    const result = presentSource(poem);
    assert.equal(getSourceExclusion(poem, 'our-class'), '');
    assert.deepEqual(result.blocks, ['봄\n작은 잎', '나무\n느린 하루']);
    assert.deepEqual(result.blocks, poemMissionType.exhibition.getBlocks({ structuredContent: structured_content, content: poem.content }));
    assert.equal(result.format, 'poem');
    assert.deepEqual(presentSource(source(2, { input_template: 'poem', content: '첫 행\n둘째 행\n\n다음 연' })).blocks, ['첫 행\n둘째 행', '다음 연']);
});

test('학급 수록 확인은 필수이고 같은 글은 중복 선정할 수 없다', () => {
    const draft = makeDraft(0);
    assert.throws(() => editExhibition(draft, { type: 'add', source: source() }), /수록 의사/);
    const selected = add(draft, source());
    assert.throws(() => add(selected, source()), /이미/);
    assert.equal(draft.items.length, 0);
    assert.deepEqual(selected.items[0].scopes, { class: true, anthology: false, external: false });
});

test('학급 전시 120편 상한은 121번째 추가를 막고 삭제 뒤 재선정은 허용한다', () => {
    const draft = makeDraft(CLASS_AGIT_LIMITS.maxWorks);
    assert.equal(draft.items.length, CLASS_AGIT_LIMITS.maxWorks);
    assert.throws(() => add(draft, source(121)), /120편/);
    const removed = editExhibition(draft, { type: 'remove', sourceId: 'post-1' });
    assert.equal(add(removed, source(121)).items.length, 120);
    assert.equal(draft.items.length, 120);
});

test('오래된 revision 편집은 거절하고 제목·소개 길이를 제한한다', () => {
    const original = makeDraft(1);
    const edited = editExhibition(original, { type: 'metadata', title: '새 전시', introduction: '소개' });
    assert.equal(edited.revision, original.revision + 1);
    assert.notEqual(original.title, edited.title);
    assert.throws(() => editExhibition(edited, { type: 'remove', sourceId: 'post-1' }, original.revision), /변경/);
    assert.throws(() => editExhibition(edited, { type: 'metadata', title: '가'.repeat(81), introduction: '' }), /너무/);
    assert.throws(() => editExhibition(edited, { type: 'metadata', title: '', introduction: '가'.repeat(241) }), /너무/);
});

test('순서를 옮기면 12·13번째 글이 방 경계를 넘어가고 원래 초안은 유지한다', () => {
    const original = makeDraft(13);
    const moved = editExhibition(original, { type: 'move', sourceId: 'post-13', direction: -1 });
    const rooms = arrangeGalleryRooms(moved.items);
    assert.equal(rooms[0].works[11].sourceId, 'post-13');
    assert.equal(rooms[1].works[0].sourceId, 'post-12');
    assert.equal(original.items[12].sourceId, 'post-13');
    assert.equal(editExhibition(original, { type: 'move', sourceId: 'post-1', direction: -1 }), original);
    assert.equal(editExhibition(original, { type: 'move', sourceId: 'post-13', direction: 1 }), original);
});

test('0·1·12·60·120편은 각각 0·1·1·5·10개 방으로 나누고 작품을 중복하지 않는다', () => {
    for (const [count, lengths] of [[0, []], [1, [1]], [12, [12]], [60, [12, 12, 12, 12, 12]], [120, Array(10).fill(12)]]) {
        const works = makeDraft(count).items;
        const rooms = arrangeGalleryRooms(works);
        assert.deepEqual(rooms.map((room) => room.works.length), lengths);
        assert.deepEqual(rooms.flatMap((room) => room.works), works);
    }
    assert.throws(() => arrangeGalleryRooms(Array(121)), /120편/);
});

test('모든 액자는 벽 안의 겹치지 않는 슬롯 하나를 사용한다', () => {
    const slots = Array.from({ length: 12 }, (_, i) => getGallerySlot(i));
    for (const [index, slot] of slots.entries()) {
        assert.ok(slot.x >= .08 * GALLERY_ROOM.width);
        assert.ok(slot.y > .1 * GALLERY_ROOM.height);
        assert.ok(slot.x + slot.width <= .92 * GALLERY_ROOM.width);
        assert.ok(slot.y + slot.height <= .83 * GALLERY_ROOM.height);
        for (const other of slots.slice(index + 1)) {
            assert.ok(slot.x + slot.width <= other.x || other.x + other.width <= slot.x || slot.y + slot.height <= other.y || other.y + other.height <= slot.y);
        }
    }
    for (const index of [-1, 12, 1.5]) assert.throws(() => getGallerySlot(index), /위치/);
});

test('외부 수록은 별도 확인한 작품만 가림 이름으로 투영하고 내부 식별자를 제외한다', () => {
    const original = makeDraft(2);
    assert.equal(createGalleryPresentation(original, 'external').works.length, 0);
    const draft = editExhibition(original, { type: 'external', sourceId: 'post-2', enabled: true, alias: '  파란 나무  ' });
    const external = createGalleryPresentation(draft, 'external');
    assert.equal(external.works.length, 1);
    assert.equal(external.works[0].author, '파란 나무');
    assert.equal(createGalleryPresentation(draft).works[1].author, '등록이름2');
    assert.deepEqual(Object.keys(external.works[0]).sort(), ['id', 'title', 'author', 'format', 'kindLabel', 'excerpt', 'blocks'].sort());
    assert.doesNotMatch(JSON.stringify(external), /등록이름|student-|post-|revision-/);
    assert.equal(draft.items[1].scopes.anthology, false);
    assert.equal(original.items[1].scopes.external, false);
    const revoked = editExhibition(draft, { type: 'external', sourceId: 'post-2', enabled: false, alias: '파란 나무' });
    assert.equal(createGalleryPresentation(revoked, 'external').works.length, 0);
    assert.throws(() => createGalleryPresentation(draft, 'admin'), /범위/);
    for (const alias of ['', '   ', '가'.repeat(31)]) assert.throws(() => editExhibition(draft, { type: 'external', sourceId: 'post-1', enabled: true, alias }), /가림 이름/);
});

test('미리보기 본문은 초안·원본과 독립적인 복사본이다', () => {
    const item = source();
    const draft = add(makeDraft(0), item);
    const view = createGalleryPresentation(draft);
    item.content = '원본 변경';
    draft.items[0].blocks[0] = '초안 변경';
    assert.equal(view.works[0].blocks[0], '첫 문단입니다.');
    view.works[0].blocks.push('화면 변경');
    assert.equal(draft.items[0].blocks.length, 2);
});

test('공통 읽기 창은 원근 장면 밖의 dialog이고 DOM 목록·동작 줄이기를 제공한다', () => {
    const reader = readFileSync('src/modules/class-agit/gallery/ArtworkReader.jsx', 'utf8');
    assert.match(reader, /<ModalPortal><dialog/);
    assert.match(reader, /showModal\(\)/);
    assert.match(reader, /onCancel=/);
    assert.match(reader, /onKeyDown=\{keepFocusInside\}/);
    assert.match(reader, /event\.shiftKey/);
    assert.match(reader, /opener\.focus/);
    assert.match(reader, /Math\.max\(16/);
    assert.doesNotMatch(reader, /dangerouslySetInnerHTML/);
    const viewer = readFileSync('src/modules/class-agit/gallery/GalleryViewer.jsx', 'utf8');
    assert.match(viewer, /목록 보기/);
    const css = readFileSync('src/modules/class-agit/classAgit.css', 'utf8');
    assert.match(css, /prefers-reduced-motion: reduce/);
    assert.match(css, /scroll-snap-type: x mandatory/);
    assert.match(css, /white-space: pre-wrap/);
});

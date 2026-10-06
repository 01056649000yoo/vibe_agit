import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { BOOK_PAPERS } from '../src/modules/class-agit/designs.js';
import {
    BOOK_INNER_STYLES, COVER_MAX_BYTES, COVER_MIME_TYPES, COVER_SPECS,
    checkCoverImage, coverObjectPath, coverSource, coverSpec, getInnerStyle
} from '../src/modules/class-agit/anthology/coverImage.js';

// 글꽃 책방 — 선생님이 만든 표지 그림(2026-10-06, docs/CLASS_AGIT_COVER_UPLOAD_PLAN.md).

const png = (mb = 1) => ({ type: 'image/png', size: Math.round(mb * 1024 * 1024) });
const migration = await readFile('supabase/migrations/20261369_class_agit_cover_image.sql', 'utf8');

test('종이별 규격은 BOOK_PAPERS 에서 계산하고(300dpi 권장·150dpi 최소), 서버 SQL 의 종이 크기와 같다', () => {
    assert.deepEqual(coverSpec('A4').recommended, { width: 2480, height: 3508 });
    assert.deepEqual(coverSpec('A4').minimum, { width: 1240, height: 1754 });
    assert.deepEqual(coverSpec('A5').recommended, { width: 1748, height: 2480 });
    assert.deepEqual(coverSpec('B5').recommended, { width: 2150, height: 3035 });
    assert.equal(COVER_SPECS.length, BOOK_PAPERS.length);
    for (const paper of BOOK_PAPERS) {
        assert.match(migration, new RegExp(`\\('${paper.id}', ${paper.width}(::NUMERIC)?, ${paper.height}(::NUMERIC)?\\)`), `${paper.id} 크기가 SQL 과 다름`);
    }
    // 용량·형식도 버킷·서버 확인과 같다.
    assert.equal(COVER_MAX_BYTES, 5242880);
    assert.match(migration, /file_size_limit, allowed_mime_types\)\s*VALUES \('class-agit-covers', 'class-agit-covers', FALSE, 5242880, ARRAY\['image\/jpeg', 'image\/png'\]\)/);
    assert.deepEqual([...COVER_MIME_TYPES], ['image/jpeg', 'image/png']);
    assert.match(migration, /abs\(\(v_width::NUMERIC \/ v_height\) \/ \(v_pw \/ v_ph\) - 1\) > 0\.01/);
    assert.match(migration, /v_width < round\(v_pw \/ 25\.4 \* 150\)/);
});

test('규격에 맞는 그림만 통과하고, 틀리면 무엇이 틀렸는지 말한다', () => {
    assert.equal(checkCoverImage(png(), { width: 2480, height: 3508 }, 'A4').ok, true);
    assert.equal(checkCoverImage(png(), { width: 2480, height: 3508 }, 'A4').warning, '');
    // 최소~권장 사이: 받되 흐릿할 수 있다고 알림
    const small = checkCoverImage(png(), { width: 1240, height: 1754 }, 'A4');
    assert.equal(small.ok, true);
    assert.match(small.warning, /흐릿/);
    // 비율 ±1% 경계
    assert.equal(checkCoverImage(png(), { width: 2480, height: 3540 }, 'A4').ok, true, '0.9% 차이는 통과');
    const square = checkCoverImage(png(), { width: 1000, height: 1000 }, 'A4');
    assert.equal(square.ok, false);
    assert.match(square.error, /210:297 비율/);
    assert.equal(checkCoverImage(png(), { width: 2480, height: 3600 }, 'A4').ok, false, '2.6% 차이는 거절');
    // A4 비율 그림을 A5 문집에 올리면? A4·A5 는 거의 같은 비율이라 통과(크기만 본다)
    assert.equal(checkCoverImage(png(), { width: 1748, height: 2480 }, 'A5').ok, true);
    // B5(182:257)와 A4(210:297)는 비율이 0.2%만 달라 통과한다 — 대신 A4 권장보다 작아 흐릿 경고
    const b5OnA4 = checkCoverImage(png(), { width: 2150, height: 3035 }, 'A4');
    assert.equal(b5OnA4.ok, true);
    assert.match(b5OnA4.warning, /흐릿/);
    assert.equal(checkCoverImage(png(), { width: 3508, height: 2480 }, 'A4').ok, false, '가로로 눕힌 그림은 거절');
    // 너무 작음
    assert.match(checkCoverImage(png(), { width: 620, height: 877 }, 'A4').error, /너무 작아요/);
    // 형식·용량
    assert.match(checkCoverImage({ type: 'image/webp', size: 1000 }, { width: 2480, height: 3508 }, 'A4').error, /JPG 또는 PNG/);
    assert.match(checkCoverImage({ type: 'image/gif', size: 1000 }, { width: 2480, height: 3508 }, 'A4').error, /JPG 또는 PNG/);
    assert.match(checkCoverImage(png(5.1), { width: 2480, height: 3508 }, 'A4').error, /5MB 이하/);
    assert.equal(checkCoverImage(png(5), { width: 2480, height: 3508 }, 'A4').ok, true, '딱 5MB 는 통과');
    assert.match(checkCoverImage(png(), null, 'A4').error, /크기를 읽지 못했어요/);
    assert.match(checkCoverImage(null, null, 'A4').error, /골라 주세요/);
});

test('표지가 그림인지 디자인인지는 coverSource 하나로 정하고, 종이가 다르면 그림을 쓰지 않는다', () => {
    const image = { path: 'c/b/1-x.png', width: 2480, height: 3508, paper: 'A4', inner_style: 'warm' };
    assert.equal(coverSource({ paper_format: 'A4', cover_image: image }).kind, 'image');
    assert.equal(coverSource({ paper_format: 'A4', cover_image: image }).innerStyle.id, 'warm');
    assert.equal(coverSource({ print: { paper: 'A4' }, cover_image: image }).kind, 'image', '확정판 기록');
    assert.equal(coverSource({ paper: 'A4', cover_image: image }).kind, 'image', '서가 목록');
    assert.equal(coverSource({ paper_format: 'A5', cover_image: image }).kind, 'design', '편집 중 종이를 바꾸면 디자인 표지');
    assert.equal(coverSource({ paper_format: 'A4', cover_image: null }).kind, 'design');
    assert.equal(coverSource(null).kind, 'design');
    assert.equal(getInnerStyle('nope').id, 'plain');
    assert.match(coverObjectPath('c1', 'b1', 'image/png', 'abc-123'), /^c1\/b1\/\d+-abc-123\.png$/);
    assert.match(coverObjectPath('c1', 'b1', 'image/jpeg', 'x'), /\.jpg$/);
    // 서버 경로 규칙(무작위 부분 8~80자)과 맞는다
    const name = coverObjectPath('c', 'b', 'image/png', '0123456789abcdef0123456789abcdef').split('/')[2];
    assert.match(name, /^[A-Za-z0-9_-]{8,80}[.](jpg|png)$/);
});

test('속지 스타일은 세 가지, 바탕은 모두 흰 종이(색은 제목·선·쪽 번호만)', () => {
    assert.deepEqual(BOOK_INNER_STYLES.map((s) => s.id), ['plain', 'warm', 'fresh']);
    assert.deepEqual(BOOK_INNER_STYLES.map((s) => s.label), ['단정한', '따뜻한', '산뜻한']);
    for (const style of BOOK_INNER_STYLES) assert.equal(style.background, undefined, '속지 바탕색을 두지 않는다');
    assert.match(migration, /v_style NOT IN \('plain', 'warm', 'fresh'\)/);
});

test('표지를 그리는 여섯 곳이 모두 같은 그림 표지 부품·판단을 쓴다', async () => {
    const sites = {
        'src/modules/class-agit/anthology/BookCover.jsx': /<CoverImageFill book=\{book\} \/>/,
        'src/modules/class-agit/anthology/StudentBooks.jsx': /<CoverImageFill book=\{book\} \/>/,
        'src/modules/class-agit/student/StudentEntry.jsx': /<CoverImageFill book=\{book\} \/>/,
        'src/modules/community/neighbor-agit/books/StudentBooksPanel.jsx': /<CoverImageFill book=\{item\} \/>/,
        'src/modules/community/neighbor-agit/books/TeacherBooksPanel.jsx': /<CoverImageFill book=\{book\} \/>/,
        'src/modules/class-agit/anthology/print.js': /coverSource\(book\)/,
        'src/modules/class-agit/anthology/googleDocExport.js': /coverSource\(book\)/,
    };
    for (const [file, pattern] of Object.entries(sites)) {
        const source = await readFile(file, 'utf8');
        assert.match(source, pattern, `${file} 가 그림 표지를 모름`);
        if (file.endsWith('.jsx')) assert.match(source, /coverImageProps\((book|item)\)/, `${file} 가 글자 숨김 속성을 안 붙임`);
    }
    const print = await readFile('src/modules/class-agit/anthology/print.js', 'utf8');
    assert.match(print, /imageCover \? inner\.heading/, '그림 표지면 속지 제목 색은 속지 스타일');
    assert.match(print, /await import\('\.\.\/api\/coverImageApi\.js'\)/, '브라우저 전용 모듈은 그림 표지일 때만');
});

test('서버: 종이를 바꿔 저장하면 그림 표지를 끄고, 확정판 기록·서가·도서관에 표지 그림이 실린다', () => {
    assert.match(migration, /UPDATE public\.class_agit_books SET cover_image=NULL\s+WHERE class_id=p_class_id AND id=v_book\.id AND cover_image IS NOT NULL AND cover_image->>'paper' IS DISTINCT FROM paper_format/);
    assert.match(migration, /'owner_student_name',v_owner,'cover_image',v_book\.cover_image,/);
    assert.match(migration, /e\.snapshot->'cover_image' AS cover_image/);
    assert.match(migration, /'cover_image', edition\.snapshot->'cover_image',/);
    assert.match(migration, /'cover_image', book\.cover_image/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.class_agit_set_cover_image_v1\(UUID, TEXT, JSONB\) FROM PUBLIC, anon, authenticated;/);
    assert.match(migration, /CREATE POLICY "Class_Agit_Covers_Insert_V1" ON storage\.objects FOR INSERT TO authenticated/);
});

test('그림 표지여도 여는 글·차례·간지는 그대로 이어 붙는다(10-06 실제 인쇄 점검에서 차례가 빠졌던 것)', async () => {
    const print = await readFile('src/modules/class-agit/anthology/print.js', 'utf8');
    assert.match(print, /const coverHtml = imageCover \?/);
    assert.match(print, /const front = `\$\{coverHtml\}\n\$\{book\.introduction \?/);
    assert.match(print, /\.pdf-entry__rule\{background:\$\{inner\.rule\}\}/, '작품 제목 아래 선은 background 로 칠해진다');
});

test('구글 문서: 그림 표지면 첫 요청이 그림 넣기이고 제목 글자는 넣지 않는다', async () => {
    const { buildAnthologyDocRequests } = await import('../src/modules/class-agit/anthology/googleDocExport.js');
    const edition = { version: 1, id: 'e1', number: 2, book: {
        title: '우리 반 가을 문집', subtitle: '부제', class_label: '4학년 1반', issue_date: '2026-10-06', book_type: 'class', grouping: 'custom',
        print: { paper: 'A4', design: 'botanical', layout: 'work-per-page', body_pt: 12, poem_pt: 14, version: 2 },
        cover_image: { path: 'c/b/1-x.png', width: 2480, height: 3508, paper: 'A4', inner_style: 'plain' },
        works: [{ title: '운동회', author: '김하나', format: 'prose', blocks: ['첫 문단'] }],
    } };
    const withImage = buildAnthologyDocRequests(edition, { coverImageUri: 'https://example.test/cover.png' }).requests;
    assert.ok(withImage[0].insertInlineImage, '첫 요청이 그림 넣기');
    assert.equal(withImage[0].insertInlineImage.uri, 'https://example.test/cover.png');
    assert.equal(withImage[0].insertInlineImage.objectSize.height.magnitude, Math.round(451 * 3508 / 2480));
    assert.ok(!withImage.some((r) => r.insertText?.text === '우리 반 가을 문집\n' && withImage.indexOf(r) < 6), '표지 자리에 제목 글자를 넣지 않음');
    // 주소를 못 받으면 지금처럼 글자 표지
    const fallback = buildAnthologyDocRequests(edition, { coverImageUri: '' }).requests;
    assert.ok(!fallback.some((r) => r.insertInlineImage));
    assert.ok(fallback.some((r) => r.insertText?.text === '우리 반 가을 문집\n'));
});

test('판형·디자인 단계 표지 칸 안에서 캔바 규격 안내를 지금 판형 숫자로 바로 본다', async () => {
    const panel = await readFile('src/modules/class-agit/anthology/CoverImagePanel.jsx', 'utf8');
    assert.match(panel, /<GuideInfoButton variant="help"[^>]*캔바로 만드는 법/);
    assert.match(panel, /const \{ width, height \} = spec\.recommended;/, '숫자는 규격 함수에서');
    for (const step of ['사용자 지정 크기', '단위를 <b>px</b>', '공유</b> → <b>다운로드', '<b>PDF</b>로는 받지 마세요', '5MB']) assert.ok(panel.includes(step), step);
    const guides = await readFile('src/constants/teacherGuides.js', 'utf8');
    assert.match(guides, /캔바로 만드는 법/);
});

test('보관 규칙: 문집이 있는 동안 보관하고, 문집을 지우면 그 문집의 표지 그림도 지운다(즉시 + 매주 정리)', async () => {
    const release = await readFile('src/modules/class-agit/api/releaseApi.js', 'utf8');
    assert.match(release, /if \(action === 'delete' && payload\?\.book_id\) await removeBookCovers\(classId, payload\.book_id\)/);
    const api = await readFile('src/modules/class-agit/api/coverImageApi.js', 'utf8');
    assert.match(api, /export async function removeBookCovers\(classId, bookId\)/);
    const cleanup = await readFile('supabase/migrations/20261370_class_agit_cover_cleanup.sql', 'utf8');
    assert.match(cleanup, /GRANT EXECUTE ON FUNCTION public\.class_agit_orphan_cover_paths_v1\(\) TO service_role;/);
    assert.match(cleanup, /REVOKE ALL ON FUNCTION public\.class_agit_orphan_cover_paths_v1\(\) FROM PUBLIC, anon, authenticated;/);
    const select = await readFile('supabase/migrations/20261371_class_agit_cover_teacher_select.sql', 'utf8');
    assert.match(select, /can_access_class_agit_cover_v1\(name, FALSE\) OR public\.can_delete_class_agit_cover_v1\(name\)/, '지우기 전 보기 확인을 담당 교사가 통과');
    const sweep = await readFile('scripts/class-agit-cover-sweep.mjs', 'utf8');
    assert.match(sweep, /class_agit_orphan_cover_paths_v1/);
    assert.match(sweep, /storage\/v1\/object\/class-agit-covers`, \{ method: 'DELETE'/, 'DB 줄이 아니라 저장소 기능으로 지움(파일 방식)');
    assert.doesNotMatch(sweep, /console\.log\([^)]*KEY/, 'service_role 키를 출력하지 않음');
    const plist = await readFile('ops/launchd/com.agit.class-agit-cover-sweep.plist', 'utf8');
    assert.match(plist, /scripts\/class-agit-cover-sweep\.mjs/);
    assert.match(plist, /<key>Weekday<\/key>\s*<integer>0<\/integer>/);
});

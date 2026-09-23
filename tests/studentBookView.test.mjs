import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { assertStudentBooks } from '../src/modules/class-agit/anthology/studentContract.js';

/*
 * 학생 문집: 작품 한 편이 안 열리던 문제 고침 + "책으로 펼쳐 읽기"(교사 미리보기와 같은 렌더러) — 2026-09-23 `20261338`.
 */
const [sql, frame, studentBooks, neighborPanel, releaseApi, booksApi] = await Promise.all([
    readFile('supabase/migrations/20261338_student_book_print_view.sql', 'utf8'),
    readFile('src/modules/class-agit/anthology/BookPreviewFrame.jsx', 'utf8'),
    readFile('src/modules/class-agit/anthology/StudentBooks.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/books/StudentBooksPanel.jsx', 'utf8'),
    readFile('src/modules/class-agit/api/releaseApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/books/booksApi.js', 'utf8')
]);

test('원글 id(sourceId)가 실린 작품 응답은 학생 검사에 걸린다 — 그래서 서버에서 뺀다', () => {
    const work = { id: 'chapter-1', title: '제목', author: '글쓴이', format: 'prose', kindLabel: '글', excerpt: '앞', blocks: ['본문'], group: '' };
    const book = { title: '문집', subtitle: '', cover_kicker: '', introduction: '', class_label: '', term: '', issue_date: '2026-09-23', grouping: 'custom', design: 'notebook', paper: 'A4', book_type: 'class', page_breaks: [] };
    const response = (w) => ({ version: 1, id: 'ed', number: 1, book, works: null, work: w });
    assert.throws(() => assertStudentBooks(response({ ...work, sourceId: '0a82fde6-2389-4836-a125-e4e6ef9ae7b5' }), 'ed', 'chapter-1'));
    assert.doesNotThrow(() => assertStudentBooks(response(work), 'ed', 'chapter-1'));
    // 우리 반 서가·모두의 아지트 작품 한 편 응답 모두 원글 id 를 뺀다.
    assert.match(sql, /SELECT \(snapshot - 'sourceId' - 'studentId'\)\|\|jsonb_build_object\('id',work_id\) INTO v_work/);
    assert.match(sql, /SELECT \(visible\.snapshot - 'sourceId' - 'studentId'\) \|\| jsonb_build_object\('id', visible\.work_id\) INTO v_work/);
});

test('책 모양 응답: 철회 작품 제외, 원글 id 대신 차례 id, 교사가 정한 쪽 넘김은 차례 id 로 옮긴다', () => {
    assert.match(sql, /class_agit_book_visible_works_v1\(p_class_id, p_edition_id\)/);
    assert.match(sql, /jsonb_build_object\('id', visible\.work_id, 'sourceId', visible\.work_id\)/);
    assert.match(sql, /edition\.snapshot->'page_breaks' \? source_map\.source_id/);
    assert.match(sql, /- 'owner_student_id' - 'page_breaks'\) \|\| v_works/);
    // 읽는 자격은 각자의 기존 판정.
    assert.match(sql, /neighbor_book_is_readable_v1\(p_shared_book_id, p_space_id\)/);
    assert.match(sql, /edition\.student_visible\s+AND \(book\.book_type = 'class' OR book\.owner_student_id = v_student\)/);
});

test('교사 미리보기와 같은 렌더러를 앱 안 틀에 그린다(새 창 없이)', () => {
    assert.match(frame, /import\('\.\/print\.js'\)/);
    assert.match(frame, /renderAnthologyWindow\(target, edition\)/);
    assert.match(frame, /assertBookEdition\(edition\)/);
    assert.doesNotMatch(frame, /window\.open/);
    assert.match(releaseApi, /call\('get_my_class_agit_book_print_v1'/);
    assert.match(booksApi, /call\('get_neighbor_shared_book_print_v1'/);
    for (const screen of [studentBooks, neighborPanel]) {
        assert.match(screen, /<StudentBookReader /);
    }
});

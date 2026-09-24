import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 🏛️ 문집 도서관 + 방문록(교사 승인) — 2026-09-23 `20261335`.
 * 동작 전체는 `npm run simulate:neighbor-agit`(B0~B22)가 실제 역할로 확인한다. 여기서는 계약이 조용히
 * 풀리지 않게 핵심 문장을 지킨다.
 */
const [sql, booksApi, teacherPanel, studentPanel, teacherEntry, studentEntry, manifest, tabs, guides, simulation] = await Promise.all([
    readFile('supabase/migrations/20261335_neighbor_book_share_guestbook.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/books/booksApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/books/TeacherBooksPanel.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/books/StudentBooksPanel.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/manifest.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/activityTypes.js', 'utf8'),
    readFile('src/constants/teacherGuides.js', 'utf8'),
    readFile('tests/sql/neighbor_agit_simulation.sql', 'utf8')
]);

const fn = (name) => {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
    assert.ok(start >= 0, `${name} 함수가 없습니다.`);
    return sql.slice(start, sql.indexOf('$$;', start));
};

test('표는 브라우저에서 직접 못 건드리고, 원본은 옮기지 않고 가리킨다', () => {
    assert.match(sql, /ALTER TABLE public\.neighbor_shared_books ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /ALTER TABLE public\.neighbor_book_guestbook ENABLE ROW LEVEL SECURITY/);
    assert.match(sql, /REVOKE ALL ON public\.neighbor_shared_books, public\.neighbor_book_guestbook FROM PUBLIC, anon, authenticated, service_role/);
    assert.match(sql, /edition_id UUID NOT NULL REFERENCES public\.class_agit_book_editions\(id\) ON DELETE CASCADE/);
});

test('소개할 수 있는 책: 우리 반 학급 문집 · 보관 안 됨 · 학생에게 보이는 판', () => {
    const latest = fn('neighbor_latest_book_edition_v1');
    assert.match(latest, /edition\.student_visible AND NOT book\.archived AND book\.book_type = 'class'/);
    const readable = fn('neighbor_book_is_readable_v1');
    assert.match(readable, /membership\.status = 'active'/);
    assert.match(readable, /NOT book\.archived AND book\.book_type = 'class' AND edition\.student_visible/);
    // 다른 반 책을 덮어쓸 수 없다.
    assert.match(fn('share_neighbor_book_v1'), /WHERE neighbor_shared_books\.class_id = p_actor_class_id/);
});

test('읽을 때마다 철회를 거르고, 학생 식별값은 내보내지 않는다', () => {
    const read = fn('get_neighbor_shared_book_v1');
    assert.match(read, /class_agit_book_visible_works_v1\(v_shared\.class_id, v_edition\.id\)/);
    assert.match(read, /- 'owner_student_id' - 'owner_student_name'/);
    assert.match(read, /assert_neighbor_student_access_v1\(p_space_id\)/);
});

test('방문록: 쓰면 확인 대기, 문집 주인 반 교사만 올린다, 고쳐 쓰면 다시 대기', () => {
    const save = fn('save_neighbor_guestbook_v1');
    assert.match(save, /VALUES \(p_shared_book_id, p_space_id, v_class_id, v_student_id, v_content, 'pending'\)/);
    assert.match(save, /content = EXCLUDED\.content, status = 'pending'/);
    const review = fn('review_neighbor_guestbook_v1');
    assert.match(review, /v_shared\.class_id IS DISTINCT FROM p_actor_class_id/);
    // 학생에게는 올라간 것만 보인다.
    assert.match(fn('get_neighbor_shared_book_v1'), /g\.status = 'approved'/);
});

test('승인 알림: 쓴 학생 1건 · 글이 실린 학생 책마다 하루 1건 · 거절하면 거둔다', () => {
    const review = fn('review_neighbor_guestbook_v1');
    assert.match(review, /'neighbor\.guestbook_approved'/);
    assert.match(review, /'neighbor\.guestbook_received'/);
    assert.match(review, /format\('neighbor-guestbook-book:%s:%s', v_shared\.id, to_char\(NOW\(\) AT TIME ZONE 'Asia\/Seoul', 'YYYYMMDD'\)\)/);
    assert.match(review, /item\.revoked_at IS NULL/);
    assert.match(review, /p_action = 'reject' THEN\s+DELETE FROM public\.student_notification_events/);
    // 알림이 실패해도 승인은 된다.
    assert.match(review, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    for (const type of ['neighbor.guestbook_approved', 'neighbor.guestbook_received']) {
        assert.match(manifest, new RegExp(`eventType: '${type.replace('.', '\\.')}'`));
    }
    assert.match(manifest, /onNavigate\?\.\('neighbor_agit', \{ section: 'books', sharedBookId/);
});

test('검토함·메뉴 숫자에 확인할 방문록이 함께 들어간다', () => {
    assert.match(sql, /'pending_guestbook', v_guestbook_count/);
    assert.match(sql, /'count', v_approvals \+ v_joins \+ v_blocked \+ v_guestbook/);
    assert.match(teacherEntry, /\+ \(notif\.pending_guestbook \|\| 0\)/);
    assert.match(teacherEntry, /📚 우리 반 문집 방문록/);
});

test('화면: 세 번째 탭과 학생·교사 칸, 알림으로 들어오면 그 책을 연다', () => {
    assert.match(tabs, /id: 'books', icon: '🏛️', label: '문집 도서관'/);
    assert.match(teacherEntry, /<TeacherBooksPanel /);
    assert.match(studentEntry, /<StudentBooksPanel spaceId=\{spaceId\} api=\{booksApi\} initialSharedBookId=/);
    assert.match(studentEntry, /params\?\.section === 'books'/);
    // 책 응답은 우리 반 서가와 같은 검사를 쓴다.
    assert.match(booksApi, /assertStudentBooks\(book, book\.id, workId\)/);
    assert.match(studentPanel, /StudentBookReader/);
    assert.match(teacherPanel, /소개 내리기/);
    assert.match(guides, /문집 도서관/);
});

test('시뮬레이션이 문집 흐름을 돈다', () => {
    for (const step of ['B2 문집을 모두의 아지트에 소개', 'B11 햇살반 검토함에 방문록 1', 'B15 문집에 글이 실린', 'B18 작품이 철회되면']) {
        assert.ok(simulation.includes(step), `시뮬레이션에 "${step}" 단계가 없습니다.`);
    }
});

test('소개하기가 꺼진 문집은 까닭과 글꽃 책방으로 가는 단추를 보여 준다(2026-09-23 `20261337`)', async () => {
    const reasonSql = await readFile('supabase/migrations/20261337_neighbor_teacher_books_reason.sql', 'utf8');
    const dashboard = await readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8');
    assert.match(reasonSql, /'any_edition_number', \(SELECT max\(edition\.number\)/);
    assert.match(reasonSql, /'design', book\.design_id/);
    // 확정 전 / 확정했지만 가림 / 읽을 작품 없음 — 세 까닭을 글꽃 책방의 실제 단추 이름으로 안내한다.
    assert.match(teacherPanel, /if \(!book\.any_edition_number\)/);
    assert.match(teacherPanel, /if \(!book\.latest_edition_id\)/);
    assert.match(teacherPanel, /‘학생 서가에 공개’를 눌러 주세요/);
    assert.match(teacherPanel, /‘새 판 확정’/);
    assert.match(teacherEntry, /onOpenBooks=\{onNavigateTab \? \(\) => onNavigateTab\('class-agit-books'\) : undefined\}/);
    assert.match(dashboard, /<TeacherNeighborAgit [^>]*onNavigateTab=\{handleTabChange\}/);
});

test('방문록은 학생마다 카드 한 장, 소개 중인 문집은 테두리·띠로 눈에 띈다(2026-09-23)', async () => {
    const css = await readFile('src/modules/community/neighbor-agit/books/books.css', 'utf8');
    assert.match(teacherPanel, /className="neighbor-books__guestcards">\{pendingEntries\.map/);
    assert.match(teacherPanel, /className="neighbor-books__guestcards">\{approved\.map/);
    assert.match(studentPanel, /className="neighbor-books__guestcards">\{entries\.map/);
    assert.match(teacherPanel, /\$\{shared \? ' is-shared' : ''\}/);
    assert.match(teacherPanel, /📢 공개 중/);
    assert.match(css, /\.neighbor-books__book-card\.is-shared \{ border: 2px solid var\(--space-accent/);
    assert.doesNotMatch(css, /neighbor-books__entries/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { defaultDeadlineInput, isoToDeadlineInput } from '../src/modules/community/neighbor-agit/deadlineDefaults.js';

// 모두의 아지트 기한(2026-09-25 선생님 결정): 기본은 기한 없음, 켜면 **7일 뒤 오후 5시**.
// 같이 쓰기 광장 주제 기한과 문집 도서관 게시 기한이 같은 값을 쓴다.

test('기한 처음 값은 7일 뒤 오후 5시(달·해가 넘어가도)', () => {
    assert.equal(defaultDeadlineInput(new Date(2026, 8, 25, 10, 30)), '2026-10-02T17:00');
    assert.equal(defaultDeadlineInput(new Date(2026, 11, 28, 23, 59)), '2027-01-04T17:00');
    assert.equal(isoToDeadlineInput(''), '');
});

test('같이 쓰기 광장 주제: 기한마다 켜기 체크, 켜면 처음 값, 댓글 마감은 글쓰기 마감에서 시작', async () => {
    const entry = await readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8');
    assert.match(entry, /import \{ defaultDeadlineInput \} from '\.\/deadlineDefaults\.js';/);
    assert.match(entry, /writing_close_at: event\.target\.checked \? defaultDeadlineInput\(\) : ''/);
    assert.match(entry, /comments_close_at: event\.target\.checked \? \(current\.writing_close_at \|\| defaultDeadlineInput\(\)\) : ''/);
    assert.match(entry, /useState\(\{ writing_close_at: '', comments_close_at: '' \}\)/); // 기본은 기한 없음
});

test('문집 도서관 게시 기한: 소개한 반 교사가 정하거나 비우고, 지나면 바로 못 열고 예약 작업이 내린다(20261347)', async () => {
    const [sql, teacher, student, api] = await Promise.all([
        readFile('supabase/migrations/20261347_neighbor_book_shared_until.sql', 'utf8'),
        readFile('src/modules/community/neighbor-agit/books/TeacherBooksPanel.jsx', 'utf8'),
        readFile('src/modules/community/neighbor-agit/books/StudentBooksPanel.jsx', 'utf8'),
        readFile('src/modules/community/neighbor-agit/books/booksApi.js', 'utf8')
    ]);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS shared_until TIMESTAMPTZ;/);
    assert.match(sql, /AND \(shared\.shared_until IS NULL OR shared\.shared_until > NOW\(\)\)/);
    assert.match(sql, /WHERE id = p_shared_book_id AND space_id = p_space_id AND class_id = p_actor_class_id AND status = 'published';/);
    assert.match(sql, /'neighbor-withdraw-due-books', '\*\/5 \* \* \* \*'/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.withdraw_due_neighbor_books_v1\(\) FROM PUBLIC, anon, authenticated, service_role;/);
    assert.match(sql, /OR neighbor_shared_books\.shared_until <= NOW\(\) THEN NULL/);
    assert.match(api, /call\('set_neighbor_book_shared_until_v1'/);
    assert.match(teacher, /\[settingsBook\.shared_book_id\]: event\.target\.checked \? defaultDeadlineInput\(\) : ''/);
    assert.match(teacher, /sharedUntil: value \? new Date\(value\)\.toISOString\(\) : null/);
    assert.match(student, /item\.shared_until && /);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 독서마라톤 "쪽수 확인이 필요한 책" 배지와 거리 되계산(2026-09-21 요청).
 *
 * 세 가지가 실제로 있었던 고장이라 여기서 함께 지킨다.
 *  1. 쪽수를 고쳐도 달린 거리가 붙지 않았다 — 목록에서 책만 사라져 고쳐진 것처럼 보였다.
 *  2. 상한 작업(20261259)이 v1 만 고쳐, 화면이 쓰는 v2 는 전집·세트를 띄우지 않았다.
 *  3. 고치는 화면이 3층 깊이라 교사가 알 길이 없었다.
 *
 * 그래서 지키는 것은 하나로 모인다 — **배지 숫자와 화면 목록이 같은 기준이어야 하고,
 * 고치면 거리가 실제로 붙어야 한다.**
 */
const [fix, dashboard, hub, manager, marathon] = await Promise.all([
    readFile('supabase/migrations/20261329_reading_marathon_page_fix_recount_and_badge.sql', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherWritingHub.jsx', 'utf8'),
    readFile('src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx', 'utf8'),
    readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeacherSettings.jsx', 'utf8')
]);

/** 함수 하나의 본문만 떼어 낸다. 파일 전체로 보면 다른 함수의 조건에 속아 넘어간다. */
const bodyOf = (sql, name) => {
    const start = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    assert.notEqual(start, -1, `${name} 를 찾지 못했습니다.`);
    const end = sql.indexOf('\n$$;', start);
    assert.notEqual(end, -1, `${name} 의 끝을 찾지 못했습니다.`);
    return sql.slice(start, end);
};

test('쪽수를 고치면 그 책을 읽은 학급 전원의 거리를 다시 센다', () => {
    const body = bodyOf(fix, 'set_teacher_reading_book_page_count');

    // 쪽수만 적고 끝내던 것이 이 고침의 핵심이다.
    assert.ok(body.includes('PERFORM public.record_reading_marathon_contribution(v_post_id)'),
        '쪽수를 고친 뒤 거리를 다시 세지 않습니다. 이러면 학생 거리가 0m 로 남습니다.');

    // 글 하나만 돌면 같은 책을 읽은 다른 학생이 0m 로 남는다. 학급 단위로 돌아야 한다.
    assert.ok(body.includes('item.book_id = v_book_id'),
        '같은 책을 읽은 다른 독서록까지 다시 세지 않습니다.');
    assert.ok(body.includes('post.class_id = p_class_id'), '학급 범위가 없습니다.');
});

test('지난 보정분도 한 번 되살린다', () => {
    // 이 함수는 20260930 이후 고친 적이 없어, 그동안 교사가 보정한 책은 모두 거리가 비어 있다.
    assert.ok(fix.includes("book.page_count_source = 'teacher'"),
        '교사가 이미 보정해 둔 책을 되살리는 일회성 정리가 없습니다.');
});

test('화면이 쓰는 v2 가 전집·세트도 띄운다', () => {
    const body = bodyOf(fix, 'get_reading_marathon_snapshot_v2');

    // 20261259 는 v1 만 고쳤다. 화면은 v2 를 쓰므로 v2 에 상한이 들어가야 한다.
    assert.ok(body.includes('book.page_count > public.reading_marathon_max_pages_v1()'),
        'v2 가 상한 초과 책을 띄우지 않습니다.');

    // 화면이 `현재 N쪽 — 전집·세트로 보입니다` 를 그리려면 쪽수가 내려와야 한다.
    assert.ok(body.includes('book.page_count,'), 'v2 가 쪽수를 내려보내지 않아 화면 설명이 닿지 않습니다.');
    assert.ok(body.includes("ELSE 'too_long' END AS reason"), 'v2 가 이유를 내려보내지 않습니다.');
});

test('세기는 목록의 LIMIT 20 에 걸리지 않는다', () => {
    const body = bodyOf(fix, 'get_reading_marathon_snapshot_v2');
    // 목록은 화면용이라 20 개까지만 싣는다. 그대로 세면 21권째부터 없는 것처럼 보인다.
    assert.ok(body.includes('pending_all AS MATERIALIZED'), '세기 전용 CTE 가 없습니다.');
    assert.ok(body.includes("'pending_book_count', (SELECT COUNT(*) FROM pending_all)"),
        '요약 숫자를 잘린 목록에서 세고 있습니다.');
});

test('배지와 화면 목록은 글자 그대로 같은 조건으로 센다', () => {
    const badge = bodyOf(fix, 'get_teacher_reading_pending_books_badge_v1');
    const snapshot = bodyOf(fix, 'get_reading_marathon_snapshot_v2');

    /*
     * 어긋나면 배지를 보고 들어갔는데 목록이 비어 있는 일이 생긴다.
     * 아래는 두 곳에 모두 있어야 하는 조건이다.
     */
    for (const fragment of [
        "review.review_status IN ('checked', 'commented')",
        "post.self_writing_type = 'reading_log'",
        'post.is_submitted IS TRUE',
        'COALESCE(post.published_at, post.created_at) >= COALESCE(v_campaign.started_at, v_campaign.created_at)',
        '(book.page_count IS NULL OR book.page_count > public.reading_marathon_max_pages_v1())'
    ]) {
        assert.ok(snapshot.includes(fragment), `화면 목록 쪽에 없는 조건: ${fragment}`);
        assert.ok(badge.includes(fragment), `배지 쪽에 없는 조건: ${fragment}`);
    }
});

test('배지는 남의 학급을 세지 않고, 권한이 없으면 0 을 준다', () => {
    const badge = bodyOf(fix, 'get_teacher_reading_pending_books_badge_v1');
    // 메뉴를 그릴 때마다 불리므로 오류 대신 0 이어야 메뉴가 깨지지 않는다.
    assert.ok(badge.includes("RETURN jsonb_build_object('count', 0);"), '권한 없을 때 0 을 주지 않습니다.');
    assert.ok(badge.includes('c.teacher_id = auth.uid()'), '담임 확인이 없습니다.');
    assert.ok(badge.includes('post.class_id = p_class_id'), '학급 범위가 없습니다.');
    assert.match(fix, /REVOKE ALL ON FUNCTION public\.get_teacher_reading_pending_books_badge_v1\(UUID\) FROM PUBLIC, anon/);
    assert.match(fix, /GRANT EXECUTE ON FUNCTION public\.get_teacher_reading_pending_books_badge_v1\(UUID\) TO authenticated/);
});

test('배지는 무거운 스냅샷을 부르지 않는다', () => {
    /*
     * 대시보드는 모든 교사가 매번 연다. 여기서 스냅샷(순위·모둠·메달까지 모으는 질의)을
     * 부르면 동시 사용이 몰릴 때 그대로 부담이 된다. 세기 전용 RPC 를 따로 둔 이유다.
     */
    const loader = dashboard.slice(
        dashboard.indexOf('const loadReadingPendingBooks'),
        dashboard.indexOf('void loadReadingPendingBooks()')
    );
    assert.ok(loader.includes('get_teacher_reading_pending_books_badge_v1'), '배지가 세기 전용 RPC 를 쓰지 않습니다.');
    assert.ok(!loader.includes('get_reading_marathon_snapshot'), '배지가 무거운 스냅샷을 부릅니다.');
});

test('배지는 학생 독서록과 독서록 이벤트 두 곳에 뜬다', () => {
    // 2026-09-26: 메뉴 배지는 처리할 일 수 하나로 센다 — 학생 독서록 숫자에 더해지고,
    // 글쓰기 상단 숫자에도 올라간다(전에는 세부 메뉴에만 떠서 다른 메뉴에서는 알 수 없었다).
    assert.ok(dashboard.includes("'reading-logs': readingLogsUnreviewedCount + readingPendingBooks"),
        '학생 독서록 메뉴 배지에 쪽수 확인 책이 들어가지 않습니다.');

    // 안쪽 독서록 이벤트 탭.
    assert.ok(manager.includes('pendingBooks > 0'), '독서록 이벤트 탭에 배지가 없습니다.');
    assert.ok(manager.includes('쪽수 확인이 필요한 책 ${pendingBooks}권'),
        '안쪽 배지 설명(aria-label)이 없습니다.');
});

test('한 번만 세서 물려준다 — 두 배지가 각자 서버에 묻지 않는다', () => {
    assert.ok(dashboard.includes('readingPendingBooks={readingPendingBooks}'), '대시보드가 수를 내려주지 않습니다.');
    assert.ok(hub.includes('pendingBooks={readingPendingBooks}'), '허브가 연결을 끊었습니다.');
    assert.ok(manager.includes('pendingBooks = 0'), '독서록 화면이 수를 받지 않습니다.');
    // 안쪽 화면이 스스로 세면 같은 것을 두 번 세게 된다.
    assert.ok(!manager.includes('get_teacher_reading_pending_books_badge_v1'),
        '안쪽 화면이 같은 것을 또 셉니다.');
});

test('고치면 배지가 바로 줄어든다 — 화면이 센 수를 그대로 올려 준다', () => {
    /*
     * 처음 한 번만 세고 끝내면, 교사가 쪽수를 다 고쳐도 숫자가 남아 지울 수 없는 배지가 된다.
     * 그래서 마라톤 화면이 다시 셀 때마다 그 수를 위로 올린다.
     */
    assert.ok(marathon.includes('onPendingBooksChange?.(Number(normalized.summary?.pendingBookCount) || 0)'),
        '마라톤 화면이 센 수를 위로 올리지 않습니다.');
    assert.ok(manager.includes('onPendingBooksChange={onPendingBooksChange}'), '독서록 화면이 연결을 끊었습니다.');
    assert.ok(dashboard.includes('onReadingPendingBooksChange={setReadingPendingBooks}'), '대시보드가 받지 않습니다.');
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

// 같이 쓰기 광장 진행 현황: 우리 반 제출 글 카드 + 새 제출 알림 + 주제 처음 값(2026-09-25 선생님 요청).
const [entry, api, css, sql, adapter] = await Promise.all([
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/teacherApi.js', 'utf8'),
    readFile('src/modules/community/neighbor-agit/TeacherEntry.css', 'utf8'),
    readFile('supabase/migrations/20261342_neighbor_topic_submission_cards.sql', 'utf8'),
    // 어댑터는 확장자 없이 가져오는 앱 코드라 Node 로 직접 부르지 않고 읽는다.
    readFile('src/modules/community/neighbor-agit/topicProposalAdapter.js', 'utf8')
]);

test('주제 만들기 처음 값은 300자·100포인트이고, 글 종류를 고를 때도 같은 값으로 "손대지 않음" 을 본다', () => {
    assert.match(adapter, /NEIGHBOR_TOPIC_DEFAULTS = Object\.freeze\(\{\s*min_chars: 300,\s*base_reward: 100,/);
    assert.match(adapter, /createNeighborTopicDraft = \(\) => createMissionDraft\(\{ \.\.\.NEIGHBOR_TOPIC_DEFAULTS \}\)/);
    assert.match(entry, /activityForm\.min_chars === NEIGHBOR_TOPIC_DEFAULTS\.min_chars \? null/);
    assert.doesNotMatch(entry, /activityForm\.min_chars === 50/);
});

test('진행 현황 카드는 기한을 보여 주기만 하고, 우리 반 제출 글을 제목·글쓴이 카드로 모은다', () => {
    // 글마다·카드마다 기한을 고치는 입력이 없다(만들 때 정한다). 활동 종료는 그대로.
    assert.doesNotMatch(entry, /type="datetime-local" disabled=\{Boolean\(busy\)\} value=\{value\}/);
    assert.doesNotMatch(entry, /saveActivitySchedule|deadlineDrafts/);
    assert.match(entry, /renderDeadlineTile\(activity, 'writing_close_at'\)/);
    assert.match(entry, /topicClassRows\(activity\)\.map/);
    assert.match(entry, /onClick=\{\(\) => setCloseActivityFor\(activity\)\}>활동 종료/);
    // 카드: 제목·글쓴이, 누르면 공개할 글 고르기 창.
    assert.match(entry, /activity\.my_submissions\.map\(\(submission\) =>/);
    assert.match(entry, /<strong>\{submission\.title \|\| '제목 없음'\}<\/strong>\s*<small>\{submission\.student_name\}<\/small>/);
    assert.match(entry, /onClick=\{\(\) => openActivityPublish\(activity\)\}\s*className=\{`neighbor-teacher__submission/);
    assert.match(css, /\.neighbor-teacher__submission-grid \{ display: grid;/);
});

test('새 제출 글은 메뉴 숫자·검토함·12초 안내에 함께 잡히고, 진행 현황을 보면 기준선을 옮긴다', () => {
    assert.match(entry, /\+ \(notif\.pending_guestbook \|\| 0\) \+ \(notif\.new_topic_submissions \|\| 0\);/);
    assert.match(entry, /새 제출 글 \$\{nextTopic - beforeTopic\}건/);
    assert.match(entry, /🎪 같이 쓰기 광장 새 제출 글/);
    assert.match(entry, /api\.markTopicSeen\(classId\)\.then\(refreshWorkspace\)/);
    assert.match(entry, /activeActivityTab === 'topic' && topicStep === 'topics'/);
    assert.match(api, /rpc\('mark_neighbor_topic_seen_v1'/);
});

test('서버는 제출 글을 작업 공간 응답에 싣고(N+1 없음), 새 제출 수는 한 함수로 센다', () => {
    assert.match(sql, /'my_submissions', COALESCE\(\(/);
    assert.match(sql, /link\.class_id = p_actor_class_id/);
    assert.match(sql, /LIMIT 100/);
    // 이웃 글 마당의 새 글 기준선(last_seen_at)과 섞지 않는다.
    assert.match(sql, /ADD COLUMN IF NOT EXISTS topic_seen_at TIMESTAMPTZ/);
    assert.match(sql, /ON CONFLICT \(space_id, class_id\) DO UPDATE SET topic_seen_at = NOW\(\);/);
    // 작업 공간 알림과 메뉴 배지가 같은 함수를 부른다.
    assert.equal((sql.match(/neighbor_topic_new_submission_count_v1\(v_space_id, p_class_id\)/g) || []).length, 2);
    assert.match(sql, /'count', v_approvals \+ v_joins \+ v_blocked \+ v_guestbook \+ v_topic/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.neighbor_topic_new_submission_count_v1\(UUID, UUID\) FROM PUBLIC, anon, authenticated;/);
    assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.mark_neighbor_topic_seen_v1\(UUID\) TO authenticated;/);
});

test('모두의 아지트 새 소식(새 이웃 글·댓글·문집)도 메뉴 숫자와 12초 안내에 잡힌다(20261343)', async () => {
    const news = await readFile('supabase/migrations/20261343_neighbor_news_badge.sql', 'utf8');
    // 세는 곳은 한 함수 — 작업 공간 알림과 메뉴 배지가 같이 쓴다.
    assert.equal((news.match(/public\.neighbor_teacher_news_v1\(v_space_id, p_class_id\)/g) || []).length, 2);
    assert.match(news, /'new_books', \(SELECT count\(\*\)::INTEGER FROM public\.neighbor_shared_books book/);
    assert.match(news, /'todo', v_approvals \+ v_joins \+ v_blocked \+ v_guestbook \+ v_topic/);
    // 새 제출 기준선은 모두의 아지트에 들어온 시각(last_seen_at)으로 대신하지 않는다.
    assert.match(news, /SELECT visit\.topic_seen_at FROM public\.neighbor_space_teacher_visits visit/);
    assert.match(news, /VALUES \(v_space_id, p_class_id, NOW\(\), NOW\(\)\)/);
    assert.match(entry, /새 이웃 글 \$\{nextPosts - beforePosts\}편/);
    assert.match(entry, /새 문집 \$\{nextBooks - beforeBooks\}권/);
    assert.match(api, /new_books: 0, new_topic_submissions: 0/);
});

test('제출 글 카드는 넓은 화면에서 5열(20명이 5×4)로 놓인다', () => {
    assert.match(css, /\.neighbor-teacher__submission-grid \{ display: grid; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/);
    assert.match(css, /min-height: 92px/);
});


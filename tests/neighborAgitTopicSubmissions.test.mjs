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
    assert.match(entry, /onClick=\{\(\) => \{ setTopicDetailId\(null\); setCloseActivityFor\(activity\); \}\}>활동 종료/);
    // 카드: 제목·글쓴이, 누르면 공개할 글 고르기 창.
    assert.match(entry, /activity\.my_submissions\.map\(\(submission\) =>/);
    assert.match(entry, /<strong>\{submission\.title \|\| '제목 없음'\}<\/strong>\s*<small>\{submission\.student_name\}<\/small>/);
    assert.match(entry, /onClick=\{\(\) => \{ setTopicDetailId\(null\); openActivityPublish\(activity\); \}\}\s*className=\{`neighbor-teacher__submission/);
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

test('진행 현황은 주제 카드 목록이고, 누르면 모달에서 자세히 본다', () => {
    assert.match(entry, /className="neighbor-topic-tile" data-status=\{activity\.status\}\s*onClick=\{\(\) => setTopicDetailId\(activity\.id\)\}/);
    assert.match(entry, /<Modal isOpen=\{Boolean\(topicDetail\)\} onClose=\{\(\) => setTopicDetailId\(null\)\}/);
    assert.match(entry, /\{topicDetail && renderTopicDetail\(topicDetail\)\}/);
    assert.match(css, /\.neighbor-topic-tiles \{ display: grid;/);
});

test('주제 삭제: 제안한 반·호스트만, 앱 안 확인 창, 각 반 과제·학생 글은 보관함에 남긴다(20261344)', async () => {
    const del = await readFile('supabase/migrations/20261344_neighbor_topic_delete.sql', 'utf8');
    assert.match(del, /space\.host_class_id = p_actor_class_id/);
    assert.match(del, /approval\.is_proposer/);
    assert.match(del, /ERRCODE = '42501'/);
    // 주제를 먼저 지운 뒤(연결이 사라져 과제 보호 트리거가 막지 않음) 과제를 보관·태그 정리. 학생 글은 지우지 않는다.
    assert.ok(del.indexOf('DELETE FROM public.neighbor_activities') < del.indexOf('UPDATE public.writing_missions mission'));
    assert.match(del, /SET is_archived = TRUE,/);
    assert.doesNotMatch(del, /DELETE FROM public\.student_posts|DELETE FROM public\.writing_missions/);
    assert.match(del, /GRANT EXECUTE ON FUNCTION public\.delete_neighbor_activity_v1\(UUID, UUID, UUID\) TO authenticated;/);
    assert.match(api, /rpc\('delete_neighbor_activity_v1'/);
    assert.match(entry, /const canDeleteTopic = \(activity\) => Boolean\(activity\.can_manage\s*\|\| activity\.approvals\?\.some\(\(approval\) => approval\.is_proposer && approval\.class_id === classId\)\)/);
    const deleteAt = entry.indexOf('const deleteTopic = async');
    const deleteFn = entry.slice(deleteAt, entry.indexOf('\n    };\n', deleteAt));
    assert.match(deleteFn, /await ask\(\{/);
    assert.match(deleteFn, /tone: 'danger'/);
    assert.doesNotMatch(entry, /window\.confirm\(/);
});

test('모두의 아지트에서는 내 글에 댓글을 달 수 없다(서버·화면 모두, 20261345)', async () => {
    const [sql, student] = await Promise.all([
        readFile('supabase/migrations/20261345_neighbor_no_self_comment.sql', 'utf8'),
        readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8')
    ]);
    assert.match(sql, /IF p_action = 'save' AND v_owner_student_id = v_student_id THEN\s*RAISE EXCEPTION '내 글에는 댓글을 남길 수 없어요/);
    // 저장만 막고, 이미 단 내 댓글 지우기는 된다.
    assert.ok(sql.indexOf("p_action = 'save' AND v_owner_student_id") < sql.indexOf("IF p_action = 'delete' THEN"));
    assert.match(student, /\) : detail\.is_mine \? \(/);
    assert.match(student, /✍️ 내 글이에요\. 친구들이 남긴 댓글을 읽어 보세요\./);
});

test('같이 쓰기 광장에는 공개 글 관리 탭이 없고, 주제 공개 창에서 공개·비공개를 모두 한다', () => {
    // 이웃 글 마당은 ① 글 모으기·② 공개 글 관리·③ 댓글·반응 그대로.
    assert.equal((entry.match(/\{ id: 'manage', label: '② 공개 글 관리' \}/g) || []).length, 1);
    assert.match(entry, /\{ id: 'topics', label: '① 주제' \},\s*\{ id: 'engage', label: '② 댓글·반응' \}/);
    assert.doesNotMatch(entry, /topicStep === 'manage'/);
    assert.match(entry, /runAction\('hide_post', \{ space_id: workspace\.space\.id, item_id: post\.shared_post_id, reason: '교사 확인' \}, '글을 비공개로 돌렸습니다\.'\); if \(r\) await reloadActivityCandidates\(activityPublishFor\.id\);/);
    assert.match(entry, />\s*비공개로 돌리기\s*</);
});


import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 내 글에 이웃 반 댓글이 달리면 학생 "내 글 소식" 으로 알린다 (2026-09-23 `20261334`).
 * 공감은 알리지 않는다(선생님 결정). 누르면 모두의 아지트의 그 글이 열린다.
 */
const [sql, manifest, modal, app, student] = await Promise.all([
    readFile('supabase/migrations/20261334_neighbor_comment_notification.sql', 'utf8'),
    readFile('src/modules/community/neighbor-agit/manifest.js', 'utf8'),
    readFile('src/components/student/StudentFeedbackModal.jsx', 'utf8'),
    readFile('src/App.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8')
]);

test('댓글이 보이게 된 순간에만 알리고, 안 보이게 되면 거둔다', () => {
    assert.match(sql, /AFTER INSERT OR DELETE OR UPDATE OF status ON public\.neighbor_comments/);
    // 검사 대기·막힘·숨김·삭제는 알림을 거둔다.
    assert.match(sql, /NEW\.status IS DISTINCT FROM 'visible' THEN\s+DELETE FROM public\.student_notification_events/);
    // 이미 보이던 댓글의 다른 변화로는 다시 알리지 않는다.
    assert.match(sql, /TG_OP = 'UPDATE' AND OLD\.status = 'visible'/);
    // 내가 내 글에 단 댓글은 알리지 않는다.
    assert.match(sql, /v_owner_id = NEW\.student_id/);
});

test('같은 원장·같은 갈래(내 글 소식)에 쌓고, 한 댓글은 한 건이다', () => {
    assert.match(sql, /notification_emit_v1\(\s+v_owner_id, 'feedback', 'feedback\.neighbor_comment_received'/);
    assert.match(sql, /format\('neighbor-comment:%s', NEW\.id\)/);
    // 이름을 고치면 알림 속 이름도 고칠 수 있게 댓글 쓴 학생 id 를 남긴다.
    assert.match(sql, /1::SMALLINT,\s+NEW\.student_id\s+\)/);
    // 알림이 실패해도 댓글 저장·AI 검사 전환을 막지 않는다.
    assert.match(sql, /EXCEPTION WHEN OTHERS THEN\s+RAISE WARNING/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.emit_neighbor_comment_notification_v1\(\)\s+FROM PUBLIC, anon, authenticated, service_role/);
});

test('공감은 알리지 않는다', () => {
    assert.doesNotMatch(sql, /ON public\.neighbor_reactions/);
    assert.doesNotMatch(manifest, /neighbor_reaction/);
});

test('내 글 소식 댓글 탭에 함께 보이고, 누르면 모두의 아지트의 그 글이 열린다', () => {
    assert.match(manifest, /eventType: 'feedback\.neighbor_comment_received'/);
    assert.match(modal, /eventTypes: \['feedback\.comment_received', NEIGHBOR_COMMENT_EVENT\]/);
    assert.match(modal, /onNavigate\('neighbor_agit', \{ sharedPostId \}\)/);
    assert.match(app, /<NeighborAgitStudentEntry[\s\S]*?params=\{internalPage\.params\}/);
    assert.match(student, /params\?\.sharedPostId/);
    assert.match(student, /void openDetail\(noticePostId\)/);
});

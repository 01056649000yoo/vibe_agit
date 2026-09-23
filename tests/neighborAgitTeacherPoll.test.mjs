import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [entry, poll, policy, harness] = await Promise.all([
    readFile('src/modules/community/neighbor-agit/TeacherEntry.jsx', 'utf8'),
    readFile('src/modules/community/neighbor-agit/useTeacherWorkspacePoll.js', 'utf8'),
    readFile('src/modules/writing/submission-board/teacherSubmissionBoardPollPolicy.js', 'utf8'),
    readFile('PERFORMANCE_HARNESS.md', 'utf8')
]);

test('교사 모두의 아지트는 보이는 작업 공간에서만 제출 전광판과 같은 12초 갱신을 쓴다', () => {
    assert.match(entry, /useTeacherWorkspacePoll\(\{ enabled: Boolean\(isReady && workspace\?\.space\?\.id\), refresh: refreshWorkspace \}\)/);
    assert.match(poll, /getTeacherSubmissionBoardNextDelay/);
    assert.match(poll, /document\.visibilityState !== 'visible'/);
    assert.match(poll, /inFlight/);
    assert.match(poll, /window\.setTimeout\(runPoll, delay\)/);
    assert.doesNotMatch(poll, /setInterval\s*\(|\.channel\(|postgres_changes/);
    assert.match(policy, /TEACHER_SUBMISSION_BOARD_POLL_INTERVAL_MS = 12000/);
    assert.match(harness, /이웃 아지트 교사 작업 공간[\s\S]*12초당 작업 공간 RPC 1회[\s\S]*학생 폴링·Realtime은 추가하지 않는다/);
});

test('새 방문록·확인할 댓글·이웃 댓글은 자동 갱신 뒤 배지와 안내에서 함께 보인다', () => {
    assert.match(entry, /notif\.pending_guestbook \|\| 0/);
    assert.match(entry, /notif\.blocked_comments \|\| 0/);
    assert.match(entry, /notif\.new_comments \|\| 0/);
    assert.match(entry, /새 방문록 \$\{nextGuestbook - beforeGuestbook\}건/);
    assert.match(entry, /확인할 댓글 \$\{nextBlocked - beforeBlocked\}건/);
    assert.match(entry, /새 이웃 댓글 \$\{nextComments - beforeComments\}건/);
    assert.match(entry, /12초마다 새 방문록·댓글을 자동 확인합니다/);
});

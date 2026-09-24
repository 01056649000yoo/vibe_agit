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
    assert.match(entry, /useTeacherWorkspacePoll\(\{ enabled: Boolean\(workspace\?\.space\?\.id\), refresh: refreshWorkspace \}\)/);
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

test('교사가 다른 메뉴에 있어도 참여 학급이면 모두의 아지트 배지를 같은 12초 규칙으로 센다(D3)', async () => {
    const dashboard = await readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8');
    assert.match(dashboard, /import \{ useTeacherWorkspacePoll \} from '\.\.\/\.\.\/modules\/community\/neighbor-agit\/useTeacherWorkspacePoll'/);
    assert.match(dashboard, /enabled: neighborActive && currentTab !== 'neighbor-agit'/);
    assert.match(dashboard, /refresh: loadNeighborBadge/);
    // 학급을 바꾸는 사이 늦게 온 옛 학급 응답은 버린다.
    assert.match(dashboard, /if \(neighborBadgeClassId\.current !== classId\) return;/);
    assert.match(dashboard, /setNeighborActive\(data\?\.active === true\)/);
});

test('새 이웃 댓글이 오면 ③ 댓글·반응 목록도 다시 맞춘다(D4)', () => {
    assert.match(entry, /if \(nextComments > beforeComments\) \{[\s\S]*?setEngageRefresh\(\(value\) => value \+ 1\);/);
});

test('학생 댓글 상태는 글마다 서버 값으로 맞추고, 저장 뒤 한 번만 다시 본다(D2)', async () => {
    const student = await readFile('src/modules/community/neighbor-agit/StudentEntry.jsx', 'utf8');
    assert.doesNotMatch(student, /commentPending/);
    assert.match(student, /setMyCommentStatus\(nextDetail\.my_comment\?\.status \|\| null\)/);
    // 글을 열고 닫을 때 이전 글의 상태·예약 확인을 지운다.
    assert.match(student, /const openDetail = async \(sharedPostId\) => \{\s*clearCommentRecheck\(\);\s*openDetailId\.current = sharedPostId;[\s\S]*?setMyCommentStatus\(null\);/);
    assert.match(student, /const closeDetail = \(\) => \{\s*clearCommentRecheck\(\);[\s\S]*?setMyCommentStatus\(null\);/);
    assert.match(student, /if \(openDetailId\.current !== sharedPostId\) return;/);
    // 폴링이 아니라 예약 한 번(setTimeout)과 학생이 누르는 버튼뿐이다.
    assert.doesNotMatch(student, /setInterval\s*\(|\.channel\(|postgres_changes/);
    assert.equal((student.match(/window\.setTimeout\(/g) || []).length, 1);
    assert.match(student, /myCommentStatus === 'blocked'/);
});


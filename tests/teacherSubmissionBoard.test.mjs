/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('과제 만들기·관리와 실시간 제출 현황은 한 화면 안의 독립 탭으로 분리된다', async () => {
    const [dashboard, hub, tab, manager, board, styles, missionList, workspace] = await Promise.all([
        read('src/components/teacher/TeacherDashboard.jsx'),
        read('src/components/teacher/TeacherWritingHub.jsx'),
        read('src/components/teacher/TeacherMissionTab.jsx'),
        read('src/components/teacher/MissionManager.jsx'),
        read('src/components/teacher/TeacherSubmissionBoard.jsx'),
        read('src/components/teacher/TeacherSubmissionBoard.css'),
        read('src/components/teacher/MissionList.jsx'),
        read('src/modules/writing/mission-workspace/missionWorkspaceView.js')
    ]);

    assert.match(workspace, /과제 만들기·관리[\s\S]*실시간 제출 현황/);
    assert.match(manager, /role="tablist"[\s\S]*role="tab"[\s\S]*aria-selected/);
    assert.match(manager, /tabIndex=\{isActive \? 0 : -1\}[\s\S]*handleWorkspaceTabKeyDown/);
    assert.match(manager, /ArrowRight[\s\S]*ArrowLeft[\s\S]*Home[\s\S]*End/);
    assert.match(manager, /teacher-mission-management-panel[\s\S]*hidden=\{isSubmissionBoardView\}/);
    assert.match(manager, /teacher-submission-board-panel[\s\S]*hidden=\{!isSubmissionBoardView\}[\s\S]*TeacherSubmissionBoard/);
    assert.doesNotMatch(manager, /teacher-mission-live-layout|splitView/);
    const contentRule = styles.match(/\.teacher-submission-board__content\s*\{([^}]*)\}/)?.[1];
    assert.ok(contentRule, '전광판 콘텐츠 레이아웃 규칙이 있어야 한다');
    assert.match(contentRule, /grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(styles, /teacher-submission-board__mission-list[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(styles, /@media \(max-width: 960px\)[\s\S]*teacher-submission-board__content[\s\S]*minmax\(0, 1fr\)/);
    assert.match(missionList, /getMissionCardColumns\(missionCardSize\)/);
    assert.doesNotMatch(styles, /teacher-submission-board\s*\{[\s\S]*position:\s*sticky/);
    assert.match(board, /실시간 제출 전광판/);

    for (const source of [dashboard, hub, tab, manager]) {
        assert.match(source, /missionWorkspaceView/);
    }
    assert.match(dashboard, /MISSION_WORKSPACE_VIEW_STORAGE_KEY, missionWorkspaceView/);
    assert.match(manager, /pendingCount > 0[\s\S]*확인할 글/);
    assert.match(manager, /!isSubmissionBoardView[\s\S]*미션 만들기/);
});

test('전광판은 과제별 제출 상태와 과제명 반복을 줄인 최근 제출 학생 8명을 표시한다', async () => {
    const [board, styles, hook, missionList, manager, ideaMarket] = await Promise.all([
        read('src/components/teacher/TeacherSubmissionBoard.jsx'),
        read('src/components/teacher/TeacherSubmissionBoard.css'),
        read('src/modules/writing/submission-board/useTeacherSubmissionBoard.js'),
        read('src/components/teacher/MissionList.jsx'),
        read('src/components/teacher/MissionManager.jsx'),
        read('src/modules/writing/idea-market/IdeaMarketManager.jsx')
    ]);

    assert.match(board, /승인/);
    assert.match(board, /확인 대기/);
    assert.match(board, /다시쓰기/);
    assert.match(board, /미제출/);
    assert.match(board, /recent_submissions[\s\S]*slice\(0, 8\)/);
    assert.match(board, /groupSubmissionsByMission[\s\S]*groupByMission[\s\S]*group\.submissions\.push/);
    assert.match(board, /mission\?\.title \|\| submission\.mission_title/);
    assert.match(board, /post_resubmitted[\s\S]*다시 제출[\s\S]*첫 제출/);
    assert.match(board, /new Map\(missions\.map/);
    assert.match(board, /missionsById\.get\(missionId\)/);
    assert.match(board, /onClick=\{\(\) => onOpenPost\(item\)\}/);
    assert.match(manager, /handleOpenSubmissionBoardPost[\s\S]*fetchedPosts\.find\(\(post\) => post\.id === submission\.post_id\)[\s\S]*setSelectedPost\(targetPost\)/);
    assert.match(manager, /handleReviewMission\(mission, submission\.post_id\)/);
    assert.match(manager, /initialPostId: activeGenreReviewPostId/);
    assert.match(ideaMarket, /ideas\.find\(\(idea\) => idea\.id === postId\)[\s\S]*setDetailModal\(targetIdea\)/);
    assert.match(styles, /recent-status\.is-first[\s\S]*recent-status\.is-resubmitted/);
    assert.match(styles, /submission-group > header[\s\S]*submission-group li button/);
    assert.match(board, /resolveGenreMissionTypeId\(mission\) === 'meeting'/);
    assert.match(missionList, /제출 \$\{submittedCount\}\/\$\{totalStudentCount\}/);
    assert.doesNotMatch(missionList, /명 완료/);
    assert.match(hook, /TRANSITION_DELTAS[\s\S]*request-rewrite[\s\S]*undo-recall/);
});

test('제출 기록 모아보기는 명시적으로 열 때만 활성 과제의 최신 100건을 한 번 읽는다', async () => {
    const [board, api, hook, manager, migration, smoke, harness] = await Promise.all([
        read('src/components/teacher/TeacherSubmissionBoard.jsx'),
        read('src/modules/writing/submission-board/teacherSubmissionBoardApi.js'),
        read('src/modules/writing/submission-board/useTeacherSubmissionBoard.js'),
        read('src/components/teacher/MissionManager.jsx'),
        read('supabase/migrations/20261168_teacher_assignment_submission_history.sql'),
        read('tests/sql/20261168_teacher_assignment_submission_history.smoke.sql'),
        read('PERFORMANCE_HARNESS.md')
    ]);

    assert.match(board, /handleOpenHistory[\s\S]*await onLoadHistory\(\)/);
    assert.match(board, /historyRequestIdRef[\s\S]*requestId !== historyRequestIdRef\.current/);
    assert.match(board, /제출 기록 모아보기/);
    assert.match(board, /CenteredDialog[\s\S]*최신 제출 기록 · 최대 100건/);
    assert.match(api, /TEACHER_SUBMISSION_HISTORY_LIMIT = 100/);
    assert.match(api, /get_teacher_assignment_submission_history_v1[\s\S]*p_limit:\s*TEACHER_SUBMISSION_HISTORY_LIMIT/);
    assert.match(hook, /loadSubmissionHistory[\s\S]*teacherSubmissionBoardApi\.getHistory\(classId\)/);
    assert.match(manager, /onLoadHistory=\{loadSubmissionHistory\}/);
    assert.match(migration, /LEAST\(GREATEST\(COALESCE\(p_limit, 100\), 1\), 100\)/);
    assert.match(migration, /event\.class_id = p_class_id/);
    assert.match(migration, /post\.class_id = p_class_id[\s\S]*mission\.class_id = p_class_id[\s\S]*student\.class_id = p_class_id/);
    assert.match(migration, /mission\.is_archived IS FALSE/);
    assert.match(migration, /ORDER BY event\.occurred_at DESC, event\.id DESC[\s\S]*LIMIT v_limit \+ 1/);
    assert.match(migration, /class\.teacher_id = auth\.uid\(\) OR public\.auth_user_role\(\) = 'ADMIN'/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_teacher_assignment_submission_history_v1/);
    assert.doesNotMatch(migration, /'content'|'feedback'|'mission_title'/);
    assert.match(smoke, /jsonb_array_length\(v_history->'submissions'\) > 100/);
    assert.match(smoke, /교사가 다른 학급의 과제 제출 기록/);
    assert.match(harness, /제출 기록 모아보기[\s\S]*최대 100건/);
});

test('교사 전광판 폴링은 현황 탭에서만 즉시 시작하고 12초·가시 화면·단일 요청을 지킨다', async () => {
    const [hook, policy, api] = await Promise.all([
        read('src/modules/writing/submission-board/useTeacherSubmissionBoard.js'),
        read('src/modules/writing/submission-board/teacherSubmissionBoardPollPolicy.js'),
        read('src/modules/writing/submission-board/teacherSubmissionBoardApi.js')
    ]);

    assert.match(policy, /TEACHER_SUBMISSION_BOARD_POLL_INTERVAL_MS = 12000/);
    assert.match(policy, /TEACHER_SUBMISSION_BOARD_RECENT_LIMIT = 8/);
    assert.match(hook, /document\.visibilityState !== 'visible'/);
    assert.match(hook, /inFlight/);
    assert.match(hook, /visibilitychange/);
    assert.match(hook, /mutationVersionAtStart === localMutationVersionRef\.current/);
    assert.match(hook, /if \(!enabled \|\| !classId \|\| !hasSnapshot\)/);
    assert.match(hook, /schedule\(0\)/);
    assert.match(hook, /\[classId, enabled, hasSnapshot\]/);
    assert.match(hook, /getTeacherSubmissionBoardNextDelay/);
    assert.doesNotMatch(hook, /setInterval\s*\(|\.channel\(|postgres_changes/);
    assert.match(api, /get_teacher_assignment_submission_board_v1/);
    assert.match(api, /p_recent_limit:\s*TEACHER_SUBMISSION_BOARD_RECENT_LIMIT/);

    const manager = await read('src/components/teacher/MissionManager.jsx');
    const managerHook = await read('src/hooks/useMissionManager.js');
    assert.match(manager, /submissionBoardPollingEnabled: isSubmissionBoardView/);
    assert.match(managerHook, /enabled: submissionBoardPollingEnabled/);
});

test('최초 과제 개요와 경량 폴링은 권한이 제한된 동일 DB 집계를 사용한다', async () => {
    const [migration, hook, harness] = await Promise.all([
        read('supabase/migrations/20261167_teacher_assignment_submission_board.sql'),
        read('src/hooks/useMissionManager.js'),
        read('PERFORMANCE_HARNESS.md')
    ]);

    assert.match(migration, /teacher_assignment_submission_board_snapshot_v1/);
    assert.match(migration, /SELECT DISTINCT ON \(post\.mission_id, post\.student_id\)/);
    assert.match(migration, /post\.updated_at DESC NULLS LAST[\s\S]*post\.created_at DESC[\s\S]*post\.id DESC/);
    assert.match(migration, /post\.class_id = p_class_id[\s\S]*post\.mission_id = mission\.id/);
    assert.match(migration, /event\.class_id = p_class_id/);
    assert.match(migration, /LIMIT \(SELECT recent_limit FROM params\)/);
    assert.match(migration, /LEAST\(GREATEST\(COALESCE\(p_recent_limit, 8\), 1\), 8\)/);
    assert.match(migration, /class\.teacher_id = auth\.uid\(\) OR public\.auth_user_role\(\) = 'ADMIN'/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_teacher_assignment_submission_board_v1/);
    assert.match(migration, /'submission_board', v_submission_board/);
    assert.match(hook, /hydrateSubmissionBoard\(overview\.submission_board/);
    assert.match(harness, /교사 과제 제출 전광판[\s\S]*12초당 경량 RPC 1회/);
});

test('승인·회수·다시쓰기 동작은 추가 목록 조회 없이 전광판 상태를 즉시 바꾼다', async () => {
    const managerHook = await read('src/hooks/useMissionManager.js');

    assert.match(managerHook, /transitionMissionStatus\(post\.mission_id, 'approve', 1\)/);
    assert.match(managerHook, /transitionMissionStatus\(post\.mission_id, 'recover', 1\)/);
    assert.match(managerHook, /transitionMissionStatus\(post\.mission_id, 'request-rewrite', 1\)/);
    assert.match(managerHook, /transitionMissionStatus\(selectedMission\?\.id \|\| list\[0\]\?\.mission_id, 'recall', count\)/);
    assert.doesNotMatch(managerHook, /setSubmissionCounts/);
});

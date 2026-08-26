/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = async (relativePath) => (await readFile(path.join(root, relativePath), 'utf8'))
    .split('\r\n')
    .join('\n');

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
    assert.match(contentRule, /grid-template-columns:\s*minmax\(260px, 0\.68fr\) minmax\(0, 1\.62fr\)/);
    assert.match(styles, /@media \(max-width: 960px\)[\s\S]*teacher-submission-board__content[\s\S]*minmax\(0, 1fr\)/);
    assert.match(missionList, /getMissionCardColumns\(missionCardSize\)/);
    const boardRule = styles.match(/\.teacher-submission-board\s*\{([^}]*)\}/)?.[1] || '';
    assert.doesNotMatch(boardRule, /position:\s*sticky/);
    assert.match(board, /실시간 제출 전광판/);

    for (const source of [dashboard, hub, tab, manager]) {
        assert.match(source, /missionWorkspaceView/);
    }
    assert.match(dashboard, /MISSION_WORKSPACE_VIEW_STORAGE_KEY, missionWorkspaceView/);
    assert.match(manager, /pendingCount > 0[\s\S]*확인할 글/);
    assert.match(manager, /!isSubmissionBoardView[\s\S]*미션 만들기/);
});

test('전광판은 좁은 최근 제출 목록과 넓은 학생별 상태표를 표시한다', async () => {
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
    assert.doesNotMatch(board, /teacher-submission-board__summary/);
    assert.match(board, /StudentStatusTable[\s\S]*학생별 제출 현황/);
    assert.match(board, /STUDENT_STATUS_COLUMNS[\s\S]*confirmed_count[\s\S]*pending_count[\s\S]*rewriting_count[\s\S]*not_submitted_count/);
    assert.match(board, /student_statuses[\s\S]*slice\(0, 100\)/);
    assert.match(board, /recent_submissions[\s\S]*slice\(0, 8\)/);
    assert.match(board, /groupSubmissionsByMission[\s\S]*groupByMission[\s\S]*group\.submissions\.push/);
    assert.match(board, /mission\?\.title \|\| submission\.mission_title/);
    assert.match(board, /submission_number[\s\S]*첫 제출[\s\S]*다시 제출[\s\S]*회 제출/);
    assert.match(board, /new Map\(missions\.map/);
    assert.match(board, /missionsById\.get\(missionId\)/);
    assert.match(board, /onClick=\{\(\) => onOpenPost\(item\)\}/);
    assert.match(manager, /handleOpenSubmissionBoardPost[\s\S]*fetchedPosts\.find\(\(post\) => post\.id === submission\.post_id\)[\s\S]*setSelectedPost\(targetPost\)/);
    assert.match(manager, /handleReviewMission\(mission, submission\.post_id\)/);
    assert.match(manager, /initialPostId: activeGenreReviewPostId/);
    assert.match(ideaMarket, /ideas\.find\(\(idea\) => idea\.id === postId\)[\s\S]*setDetailModal\(targetIdea\)/);
    assert.match(styles, /recent-status\.is-first[\s\S]*recent-status\.is-resubmitted[\s\S]*recent-status\.is-repeated/);
    assert.match(styles, /submission-group > header[\s\S]*submission-group li button/);
    assert.match(styles, /grid-template-columns: minmax\(260px, 0\.68fr\) minmax\(0, 1\.62fr\)/);
    assert.match(styles, /status-table[\s\S]*td\.is-confirmed[\s\S]*td\.is-pending[\s\S]*td\.is-rewriting[\s\S]*td\.is-waiting/);
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
    const [migration, studentStatusMigration, hook, harness] = await Promise.all([
        read('supabase/migrations/20261167_teacher_assignment_submission_board.sql'),
        read('supabase/migrations/20261176_teacher_submission_student_status_board.sql'),
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
    assert.match(studentStatusMigration, /student_assignment_rows AS MATERIALIZED[\s\S]*student_status_rows AS MATERIALIZED/);
    assert.match(studentStatusMigration, /'student_statuses'[\s\S]*LIMIT 100/);
    assert.match(studentStatusMigration, /recent_base AS MATERIALIZED[\s\S]*submission_number/);
    assert.match(studentStatusMigration, /attempt\.object_id = recent\.post_id/);
    assert.doesNotMatch(studentStatusMigration, /post_content|original_content|structured_content|ai_feedback|eval_comment/);
    assert.match(hook, /hydrateSubmissionBoard\(overview\.submission_board/);
    assert.match(harness, /교사 과제 제출 전광판[\s\S]*12초당 경량 RPC 1회[\s\S]*학생별 네 상태 합계 최대 100명/);
});

test('승인·회수·다시쓰기 동작은 추가 목록 조회 없이 전광판 상태를 즉시 바꾼다', async () => {
    const [managerHook, boardHook] = await Promise.all([
        read('src/hooks/useMissionManager.js'),
        read('src/modules/writing/submission-board/useTeacherSubmissionBoard.js')
    ]);

    assert.match(managerHook, /transitionMissionStatus\(post\.mission_id, 'approve', 1, \[post\.student_id\]\)/);
    assert.match(managerHook, /transitionMissionStatus\(post\.mission_id, 'recover', 1, \[post\.student_id\]\)/);
    assert.match(managerHook, /transitionMissionStatus\(post\.mission_id, 'request-rewrite', 1, \[post\.student_id\]\)/);
    assert.match(managerHook, /'recall',[\s\S]*\(updated \|\| \[\]\)\.map\(\(post\) => post\.student_id\)/);
    assert.match(boardHook, /STUDENT_TRANSITION_DELTAS[\s\S]*student_statuses: studentStatuses/);
    assert.doesNotMatch(managerHook, /setSubmissionCounts/);
});

/*
 * 2026-08-25: 최근 제출 줄에서 ① 글자가 너무 작고 ② 오른쪽이 넓게 비어 보인다는 지적을 받았고,
 * ③ 같은 제목의 과제를 두 번 내면 어떻게 보이는지 물어 확인한 결과 **구분할 방법이 없었다**.
 *
 * ⚠️ 묶는 기준은 과제 **id** 라 같은 제목이어도 묶음은 갈린다. 그런데 머리말에는 제목만 있어
 *    교사 눈에는 **똑같은 이름 두 개**로 보였다. 어느 쪽이 이번 주 과제인지 알 수 없다.
 */
test('최근 제출 줄은 읽히는 크기이고 같은 제목 과제를 가른다', async () => {
    const [board, styles] = await Promise.all([
        read('src/components/teacher/TeacherSubmissionBoard.jsx'),
        read('src/components/teacher/TeacherSubmissionBoard.css')
    ]);

    // 이름·시간이 잔글씨로 되돌아가면 걸린다.
    assert.match(styles, /font-size: var\(--ui-text-md\);\n    font-weight: 900;\n    text-overflow: ellipsis;/);
    assert.doesNotMatch(styles, /font-size: 0\.78rem;/);
    assert.doesNotMatch(styles, /font-size: 0\.65rem;/);

    // 좁아진 최근 제출 칸은 이름·시간과 제출 차수 두 열만 사용한다.
    assert.match(styles, /__recent \.teacher-submission-board__submission-group li button \{\n    grid-template-columns: minmax\(0, 1fr\) auto;/);
    assert.match(board, /teacher-submission-board__row-spacer/);

    // 같은 제목이 **둘 이상일 때만** 날짜를 붙인다. 늘 붙이면 쓸데없는 글자가 는다.
    assert.match(board, /titleCounts\.get\(group\.title\) > 1 && group\.createdAt/);
    assert.match(board, /낸 과제/);
    assert.match(board, /group\.subtitle && \(/);
});

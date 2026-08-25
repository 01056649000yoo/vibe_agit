/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('선생님 과제와 제출 전광판은 데스크톱에서 정확히 절반씩 배치된다', async () => {
    const [manager, board, styles, missionList] = await Promise.all([
        read('src/components/teacher/MissionManager.jsx'),
        read('src/components/teacher/TeacherSubmissionBoard.jsx'),
        read('src/components/teacher/TeacherSubmissionBoard.css'),
        read('src/components/teacher/MissionList.jsx')
    ]);

    assert.match(manager, /teacher-mission-live-layout[\s\S]*TeacherSubmissionBoard/);
    assert.match(styles, /grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)/);
    assert.match(styles, /@media \(max-width: 1180px\)[\s\S]*grid-template-columns:\s*minmax\(0, 1fr\)/);
    assert.match(missionList, /getMissionCardColumns\(missionCardSize, splitView\)/);
    assert.match(manager, /isFormOpen \|\| isMissionTypePickerOpen \? ' is-single'/);
    assert.match(board, /실시간 제출 전광판/);
});

test('전광판은 과제별 제출 상태와 최근 제출을 같은 스냅샷으로 표시한다', async () => {
    const [board, hook, missionList] = await Promise.all([
        read('src/components/teacher/TeacherSubmissionBoard.jsx'),
        read('src/modules/writing/submission-board/useTeacherSubmissionBoard.js'),
        read('src/components/teacher/MissionList.jsx')
    ]);

    assert.match(board, /승인/);
    assert.match(board, /확인 대기/);
    assert.match(board, /다시쓰기/);
    assert.match(board, /미제출/);
    assert.match(board, /recent_submissions[\s\S]*slice\(0, 4\)/);
    assert.match(board, /post_resubmitted[\s\S]*다시 제출/);
    assert.match(board, /resolveGenreMissionTypeId\(mission\) === 'meeting'/);
    assert.match(missionList, /제출 \$\{submittedCount\}\/\$\{totalStudentCount\}/);
    assert.doesNotMatch(missionList, /명 완료/);
    assert.match(hook, /TRANSITION_DELTAS[\s\S]*request-rewrite[\s\S]*undo-recall/);
});

test('교사 전광판 폴링은 12초·가시 화면·단일 진행 요청 계약을 지킨다', async () => {
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
    assert.match(hook, /getTeacherSubmissionBoardInitialDelay/);
    assert.match(hook, /getTeacherSubmissionBoardNextDelay/);
    assert.doesNotMatch(hook, /setInterval\s*\(|\.channel\(|postgres_changes/);
    assert.match(api, /get_teacher_assignment_submission_board_v1/);
    assert.match(api, /p_recent_limit:\s*TEACHER_SUBMISSION_BOARD_RECENT_LIMIT/);
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

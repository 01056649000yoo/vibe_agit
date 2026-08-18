/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('학생 홈은 공용 bootstrap 외 직접 DB 조회를 만들지 않는다', async () => {
    const dashboard = await read('src/components/student/StudentDashboard.jsx');
    assert.doesNotMatch(dashboard, /supabase\.(?:from|rpc)\(/);
    assert.match(await read('src/modules/home/studentHomeApi.js'), /get_student_home_bootstrap_v1/);
});

test('학생 과제 목록과 글쓰기 화면은 Realtime 연결을 열지 않는다', async () => {
    for (const file of [
        'src/components/student/MissionList.jsx',
        'src/hooks/useMissionSubmit.js',
        'src/components/student/StudentDashboard.jsx',
        'src/modules/notifications/ActivityNotificationPanel.jsx'
    ]) {
        const source = await read(file);
        assert.doesNotMatch(source, /\.channel\(|postgres_changes/, `${file}에 학생별 Realtime이 다시 들어왔습니다.`);
    }
});

test('학생 상시 알림은 WebSocket 대신 분산된 공용 홈 동기화를 쓴다', async () => {
    const app = await read('src/App.jsx');
    const dashboard = await read('src/components/student/StudentDashboard.jsx');
    assert.doesNotMatch(app, /\.channel\(|postgres_changes/);
    assert.doesNotMatch(dashboard, /useRealtimeNotifications/);
    assert.match(app, /240000[\s\S]*120000/);
    assert.match(app, /refreshStudentHome\(\{ force: true \}\)/);
});

test('학생 활동 알림은 bootstrap 요약과 열 때만 목록 RPC를 사용한다', async () => {
    const dashboard = await read('src/components/student/StudentDashboard.jsx');
    const api = await read('src/modules/notifications/notificationApi.js');
    const panel = await read('src/modules/notifications/ActivityNotificationPanel.jsx');
    const migration = await read('supabase/migrations/20261023_student_activity_notifications.sql');

    assert.match(dashboard, /homeBootstrap\?\.activity_notifications/);
    assert.doesNotMatch(dashboard, /supabase\.(?:from|rpc)\(/);
    assert.match(api, /get_my_activity_notifications_v1/);
    assert.match(api, /mark_my_activity_notifications_read_v1/);
    assert.match(panel, /listUnread\(\{ limit: 50 \}\)/);
    assert.doesNotMatch(panel, /setInterval\s*\(|\.channel\(|postgres_changes/);
    assert.match(migration, /activity_notifications[\s\S]*unread_count[\s\S]*latest/);
    assert.match(migration, /LIMIT v_limit \+ 1/);
});

test('친구 글 상세 화면은 고정 DB 폴링을 사용하지 않는다', async () => {
    for (const file of [
        'src/hooks/usePostInteractions.js',
        'src/components/student/PostDetailModal.jsx'
    ]) {
        const source = await read(file);
        assert.doesNotMatch(source, /setInterval\s*\(/, `${file}에 상세 화면 고정 폴링이 남아 있습니다.`);
        assert.match(source, /visibilitychange/);
    }
});

test('학생 설정은 짧은 고정 폴링을 사용하지 않는다', async () => {
    for (const file of [
        'src/modules/enabledModuleSettings.js',
        'src/modules/writing/editor-settings/WritingEditorSettingsContext.jsx'
    ]) {
        const source = await read(file);
        assert.doesNotMatch(source, /setInterval\s*\(/, `${file}에 고정 폴링이 남아 있습니다.`);
    }
});

test('교사 보관함은 미션별 count N+1을 사용하지 않는다', async () => {
    const source = await read('src/components/teacher/ArchiveManager.jsx');
    assert.doesNotMatch(source, /Promise\.all\s*\(\s*missions\.map/);
    assert.match(source, /get_teacher_archived_missions_page/);
});

test('성능 마이그레이션은 bootstrap·제출·권한 계약을 가진다', async () => {
    const migration = await read('supabase/migrations/20261006_student_scaling_harness.sql');
    assert.match(migration, /get_student_home_bootstrap_v1/);
    assert.match(migration, /submit_assignment_post_v1/);
    assert.match(migration, /get_teacher_archived_missions_page/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.writing_engine_submit_assignment/);
});

test('교사 첫 화면은 bootstrap 한 번으로 공통 데이터를 받는다', async () => {
    const authStore = await read('src/store/useAuthStore.js');
    const dashboardHook = await read('src/hooks/useTeacherDashboard.js');
    const missionHook = await read('src/hooks/useMissionManager.js');
    const migration = await read('supabase/migrations/20261007_teacher_app_bootstrap.sql');

    assert.match(authStore, /get_teacher_app_bootstrap_v1/);
    assert.match(dashboardHook, /if \(teacherBootstrap\) return;/);
    assert.match(missionHook, /if \(bootstrapProfile\) return;/);
    assert.match(migration, /LIMIT 100/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_teacher_app_bootstrap_v1/);
});

test('교사 과제 목록과 제출글에는 100개 상한이 있다', async () => {
    const source = await read('src/hooks/useMissionManager.js');
    const migration = await read('supabase/migrations/20261008_mission_overview_scaling.sql');
    assert.match(source, /\.limit\(100\)/, '과제별 제출글에 limit(100)이 필요합니다.');
    assert.match(migration, /v_limit INTEGER := LEAST\(GREATEST\(COALESCE\(p_limit, 100\), 1\), 100\)/,
        '교사 과제 목록 RPC에 최대 100개 상한이 필요합니다.');
});

test('학생·교사 과제 목록은 각각 전용 RPC 한 번을 우선 사용한다', async () => {
    assert.match(await read('src/components/student/MissionList.jsx'), /get_student_mission_list_v1/);
    assert.match(await read('src/hooks/useMissionManager.js'), /get_teacher_mission_overview_v1/);

    const migration = await read('supabase/migrations/20261008_mission_overview_scaling.sql');
    assert.match(migration, /idx_writing_missions_class_active_created/);
    assert.match(migration, /LEAST\(GREATEST\(COALESCE\(p_limit, 100\), 1\), 100\)/g);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_student_mission_list_v1/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_teacher_mission_overview_v1/);
});

test('학생 글쓰기 화면은 과제와 기존 글을 작업공간 RPC 한 번으로 우선 읽는다', async () => {
    const source = await read('src/hooks/useMissionSubmit.js');
    const migration = await read('supabase/migrations/20261008_mission_overview_scaling.sql');
    assert.match(source, /get_student_assignment_workspace_v1/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_student_assignment_workspace_v1/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.get_student_assignment_workspace_v1/);
});

test('연구소 결과는 학생이 도구를 열 때만 최대 20개를 읽고 홈·폴링·Realtime을 쓰지 않는다', async () => {
    const host = await read('src/modules/writing/tools/WritingToolHost.jsx');
    const manifest = await read('src/modules/writing/tools/lab-results/manifest.js');
    const api = await read('src/modules/writing/tools/lab-results/api.js');
    const tool = await read('src/modules/writing/tools/lab-results/LabResultsTool.jsx');

    assert.match(host, /lazy\(manifest\.studentEntry\)/);
    assert.match(manifest, /home: 'none'/);
    assert.match(manifest, /load: 'on-open'/);
    assert.match(manifest, /realtime: 'none'/);
    assert.match(manifest, /maxInitialRows: 20/);
    assert.match(api, /get_my_lab_results_v1/);
    assert.match(tool, /limit: 20/);
    for (const source of [api, tool]) {
        assert.doesNotMatch(source, /setInterval\s*\(|\.channel\(|postgres_changes/);
    }
});

test('글쓰기 참고함 연구소 자료는 패널을 열 때 단일 RPC로 최대 20개만 읽는다', async () => {
    const studentWriting = await read('src/components/student/StudentWriting.jsx');
    const source = await read('src/modules/writing/references/LabReferenceSource.jsx');
    const api = await read('src/modules/writing/tools/lab-results/api.js');
    const migration = await read('supabase/migrations/20261104_writing_reference_sources.sql');

    assert.match(studentWriting, /<LabReferenceSource missionId=\{missionId\} isActive=\{isOpen\}/);
    assert.match(source, /if \(!isActive \|\| loaded \|\| loading \|\| error\) return/);
    assert.match(source, /listForWritingReference\(\{ missionId, limit: 20 \}\)/);
    assert.match(api, /supabase\.rpc\('get_my_writing_references_v1'/);
    assert.match(migration, /LIMIT v_limit/);
    for (const content of [source, api]) {
        assert.doesNotMatch(content, /setInterval\s*\(|\.channel\(|postgres_changes/);
    }
});

test('연구소 활동 목록은 학생이 메뉴를 열 때 단일 RPC로 최대 20개를 읽는다', async () => {
    const dashboard = await read('src/components/student/DashboardMenu.jsx');
    const manifest = await read('src/modules/writing/lab-activities/manifest.js');
    const api = await read('src/modules/writing/lab-activities/api.js');
    const page = await read('src/modules/writing/lab-activities/LabActivitiesPage.jsx');

    assert.match(dashboard, /module\.studentDashboard/);
    assert.doesNotMatch(dashboard, /supabase\.(?:from|rpc)/);
    assert.match(manifest, /home: 'none'/);
    assert.match(manifest, /load: 'on-open'/);
    assert.match(manifest, /realtime: 'none'/);
    assert.match(manifest, /maxInitialRows: 20/);
    assert.match(api, /get_my_lab_activities_v1/);
    assert.match(page, /limit: 20/);
    for (const source of [api, page]) {
        assert.doesNotMatch(source, /setInterval\s*\(|\.channel\(|postgres_changes/);
    }
});

test('핵심 통합 RPC 실패 시 과거 다중 조회로 조용히 돌아가지 않는다', async () => {
    for (const file of [
        'src/store/useAuthStore.js',
        'src/components/student/MissionList.jsx',
        'src/hooks/useMissionSubmit.js',
        'src/hooks/useMissionManager.js'
    ]) {
        assert.doesNotMatch(await read(file), /기존 조회로 전환|기존 조회 폴백/, `${file}에 무거운 호환 폴백이 남아 있습니다.`);
    }
});

test('친구 반응·댓글 쓰기는 권한 검증 RPC만 사용한다', async () => {
    const interactions = await read('src/hooks/usePostInteractions.js');
    const hideout = await read('src/modules/community/friends-hideout/useFriendsHideout.js');
    const migration = await read('supabase/migrations/20261010_friend_interaction_writes.sql');
    assert.match(interactions, /toggle_my_post_reaction_v1/);
    assert.match(interactions, /create_my_post_comment_v1/);
    assert.match(interactions, /update_my_post_comment_v1/);
    assert.match(interactions, /delete_my_post_comment_v1/);
    assert.match(hideout, /toggle_my_post_reaction_v1/);
    assert.match(migration, /class_id = v_student\.class_id/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.toggle_my_post_reaction_v1/);
});

test('독서록 책장은 다섯 조회 대신 화면 전용 RPC 한 번을 사용한다', async () => {
    const source = await read('src/modules/writing/reading-log/ReadingLogPage.jsx');
    const section = source.slice(source.indexOf('const fetchLogs'), source.indexOf('const openList'));
    assert.match(section, /get_my_reading_library_v1/);
    assert.doesNotMatch(section, /Promise\.all|\.from\(/);
});

test('교사 글 상세는 반응·댓글을 한 RPC로 읽는다', async () => {
    const source = await read('src/hooks/useMissionManager.js');
    const section = source.slice(source.indexOf('const fetchReactionsAndComments'), source.indexOf('const handleEvaluationMode'));
    assert.match(section, /get_teacher_post_detail_v1/);
    assert.doesNotMatch(section, /\.from\('post_reactions'\)|\.from\('post_comments'\)/);
});

test('활동 보고서는 1,000개 고정 절단 대신 200개 커서 RPC를 사용한다', async () => {
    const source = await read('src/components/teacher/ActivityReport.jsx');
    const migration = await read('supabase/migrations/20261013_activity_report_workspace.sql');
    assert.match(source, /get_teacher_activity_report_workspace_v1/);
    assert.doesNotMatch(source, /\.limit\(1000\)/);
    assert.doesNotMatch(await read('src/hooks/useEvaluation.js'), /\.limit\(1000\)/);
    assert.match(await read('src/hooks/useEvaluation.js'), /get_teacher_mission_evaluation_report_v1/);
    assert.match(migration, /LEAST\(GREATEST\(COALESCE\(p_limit,200\),1\),200\)/);
    assert.match(migration, /next_offset/);
});

test('승인·회수 성공 뒤 전체 목록을 다시 조회하지 않는다', async () => {
    const source = await read('src/hooks/useMissionManager.js');
    const section = source.slice(
        source.indexOf('const handleApprovePost'),
        source.indexOf('const handleBulkRequestRewrite')
    );
    assert.doesNotMatch(section, /fetchPostsForMission\(|fetchMissions\(/);
    assert.match(section, /setSubmissionCounts/);
});

test('등록된 콘텐츠는 성능 계약을 빠짐없이 선언한다', async () => {
    const registry = await read('src/modules/registry.js');
    const manifestImports = [...registry.matchAll(/from ['"](\.\/[^'"]+\/manifest)['"]/g)]
        .map((match) => `src/modules/${match[1].replace(/^\.\//, '')}.js`);
    assert.ok(manifestImports.length > 0);

    for (const manifestPath of manifestImports) {
        const source = await read(manifestPath);
        assert.match(source, /performance:\s*\{[^}]*home:[^}]*load:[^}]*writes:[^}]*realtime:[^}]*maxInitialRows:/s,
            `${manifestPath}에 신규 콘텐츠 성능 계약이 없습니다.`);
    }
});

test('임시 저장 성공은 대화상자가 아니라 화면 안에서 알린다', async () => {
    const [hook, writing, diary, readingLog] = await Promise.all([
        read('src/hooks/useMissionSubmit.js'),
        read('src/components/student/StudentWriting.jsx'),
        read('src/modules/writing/diary/DiaryPage.jsx'),
        read('src/modules/writing/reading-log/ReadingLogPage.jsx')
    ]);

    // 2026-08-17 학생 태블릿 제보: 임시 저장을 눌러도 알림이 안 뜨고 화면이 위로 튀었다.
    // alert 가 입력 포커스를 빼앗아 키보드를 닫고, 저장을 반복하면 브라우저가
    // "추가 대화상자 표시 안 함"을 물어 학생이 체크하는 순간 조용히 무시되기 때문이다.
    // 저장 자체는 성공하고 있었다(RPC 200). 성공 알림만 화면 안 표시로 옮겼다.
    for (const [name, source] of [
        ['과제 글쓰기', hook],
        ['일기', diary],
        ['독서록', readingLog]
    ]) {
        assert.ok(!/alert\([^)]*임시\s?저장했어요/.test(source)
            && !/alert\([^)]*안전하게 임시 저장/.test(source),
            `${name} 저장 성공을 alert 로 알리면 안 됩니다.`);
    }

    // 실패는 놓치면 글을 잃을 수 있어 대화상자를 유지한다.
    assert.match(hook, /alert\('저장 중 오류가 발생했습니다\.'\)/);
    assert.match(diary, /alert\('이 기기에는 남겼지만 서버 임시 저장에 실패했어요/);
    assert.match(readingLog, /alert\('이 기기에는 남겼지만 서버 임시 저장에 실패했어요/);

    // 과제 화면은 저장 시각을 화면 안에 잠깐 띄우고, 타이머를 정리한다.
    assert.match(writing, /setManualSavedAt\(new Date\(\)\)/);
    assert.match(writing, /저장했어요 ✓/);
    assert.match(writing, /clearTimeout\(manualSavedTimerRef\.current\)/);
});

test('부팅 중에는 홈과 같은 자리의 뼈대를 먼저 보여 준다', async () => {
    const [app, skeleton, css, authStore] = await Promise.all([
        read('src/App.jsx'),
        read('src/components/common/BootSkeleton.jsx'),
        read('src/components/common/BootSkeleton.css'),
        read('src/store/useAuthStore.js')
    ]);

    // /lab(연구소)은 서버가 완성된 HTML을 보내 바로 그려지는데 /(아지트)는 빈 껍데기를 받아
    // JS 실행 → 세션 확인 → 홈 데이터를 기다린다. 그래서 연구소에서 돌아올 때만
    // "처음 로딩"으로 되돌아간 것처럼 보였다(2026-08-17 제보).
    assert.match(app, /BOOT_SKELETON_KIND \? <BootSkeleton kind=\{BOOT_SKELETON_KIND\} \/> : <Loading \/>/);
    // 첫 렌더 전에 한 번만 정해야 화면이 도중에 흔들리지 않는다.
    assert.match(app, /const BOOT_SKELETON_KIND = getBootSkeletonKind\(\);/);

    // 로그아웃 상태에 학생 홈 틀이 잘못 뜨면 안 되므로 저장된 세션으로 동기 판정한다.
    assert.match(authStore, /export const getBootSkeletonKind/);
    assert.match(authStore, /student_session'\) !== null\) return 'student'/);
    assert.match(authStore, /return hasTeacherToken \? 'teacher' : null/);

    // 실제 홈과 같은 2열 배치를 학생에게만 보여 준다(교사 홈에는 그 자리가 없다).
    assert.match(skeleton, /kind === 'student' && \(/);
    assert.match(css, /\.boot-skeleton__grid \{[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /max-width: 1024px[\s\S]*?\.boot-skeleton__grid \{ grid-template-columns: 1fr; \}/);
    // 움직임 최소화 설정에서는 반짝임을 끈다.
    assert.match(css, /prefers-reduced-motion: reduce[\s\S]*?animation: none/);
});

test('학습 성취 공개 범위는 서버가 가르고 홈에는 붙지 않는다', async () => {
    const [hook, badges, friendCard, myAgit, migration] = await Promise.all([
        read('src/modules/learning/useLearningMastery.js'),
        read('src/modules/learning/MasteryBadges.jsx'),
        read('src/modules/community/friends-hideout/profile/cards/FriendMasteryCard.jsx'),
        read('src/components/student/MyAgitPanel.jsx'),
        read('supabase/migrations/20261122_learning_mastery_emblems.sql')
    ]);

    // 보는 사람마다 **RPC 자체가 다르다**. 한 응답을 화면에서 걸러 쓰면 개발자 도구로 보인다.
    assert.match(hook, /viewer === 'me'\) return 'get_my_learning_mastery_v1'/);
    assert.match(hook, /viewer === 'classmate'\) return 'get_classmate_learning_mastery_v1'/);
    assert.match(hook, /viewer === 'teacher'\) return 'get_student_learning_mastery_v1'/);
    // 친구용 응답에는 진행도가 아예 없어야 한다(A안, 2026-08-17 결정).
    assert.match(migration, /'passed_count', CASE WHEN p_include_progress THEN passed\.passed_count ELSE NULL END/);
    assert.match(migration, /learning_engine_mastery_summary_v1\(v_friend\.id, v_friend\.class_id, FALSE\)/);
    // 화면은 값이 없으면 진행 칸을 그리지 않는다(가리는 게 아니라 없는 것).
    assert.match(badges, /item\.passed_count !== undefined && item\.passed_count !== null/);
    assert.match(friendCard, /viewer: 'classmate'/);

    // 홈이 아니라 나의 아지트를 **열 때만** 부른다(성능 계약: 홈 추가 조회 0회).
    assert.match(myAgit, /useLearningMastery\(\{\s*\n?\s*viewer: 'me', active: isOpen/);
    assert.doesNotMatch(await read('src/components/student/StudentDashboard.jsx'), /useLearningMastery/);
});

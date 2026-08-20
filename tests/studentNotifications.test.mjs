/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('내 글 소식과 지금 할 일과 활동 알림의 책임이 겹치지 않는다', async () => {
    const [todo, header, feedback, dashboard] = await Promise.all([
        read('src/components/student/StudentTodoCard.jsx'),
        read('src/components/student/StudentHeader.jsx'),
        read('src/components/student/StudentFeedbackModal.jsx'),
        read('src/components/student/StudentDashboard.jsx')
    ]);

    assert.match(todo, /지금 할 일/);
    assert.match(todo, /시작 전 과제/);
    assert.match(todo, /작성 중인 과제/);
    assert.match(todo, /다시 쓸 글/);
    assert.doesNotMatch(todo, /새 소식|hasActivity|onOpenFeedback|supabase\./);
    assert.match(header, /내 글 소식/);
    assert.match(header, /hasActivity/);
    assert.match(feedback, /친구들 반응/);
    assert.match(feedback, /label: '댓글'/);
    assert.match(dashboard, /student-home-action-grid/);
    assert.match(dashboard, /ActivityNotificationPanel/);
    assert.doesNotMatch(dashboard, /TeacherNotifyBanner|useStudentSyncNotifications/);
});

test('지금 할 일과 활동 알림은 같은 컴팩트 높이에서 핵심 내용만 표시한다', async () => {
    const [todo, todoCss, notificationCss] = await Promise.all([
        read('src/components/student/StudentTodoCard.jsx'),
        read('src/components/student/StudentTodoCard.css'),
        read('src/modules/notifications/ActivityNotificationPanel.css')
    ]);

    assert.match(todo, /disabled=\{count === 0\}/);
    assert.match(todo, /student-todo-card__rows/);
    assert.doesNotMatch(todo, /student-todo-row__action|student-todo-done/);
    assert.match(todoCss, /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
    assert.match(todoCss, /\.student-todo-row \{[\s\S]*?min-height: 78px/);
    assert.match(notificationCss, /\.activity-notification-panel__body \{[\s\S]*?min-height: 78px/);
});

test('내 글 소식은 빨간 점 대신 문자 배지와 버튼 전체 강조로 새 소식을 알린다', async () => {
    const [header, headerCss] = await Promise.all([
        read('src/components/student/StudentHeader.jsx'),
        read('src/components/student/StudentHeader.css')
    ]);

    assert.match(header, /hasNotice \? ' has-notice' : ''/);
    assert.match(header, /aria-label=\{hasNotice \? `\$\{label\}, 새 소식 있음` : label\}/);
    assert.match(header, /student-home-toolbar__notice-full">새 소식/);
    assert.match(header, /student-home-toolbar__notice-compact">새/);
    assert.doesNotMatch(header, /<i aria-label="새 소식 있음"/);
    assert.match(headerCss, /\.student-home-toolbar__action\.has-notice \{[\s\S]*?background: #FFF2EE/);
    assert.match(headerCss, /animation: student-home-news-arrival \.72s ease-out 2/);
    assert.match(headerCss, /prefers-reduced-motion: reduce[\s\S]*?animation: none/);
});

test('내 글 소식은 알림별 확인과 모두 확인으로 정리한다', async () => {
    const [modal, hook, dashboard] = await Promise.all([
        read('src/components/student/StudentFeedbackModal.jsx'),
        read('src/hooks/useStudentDashboard.js'),
        read('src/components/student/StudentDashboard.jsx')
    ]);

    // 탭을 모두 방문해야 읽음 처리되던 조건은 없앴다. 전체 탭에서 소식을 다 보고 닫은
    // 학생에게 배지가 그대로 남아 "눌러도 안 사라진다"가 됐기 때문이다.
    assert.doesNotMatch(modal, /requiredTabs|visitedTabs/);
    assert.match(modal, /const saved = await onMarkRead\(item\.id\)/);
    assert.match(modal, /const saved = await onMarkAllRead\(\)/);
    assert.match(modal, /✓ 확인/);
    assert.match(modal, /모두 확인/);
    // 확인 버튼은 카드 전체의 글 이동으로 새면 안 된다.
    assert.match(modal, /event\.stopPropagation\(\)/);
    assert.match(hook, /notificationApi\.markRead\(\[notificationId\]\)/);
    assert.match(hook, /notificationApi\.markAllRead\(\{ moduleIds: FEEDBACK_MODULE_IDS \}\)/);
    assert.match(dashboard, /onClose=\{handleCloseFeedback\}/);
    assert.match(dashboard, /onMarkRead=\{handleMarkFeedbackRead\}/);
    assert.match(dashboard, /onMarkAllRead=\{handleMarkAllFeedbackRead\}/);
});

test('읽음 처리는 홈 캐시를 비워 배지가 되살아나지 않게 한다', async () => {
    const [hook, dashboard, homeApi] = await Promise.all([
        read('src/hooks/useStudentDashboard.js'),
        read('src/components/student/StudentDashboard.jsx'),
        read('src/modules/home/studentHomeApi.js')
    ]);

    assert.match(homeApi, /invalidate\(studentId, \{ notify = true \} = \{\}\)/);
    // 확인할 때마다 홈 RPC를 다시 부르면 스무 번 확인에 스무 번 왕복이 생긴다.
    assert.match(hook, /invalidateHomeCache\(\{ notify: false \}\)/);
    // 창을 닫을 때 한 번은 반드시 서버 값을 다시 받아야 앱이 든 옛 값이 갱신된다.
    assert.match(hook, /feedbackDirtyRef\.current = false;\s*\n\s*invalidateHomeCache\(\{ notify: true \}\)/);
    // 활동 알림도 같은 병을 앓고 있었다. 이쪽은 한두 건이라 확인 즉시 받는다.
    assert.match(dashboard, /onSummaryChange=\{\(summary\) => \{[\s\S]*?studentHomeApi\.invalidate\(studentSession\.id\)/);
});

test('내 글 소식은 활동 알림과 같은 원장을 갈래로 나눠 쓴다', async () => {
    const [migration, api, hook, registry] = await Promise.all([
        read('supabase/migrations/20261116_feedback_notifications_ledger.sql'),
        read('src/modules/notifications/notificationApi.js'),
        read('src/hooks/useStudentDashboard.js'),
        read('src/modules/notifications/registry.js')
    ]);

    assert.match(migration, /feedback\.reaction_received/);
    assert.match(migration, /feedback\.comment_received/);
    // 반응은 껐다 켤 수 있고 댓글은 승인이 풀릴 수 있다. 원본이 사라지면 알림도 거둔다.
    assert.match(migration, /AFTER INSERT OR DELETE ON public\.post_reactions/);
    assert.match(migration, /AFTER INSERT OR DELETE OR UPDATE OF status ON public\.post_comments/);
    assert.match(migration, /NEW\.status IS DISTINCT FROM 'approved'[\s\S]*?DELETE FROM public\.student_notification_events/);
    // 갈래가 섞이면 승인·반려가 반응 스무 개에 묻힌다.
    assert.match(migration, /p_module_ids TEXT\[\] DEFAULT NULL/);
    assert.match(migration, /'feedback_notifications'/);
    assert.match(migration, /event\.module_id <> 'feedback'/);
    assert.match(api, /FEEDBACK_MODULE_IDS/);
    assert.match(api, /mark_my_activity_notifications_read_all_v1/);
    assert.match(hook, /moduleIds: FEEDBACK_MODULE_IDS/);
    assert.match(registry, /feedbackNotificationDefinitions/);
    // 과거 소식을 소급 생성하면 학생 한 명에게 수십 건이 한꺼번에 쏟아진다.
    assert.doesNotMatch(migration, /INSERT INTO public\.student_notification_events[\s\S]*?FROM public\.post_reactions/);
});

test('내 글 소식은 더 이상 last_feedback_check 시각으로 읽음을 가르지 않는다', async () => {
    const hook = await read('src/hooks/useStudentDashboard.js');

    assert.doesNotMatch(hook, /mark_feedback_as_read/);
    assert.doesNotMatch(hook, /lastCheckRef|lastCheckLoadedRef|ensureLastCheckLoaded/);
    assert.doesNotMatch(hook, /1970-01-01/);
    // 배지와 목록이 서로 다른 기준으로 세면 다시 어긋난다. 세는 곳은 홈 RPC 하나다.
    assert.doesNotMatch(hook, /from\('post_reactions'\)|from\('post_comments'\)/);
});

test('활동 알림은 단일 원장·중복 방지·학생 범위 RPC 계약을 갖는다', async () => {
    const migration = await read('supabase/migrations/20261023_student_activity_notifications.sql');

    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.student_notification_events/);
    assert.match(migration, /UNIQUE \(student_id, event_key\)/);
    assert.match(migration, /idx_student_notification_events_student_unread/);
    assert.match(migration, /notification_emit_v1/);
    assert.match(migration, /p_event_version SMALLINT DEFAULT 1/);
    assert.match(migration, /ON CONFLICT \(student_id, event_key\) DO NOTHING/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.notification_emit_v1[\s\S]*authenticated, service_role/);
    assert.match(migration, /get_my_activity_notifications_v1/);
    assert.match(migration, /mark_my_activity_notifications_read_v1/);
    assert.match(migration, /event\.class_id = v_student\.class_id[\s\S]*event\.student_id = v_student\.id/);
    assert.match(migration, /BETWEEN 1 AND 50/);
});

test('홈 bootstrap은 할 일 세 종류와 최신 미확인 알림을 한 번에 반환한다', async () => {
    const migration = await read('supabase/migrations/20261023_student_activity_notifications.sql');
    const api = await read('src/modules/home/studentHomeApi.js');
    const dashboard = await read('src/components/student/StudentDashboard.jsx');

    assert.match(migration, /'unstarted_missions'/);
    assert.match(migration, /'draft_missions'/);
    assert.match(migration, /'returned_count'/);
    assert.match(migration, /'activity_notifications'/);
    assert.match(migration, /'unread_count'/);
    assert.match(migration, /'latest'/);
    assert.match(api, /get_student_home_bootstrap_v1/);
    assert.doesNotMatch(dashboard, /supabase\.(?:from|rpc)\(/);
});

test('업무 변경은 권한 검증 RPC 또는 같은 트랜잭션의 투영 트리거에서 알림을 남긴다', async () => {
    const [migration, missionHook, assignmentApi] = await Promise.all([
        read('supabase/migrations/20261023_student_activity_notifications.sql'),
        read('src/hooks/useMissionManager.js'),
        read('src/modules/writing/assignmentApi.js')
    ]);

    assert.match(migration, /writing\.rewrite_requested/);
    assert.match(migration, /writing\.approved/);
    assert.match(migration, /writing\.approval_recovered/);
    assert.match(migration, /points\.adjusted/);
    assert.match(migration, /AFTER UPDATE OF is_returned, is_submitted, is_confirmed/);
    assert.match(migration, /AFTER INSERT ON public\.point_logs/);
    assert.match(assignmentApi, /request_assignment_rewrite_v1/);
    assert.match(assignmentApi, /bulk_request_assignment_rewrite_v1/);
    const rewriteSection = missionHook.slice(
        missionHook.indexOf('const handleRequestRewrite'),
        missionHook.indexOf('const handleFinalArchive')
    );
    assert.match(rewriteSection, /assignmentApi\.requestRewrite/);
    assert.match(rewriteSection, /assignmentApi\.requestRewrites/);
    assert.doesNotMatch(rewriteSection, /\.from\('student_posts'\)\.update|Promise\.all\(rewritePromises/);
    assert.match(rewriteSection, /p\.is_submitted && !p\.is_confirmed && !p\.is_returned/);
});

test('알림은 열 때가 아니라 확인 또는 이동 버튼에서만 읽음 처리한다', async () => {
    const panel = await read('src/modules/notifications/ActivityNotificationPanel.jsx');
    const api = await read('src/modules/notifications/notificationApi.js');

    assert.match(panel, /const handleConfirm = async/);
    assert.match(panel, /notificationApi\.markRead\(\[current\.id\]\)/);
    assert.doesNotMatch(panel.slice(panel.indexOf('useEffect(() =>'), panel.indexOf('const current')), /markRead/);
    assert.match(api, /get_my_activity_notifications_v1/);
    assert.match(api, /mark_my_activity_notifications_read_v1/);
});

test('활동 알림으로 연 글만 닫을 때 학생 홈으로 돌아가고 아지트 책장에서 연 글은 책장에 남는다', async () => {
    const [dashboard, myAgit, postDetail] = await Promise.all([
        read('src/components/student/StudentDashboard.jsx'),
        read('src/components/student/MyAgitPanel.jsx'),
        read('src/components/student/MyShelfPostDetail.jsx')
    ]);

    // 활동 알림에서만 채우는 initialPost가 진입 출처가 된다. 별도 전역 상태나 URL 분기를 만들지 않는다.
    assert.match(dashboard, /onOpenPost=\{\(post\) => \{[\s\S]*?setMyAgitInitialPost\(post\)/);
    assert.match(dashboard, /closeOnInitialPostClose=\{Boolean\(myAgitInitialPost\)\}/);
    // 일반 아지트 진입은 아지트 history를 남기지만 알림 진입은 글 상세 history 하나만 남긴다.
    assert.match(myAgit, /if \(!closeOnInitialPostClose\) \{\s*window\.history\.pushState\(\{ studentPage: 'main', overlay: 'my-agit' \}/);
    // 같은 상세 닫기(popstate)라도 알림 진입일 때만 부모 아지트까지 닫는다.
    assert.match(myAgit, /if \(selectedSummaryRef\.current\) \{[\s\S]*?if \(closeOnInitialPostClose\) onCloseRef\.current\?\.\(\);[\s\S]*?return;/);
    assert.match(myAgit, /onClose=\{\(\) => window\.history\.back\(\)\}/);
    // 실제 목적지가 홈인 알림 진입에서는 `내 서재`라고 오해시키지 않고 공용 뒤로가기 버튼을 쓴다.
    assert.match(myAgit, /returnsToHome=\{closeOnInitialPostClose\}/);
    assert.match(postDetail, /returnsToHome \? \([\s\S]*?<StudentBackButton onClick=\{onClose\} \/>/);
    assert.match(postDetail, /: \([\s\S]*?← 내 서재/);
});

test('새 모듈은 매니페스트 알림 정의만 등록해 공용 표시 레지스트리에 합칠 수 있다', async () => {
    const [types, registry, readme] = await Promise.all([
        read('src/modules/types.js'),
        read('src/modules/notifications/registry.js'),
        read('src/modules/notifications/README.md')
    ]);

    assert.match(types, /\[notifications\]/);
    assert.match(registry, /getAllModules\(\)\.flatMap\(\(module\) => module\.notifications \|\| \[\]\)/);
    assert.match(registry, /fallbackDefinition/);
    assert.match(readme, /notification_emit_v1/);
    assert.match(readme, /Realtime 연결은 없다/);
});

test('로그인과 홈 복귀는 공용 bootstrap의 최신성 규칙을 따른다', async () => {
    const [hook, app] = await Promise.all([
        read('src/modules/home/useStudentHomeBootstrap.js'),
        read('src/App.jsx')
    ]);

    assert.match(hook, /refresh\(\{ force: true \}\)/);
    assert.match(hook, /FOCUS_STALE_MS = 60000/);
    assert.match(hook, /refreshIfStale/);
    assert.match(app, /previousStudentHomePageRef/);
    assert.match(app, /studentPageName === 'main'[\s\S]*refreshStudentHomeIfStale/);
});

test('독서록과 일기는 글 완료 시 홈 알림 캐시를 무효화하고 자율 글 포인트 알림을 발행한다', async () => {
    const [diary, readingLog, migration] = await Promise.all([
        read('src/modules/writing/diary/DiaryPage.jsx'),
        read('src/modules/writing/reading-log/ReadingLogPage.jsx'),
        read('supabase/migrations/20261115_self_writing_reward_activity_notifications.sql')
    ]);

    assert.match(diary, /studentHomeApi\.invalidate\(studentSession\.id\)/);
    assert.match(readingLog, /studentHomeApi\.invalidate\(studentSession\.id\)/);
    assert.match(migration, /NEW\.activity_type = 'writing_reward'/);
    assert.match(migration, /post\.writing_context = 'self'/);
    assert.match(migration, /points\.adjusted/);
    assert.match(migration, /format\('point-log:%s', NEW\.id\)/);
});

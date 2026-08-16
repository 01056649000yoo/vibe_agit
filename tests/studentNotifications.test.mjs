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
    assert.match(feedback, /f\.teacher_id/);
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

test('내 글 소식은 새 항목이 있는 개별 탭을 모두 보면 자동 읽음 처리하고 닫을 때 목록을 정리한다', async () => {
    const [modal, hook, dashboard] = await Promise.all([
        read('src/components/student/StudentFeedbackModal.jsx'),
        read('src/hooks/useStudentDashboard.js'),
        read('src/components/student/StudentDashboard.jsx')
    ]);

    assert.match(modal, /requiredTabs\.every\(tabId => visitedTabs\.has\(tabId\)\)/);
    assert.match(modal, /if \(tabId === 1 \|\| tabId === 2\)/);
    assert.match(modal, /const saved = await onMarkRead\(\)/);
    assert.match(modal, /모두 확인했어요\. 창을 닫으면 목록이 정리돼요/);
    assert.doesNotMatch(modal, /소식을 모두 비울까요|🗑️.*비우기/);
    assert.match(hook, /feedbackReadRef\.current = true/);
    assert.match(hook, /if \(feedbackReadRef\.current\) setFeedbacks\(\[\]\)/);
    assert.match(dashboard, /onClose=\{handleCloseFeedback\}/);
    assert.match(dashboard, /onMarkRead=\{handleMarkFeedbackRead\}/);
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


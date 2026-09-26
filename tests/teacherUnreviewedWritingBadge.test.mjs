import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [dashboard, dashboardCss, readingLogManager, diaryManager, unreviewedHook] = await Promise.all([
    readFile('src/components/teacher/TeacherDashboard.jsx', 'utf8'),
    readFile('src/components/teacher/TeacherDashboard.css', 'utf8'),
    readFile('src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx', 'utf8'),
    readFile('src/modules/writing/diary/teacher/TeacherDiaryManager.jsx', 'utf8'),
    readFile('src/hooks/useTeacherUnreviewedWriting.js', 'utf8')
]);

test('교사 대시보드 최초 진입 기본 탭은 학급운영(operations)이다', () => {
    // loadTeacherTab fallback
    assert.match(dashboard, /return TEACHER_TAB_IDS\.includes\(savedTab\)\s*\?\s*savedTab\s*:\s*'operations';/);
    assert.match(dashboard, /catch\s*\{\s*return 'operations';\s*\}/);
    // visibleTab fallback
    assert.match(dashboard, /visibleTab\s*=\s*TEACHER_TAB_IDS\.includes\(currentTab\)\s*\?\s*currentTab\s*:\s*'operations';/);
});

test('useTeacherUnreviewedWriting 훅은 독서록·일기 미확인 카운트와 이벤트 동기화를 제공한다', () => {
    // 이벤트 상수 및 함수 선언
    assert.match(unreviewedHook, /export const TEACHER_WRITING_REVIEWED_EVENT = 'teacher-writing-reviewed';/);
    assert.match(unreviewedHook, /export const notifyTeacherWritingReviewed/);
    assert.match(unreviewedHook, /window\.dispatchEvent\(new CustomEvent\(TEACHER_WRITING_REVIEWED_EVENT\)\)/);

    // RPC 호출 계약 검증
    assert.match(unreviewedHook, /get_teacher_reading_log_overview/);
    assert.match(unreviewedHook, /get_teacher_diary_overview/);
    assert.match(unreviewedHook, /p_review_filter:\s*'unreviewed'/);

    // 이벤트 및 포커스 감지
    assert.match(unreviewedHook, /addEventListener\(TEACHER_WRITING_REVIEWED_EVENT/);
    assert.match(unreviewedHook, /addEventListener\('focus'/);
});

test('독서록 및 일기 관리자는 검토 처리 후 대시보드 미확인 알림을 동기화한다', () => {
    // ReadingLogManager
    assert.match(readingLogManager, /import\s*\{[^}]*notifyTeacherWritingReviewed[^}]*\}\s*from\s*['"][^'"]*useTeacherUnreviewedWriting/);
    assert.match(readingLogManager, /notifyTeacherWritingReviewed\(\)/);

    // DiaryManager
    assert.match(diaryManager, /import\s*\{[^}]*notifyTeacherWritingReviewed[^}]*\}\s*from\s*['"][^'"]*useTeacherUnreviewedWriting/);
    assert.match(diaryManager, /notifyTeacherWritingReviewed\(\)/);
});

test('교사 대시보드는 미확인 독서록·일기 수를 처리할 일 숫자로 보여 준다', () => {
    // 훅 연결
    assert.match(dashboard, /useTeacherUnreviewedWriting\(activeClass\?\.id\)/);

    // 2026-09-26: `NEW` 글자 배지를 숫자 배지 하나로 합쳤다. 상단 글쓰기 숫자는 세부 메뉴 합이다.
    assert.match(dashboard, /'reading-logs': readingLogsUnreviewedCount \+ readingPendingBooks/);
    assert.match(dashboard, /diaries: diariesUnreviewedCount/);
    assert.doesNotMatch(dashboard, />NEW</);
    assert.doesNotMatch(dashboardCss, /nav-new|new-badge/);
});

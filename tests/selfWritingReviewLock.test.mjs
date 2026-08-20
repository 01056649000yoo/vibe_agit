/* eslint-disable security/detect-non-literal-fs-filename */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(path, 'utf8');

test('확인 완료 독서록과 일기는 학생 수정·삭제를 서버와 화면에서 함께 잠근다', async () => {
    const [migration, readingPage, diaryPage] = await Promise.all([
        read('supabase/migrations/20261142_lock_checked_self_writing_and_export.sql'),
        read('src/modules/writing/reading-log/ReadingLogPage.jsx'),
        read('src/modules/writing/diary/DiaryPage.jsx')
    ]);

    assert.match(migration, /review\.review_status = 'checked'/);
    assert.match(migration, /BEFORE UPDATE OF title, content, structured_content, visibility/);
    assert.match(migration, /BEFORE DELETE/);
    assert.match(migration, /public\.auth_user_role\(\) = 'STUDENT'/);
    assert.match(migration, /public\.auth_student_id\(\) = OLD\.student_id/);

    for (const page of [readingPage, diaryPage]) {
        assert.match(page, /setLocked\(reviewResult\.data\?\.review_status === 'checked'\)/);
        assert.match(page, /선생님이 확인한 (?:독서록은|일기는) 수정할 수 없어요/);
        assert.match(page, /disabled=\{locked\}/);
        assert.match(page, /보완 요청을 보내면 다시 수정할 수 있어요/);
    }
});

test('학생 일기는 오늘 날짜를 기본으로 두고 확인 전에는 과거 날짜로 바꿀 수 있다', async () => {
    const [diaryPage, diaryMigration] = await Promise.all([
        read('src/modules/writing/diary/DiaryPage.jsx'),
        read('supabase/migrations/20261139_self_writing_teacher_approval_rewards.sql')
    ]);

    assert.match(diaryPage, /useState\(diaryDate \|\| today\)/);
    assert.match(diaryPage, /type="date"/);
    assert.match(diaryPage, /value=\{selectedDiaryDate\}/);
    assert.match(diaryPage, /max=\{today\}/);
    assert.match(diaryPage, /disabled=\{saving \|\| locked\}/);
    assert.match(diaryPage, /p_diary_date: selectedDiaryDate/);
    assert.match(diaryPage, /data\.structured_content\?\.diaryDate/);
    assert.match(diaryPage, /error\?\.code === '23505'/);
    assert.match(diaryMigration, /IF v_diary_date > v_today THEN/);
});

test('일기 날짜를 바꿔 저장하면 이전 날짜의 로컬·서버 임시본도 함께 정리한다', async () => {
    const [diaryPage, cleanupMigration] = await Promise.all([
        read('src/modules/writing/diary/DiaryPage.jsx'),
        read('supabase/migrations/20261146_self_writing_draft_bulk_cleanup.sql')
    ]);

    assert.match(diaryPage, /previousDiaryDatesRef\.current\.add\(selectedDiaryDate\)/);
    assert.match(diaryPage, /draftDatesToClear = \[\.\.\.new Set/);
    assert.match(diaryPage, /removeLocalDraft\(buildDraftKey/);
    assert.match(diaryPage, /delete_my_self_writing_drafts/);
    assert.match(diaryPage, /p_source_keys: draftDatesToClear\.slice\(0, 50\)/);
    assert.match(diaryPage, /previousDiaryDatesRef\.current\.clear\(\)/);
    assert.match(cleanupMigration, /draft\.student_id = v_student_id/);
    assert.match(cleanupMigration, /array_length\(p_source_keys, 1\).*BETWEEN 1 AND 50/);
    assert.match(cleanupMigration, /draft\.source_key = ANY\(p_source_keys\)/);
});

test('교사 독서록 전체 기록은 확인 완료된 학급 글을 RPC 한 번으로 내보낸다', async () => {
    const [migration, manager, exportHook] = await Promise.all([
        read('supabase/migrations/20261142_lock_checked_self_writing_and_export.sql'),
        read('src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx'),
        read('src/hooks/useDataExport.js')
    ]);

    assert.match(migration, /get_teacher_checked_reading_log_export_v1/);
    assert.match(migration, /review\.review_status = 'checked'/);
    assert.match(migration, /post\.class_id = p_class_id/);
    assert.match(migration, /LIMIT LEAST\(GREATEST\(COALESCE\(p_limit, 1000\), 1\), 2000\)/);
    assert.match(exportHook, /get_teacher_checked_reading_log_export_v1/);
    assert.match(manager, /확인 독서록 전체 내보내기/);
    assert.match(manager, /fetchCheckedReadingLogClassExportData\(2000\)/);
    assert.doesNotMatch(manager, /Promise\.all\([^)]*fetchWritingContentExportData/);
});

test('독서록과 일기의 학생별 책장·전체 기록은 같은 4열 UI를 쓰고 색만 구분한다', async () => {
    const [readingManager, diaryManager, workspace, workspaceCss] = await Promise.all([
        read('src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx'),
        read('src/modules/writing/diary/teacher/TeacherDiaryManager.jsx'),
        read('src/modules/writing/review/SelfWritingReviewWorkspace.jsx'),
        read('src/modules/writing/review/selfWritingReviewWorkspace.css')
    ]);

    for (const manager of [readingManager, diaryManager]) {
        assert.match(manager, /className="self-writing-student-grid"/);
        assert.match(manager, /className="self-writing-student-log-grid"/);
        assert.match(manager, /className="self-writing-review-queue"/);
        assert.match(manager, /selectable=\{false\}/);
    }
    assert.match(readingManager, /getSelfWritingRecordTone\(item\.review_status, 'reading'\)/);
    assert.match(diaryManager, /getSelfWritingRecordTone\(item\.review_status, 'diary'\)/);
    assert.match(workspace, /selectable = true/);
    assert.match(workspace, /reviewStatus === 'checked' \|\| reviewStatus === 'commented' \? checkedTone : 'pending'/);
    assert.match(workspaceCss, /\.self-writing-student-grid \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(workspaceCss, /\.self-writing-student-log-grid \{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(workspaceCss, /\.self-writing-queue-card\.is-reading/);
    assert.match(workspaceCss, /\.self-writing-queue-card\.is-diary/);
});

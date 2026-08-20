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

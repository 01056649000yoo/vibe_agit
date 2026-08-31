import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('일기·독서록 목록과 학생별 요약은 보완 중을 확인 완료와 분리한다', async () => {
    const migration = await readFile(
        'supabase/migrations/20261205_split_self_writing_review_statuses.sql',
        'utf8'
    );

    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_teacher_reading_log_overview\(/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_teacher_reading_log_student_summary\(/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_teacher_diary_overview\(/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_teacher_diary_student_summary\(/);

    assert.equal(
        (migration.match(/p_review_filter NOT IN \('all', 'unreviewed', 'revision_requested', 'reviewed'\)/g) || []).length,
        2
    );
    assert.match(migration, /COUNT\(\*\) FILTER \(WHERE review_status = 'revision_requested'\)/);
    assert.match(migration, /COUNT\(log\.student_id\) FILTER \(WHERE log\.review_status = 'revision_requested'\)/);
    assert.match(migration, /COUNT\(\*\) FILTER \(WHERE review\.review_status = 'revision_requested'\)/);
    assert.doesNotMatch(migration, /review_status <> 'unreviewed'|review_status IS NOT NULL|total_count - [a-z_.]*unreviewed/);
});

test('공용 검토 화면은 네 상태를 한 원본으로 표시한다', async () => {
    const [workspace, css] = await Promise.all([
        readFile('src/modules/writing/review/SelfWritingReviewWorkspace.jsx', 'utf8'),
        readFile('src/modules/writing/review/selfWritingReviewWorkspace.css', 'utf8')
    ]);

    assert.match(workspace, /id: 'unreviewed', label: '미확인'/);
    assert.match(workspace, /id: 'revision_requested', label: '보완 중'/);
    assert.match(workspace, /id: 'reviewed', label: '확인 완료'/);
    assert.match(workspace, /id: 'all', label: '전체'/);
    assert.match(workspace, /getSelfWritingReviewLabel/);
    assert.match(css, /\.self-writing-review-summary\s*\{[\s\S]*?grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(css, /\.self-writing-student-card__stats\s*\{[^}]*grid-template-columns: repeat\(4, 1fr\)/);
});

test('일기·독서록 관리 화면은 보완 중 수와 필터를 실제 응답에서 사용한다', async () => {
    const [diary, reading] = await Promise.all([
        readFile('src/modules/writing/diary/teacher/TeacherDiaryManager.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx', 'utf8')
    ]);

    for (const manager of [diary, reading]) {
        assert.match(manager, /revision_requested/);
        assert.match(manager, /getSelfWritingReviewLabel/);
        assert.match(manager, /has-revision/);
    }

    assert.match(diary, /revision_requested: Number\(data\?\.counts\?\.revision_requested \|\| 0\)/);
    assert.match(diary, /student\.revision_requested/);
    assert.match(diary, /student\.reviewed/);
    assert.doesNotMatch(diary, /Math\.max\(0, (?:Number\(student\.total\)|total) - (?:Number\(student\.unreviewed\)|unreviewed)\)/);

    assert.match(reading, /revision_requested: acc\.revision_requested \+ row\.revision_requested_count/);
    assert.match(reading, /getFilteredTotal\(shownCounts, effectiveReviewFilter\)/);
    assert.match(reading, /row\.revision_requested_count/);
});

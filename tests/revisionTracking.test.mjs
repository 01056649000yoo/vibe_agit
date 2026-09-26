import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

/*
 * 고친 자리 수(목록 카드 `🖍️ N군데 고침`)와 교사 수정본 보관(20261352, 2026-09-26).
 * 계산 규칙은 writingDiff.js 하나 — 서버는 저장·권한·무효화만 맡는다.
 */
const read = (file) => readFile(file, 'utf8');

test('서버: 두 칸·트리거·저장 함수와 권한', async () => {
    const sql = await read('supabase/migrations/20261352_post_revision_tracking.sql');
    assert.match(sql, /ADD COLUMN IF NOT EXISTS revision_change_count SMALLINT/);
    assert.match(sql, /ADD COLUMN IF NOT EXISTS teacher_revision_content TEXT/);
    // 전용 함수 밖에서는 두 칸을 바꾸지 못한다(학생도 자기 글 행은 고칠 수 있어서).
    assert.match(sql, /NEW\.revision_change_count IS DISTINCT FROM OLD\.revision_change_count AND NOT v_writer/);
    // 글이 바뀌거나 승인이 풀리면 비운다.
    assert.match(sql, /NEW\.content IS DISTINCT FROM OLD\.content[\s\S]*NOT COALESCE\(NEW\.is_confirmed, false\)[\s\S]*NEW\.revision_change_count := NULL/);
    // 담임 또는 관리자, 승인된 글만. anon 은 부르지 못한다.
    assert.match(sql, /post\.is_confirmed IS TRUE[\s\S]*class\.teacher_id = v_caller/);
    assert.match(sql, /REVOKE ALL ON FUNCTION public\.record_post_revision_counts_v1\(JSONB\) FROM PUBLIC, anon;/);
    assert.match(sql, /jsonb_array_length\(p_items\) > 200/);
});

test('교사 수정본 칸은 20261353 에서 뺐다 — 화면도 읽지 않는다', async () => {
    const sql = await read('supabase/migrations/20261353_drop_teacher_revision_content.sql');
    assert.match(sql, /DROP COLUMN IF EXISTS teacher_revision_content/);
    assert.doesNotMatch(sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.get_student_assignment_workspace_v1')), /post\.teacher_revision_content/);
    for (const file of ['src/hooks/useMissionManager.js', 'src/hooks/useMissionSubmit.js', 'src/components/student/MyAgitPanel.jsx',
        'src/components/teacher/TeacherStudentAgitViewer.jsx', 'src/components/teacher/PostDetailViewer.jsx', 'src/components/teacher/SubmissionStatusModal.jsx']) {
        assert.doesNotMatch(await read(file), /teacher_revision_content/, `${file} 이 지운 칸을 읽습니다.`);
    }
});

test('화면: 승인 두 경로가 모두 같은 규칙으로 센 수를 저장한다', async () => {
    const [manager, api] = await Promise.all([read('src/hooks/useMissionManager.js'), read('src/modules/writing/review/revisionCountApi.js')]);
    assert.match(api, /diffWritingText\(post\.original_content, post\.content\)\.changeCount/);
    assert.match(api, /rpc\('record_post_revision_counts_v1'/);
    assert.match(manager, /void recordRevisionCounts\(\[post\]\)/, '한 편 승인 뒤 저장이 없습니다.');
    assert.match(manager, /void recordRevisionCounts\(toApprove\)/, '한꺼번에 승인 뒤 저장이 없습니다.');
    assert.match(manager, /revision_change_count,\n/);
});

test('화면: 카드에 고친 자리 수를 표시한다', async () => {
    const [panel, submission, shelfBook, friend, agit] = await Promise.all([
        read('src/components/student/MyAgitPanel.jsx'),
        read('src/components/teacher/SubmissionStatusModal.jsx'),
        read('src/components/common/bookshelf/ShelfBook.jsx'),
        read('src/components/student/PostDetailModal.jsx'),
        read('src/components/teacher/TeacherStudentAgitViewer.jsx')
    ]);
    assert.match(panel, /visibility, created_at, updated_at, revision_change_count'\)/);
    assert.match(panel, /noteLabel=\{post\.revision_change_count > 0 \? `고친 곳 \$\{post\.revision_change_count\}군데`/);
    assert.match(panel, /<RevisionCountChip count=\{post\.revision_change_count\} \/>/);
    assert.match(submission, /<RevisionCountChip count=\{post\.revision_change_count\} \/>/);
    assert.match(shelfBook, /\$\{note \? `, \$\{noteLabel \|\| note\}` : ''\}/);
    assert.match(agit, /revision_change_count'\)/);
    assert.doesNotMatch(friend, /teacher_revision_content/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
    DIARY_LEVELS,
    READER_LEVELS,
    READING_LEVELS,
    getDiaryLevel,
    getReaderLevel,
    getReadingLevel
} from '../src/constants/writerLevels.js';

// 테스트가 넘기는 저장소 상대 경로만 읽는다.
// eslint-disable-next-line security/detect-non-literal-fs-filename
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('기록가 칭호는 서로 다른 일기 날짜 0·3·7·14·21·30·40일로 성장한다', () => {
    assert.deepEqual(DIARY_LEVELS.map((item) => item.from), [0, 3, 7, 14, 21, 30, 40]);
    assert.equal(getDiaryLevel(2).level, 1);
    assert.equal(getDiaryLevel(3).name, '하루 기록가');
    assert.equal(getDiaryLevel(39).level, 6);
    assert.equal(getDiaryLevel(40).name, '위대한 기록가');
});

test('독서가 칭호는 확인 독서록 수와 서로 다른 책 수를 모두 만족해야 성장한다', () => {
    assert.deepEqual(
        READING_LEVELS.map((item) => [item.logsFrom, item.booksFrom]),
        [[0, 0], [3, 3], [5, 4], [8, 6], [12, 9], [18, 13], [25, 18]]
    );
    assert.equal(getReadingLevel(12, 8).level, 4);
    assert.equal(getReadingLevel(12, 9).name, '생각 독서가');
    assert.equal(getReadingLevel(100, 17).level, 6);
    assert.equal(getReadingLevel(25, 18).name, '깊은 독서가');
});

test('기존 독자 수치는 소통 칭호로 이름만 바로잡고 점수 경계는 유지한다', () => {
    assert.deepEqual(READER_LEVELS.map((item) => item.from), [0, 1, 20, 50, 120, 200, 300]);
    assert.equal(getReaderLevel(200).name, '소통 달인');
});

test('DB 칭호 함수는 화면 상수에서 생성되고 새 칭호도 학기 스냅샷에 고정한다', async () => {
    const [syncMigration, syncScript, activityMigration] = await Promise.all([
        read('supabase/migrations/20261202_sync_title_levels.sql'),
        read('scripts/sync-title-levels.mjs'),
        read('supabase/migrations/20261203_separate_diary_reading_titles.sql')
    ]);

    assert.match(syncScript, /DIARY_LEVELS,[\s\S]*READING_LEVELS/);
    assert.match(syncScript, /--stamp=/);
    assert.match(syncMigration, /CREATE OR REPLACE FUNCTION public\.dragon_diary_level/);
    assert.match(syncMigration, /COALESCE\(p_days, 0\) >= 40 THEN 7/);
    assert.match(syncMigration, /CREATE OR REPLACE FUNCTION public\.dragon_reading_level/);
    assert.match(syncMigration, /COALESCE\(p_logs, 0\) >= 25 AND COALESCE\(p_books, 0\) >= 18 THEN 7/);
    assert.match(activityMigration, /'diary_level', public\.dragon_diary_level/);
    assert.match(activityMigration, /'reading_level', public\.dragon_reading_level/);
});

test('작가 칭호는 전환 기준점을 보존하고 이후 자율 일기·독서록을 제외한다', async () => {
    const migration = await read('supabase/migrations/20261203_separate_diary_reading_titles.sql');

    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.writer_title_transition_baselines/);
    assert.match(migration, /ON CONFLICT \(class_id, student_id, season_started_at\) DO NOTHING/);
    assert.match(migration, /baseline\.writer_total_chars[\s\S]*writer\.total_chars/);
    assert.match(migration, /writer_post_keys TEXT\[\]/);
    assert.match(migration, /= ANY\(COALESCE\(baseline\.writer_post_keys/);
    assert.match(migration, /post\.self_writing_type IN \('diary', 'reading_log'\)/);
    assert.match(migration, /post\.completed_at >= p_started_at/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.writer_title_transition_baselines FROM PUBLIC, anon, authenticated/);
});

test('기록가·독서가 원자료는 확인 완료 글만 날짜와 서로 다른 책으로 센다', async () => {
    const migration = await read('supabase/migrations/20261203_separate_diary_reading_titles.sql');

    assert.match(migration, /review\.review_status = 'checked'/);
    assert.match(migration, /WHERE post\.class_id = p_class_id[\s\S]*LIMIT 100000/);
    assert.match(migration, /COUNT\(DISTINCT CASE[\s\S]*diaryDate/);
    assert.match(migration, /COUNT\(DISTINCT activity\.id\)::INTEGER AS reading_log_count/);
    assert.match(migration, /COUNT\(DISTINCT COALESCE\([\s\S]*library\.book_id/);
    assert.match(migration, /'diary_days', COALESCE\(v_diary_days, 0\)/);
    assert.match(migration, /'reading_log_count', COALESCE\(v_reading_log_count, 0\)/);
    assert.match(migration, /'reading_book_count', COALESCE\(v_reading_book_count, 0\)/);
});

test('학생과 교사 화면은 기존 칭호 RPC 안에서 네 가지 칭호를 함께 표시한다', async () => {
    const [hook, panel, teacher, home] = await Promise.all([
        read('src/modules/writing/title-status/useMyTitleStatus.js'),
        read('src/modules/writing/title-status/MyTitleStatusPanel.jsx'),
        read('src/components/teacher/TeacherStudentAgitViewer.jsx'),
        read('src/components/student/StudentHomeGrowthPanel.jsx')
    ]);

    assert.equal((hook.match(/supabase\.rpc\('get_my_title_status'\)/g) || []).length, 1);
    assert.match(hook, /diaryDays: Number\(data\?\.diary_days/);
    assert.match(hook, /readingBookCount: Number\(data\?\.reading_book_count/);
    for (const kind of ['writer', 'reader', 'diary', 'reading']) {
        assert.equal(panel.includes(`BadgeButton kind="${kind}"`), true);
    }
    assert.match(panel, /작가 칭호[\s\S]*소통 칭호[\s\S]*기록가 칭호[\s\S]*독서가 칭호/);
    assert.match(teacher, /getDiaryLevel\(raw\?\.diary_days\)/);
    assert.match(teacher, /독서록·서로 다른 책/);
    assert.match(home, /'소통 칭호'/);
});

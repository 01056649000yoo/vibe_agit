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
import { normalizeTitleStatus } from '../src/modules/writing/title-status/titleSeason.js';

// 테스트가 넘기는 저장소 상대 경로만 읽는다.
// eslint-disable-next-line security/detect-non-literal-fs-filename
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('기록가 칭호는 서로 다른 일기 날짜 0·3·7·14·21·30·40일로 성장한다', () => {
    assert.deepEqual(DIARY_LEVELS.map((item) => item.from), [0, 3, 7, 14, 21, 30, 40]);
    assert.equal(getDiaryLevel(2).level, 1);
    assert.equal(getDiaryLevel(3).name, '하루 기록가');
    assert.equal(getDiaryLevel(39).level, 6);
    assert.equal(getDiaryLevel(40).name, '위대한 기록가');
    assert.equal(getDiaryLevel(1, 3).name, '꾸준한 기록가');
    assert.equal(getDiaryLevel(1, 3).isTestOverride, true);
});

test('독서가 칭호는 확인 독서록 0·3·6·10·15·22·30편으로만 성장한다', () => {
    assert.deepEqual(READING_LEVELS.map((item) => item.logsFrom), [0, 3, 6, 10, 15, 22, 30]);
    assert.equal(getReadingLevel(5).level, 2);
    assert.equal(getReadingLevel(15).name, '생각 독서가');
    assert.equal(getReadingLevel(29).level, 6);
    assert.equal(getReadingLevel(30).name, '깊은 독서가');
    assert.equal(getReadingLevel(5, { minimumLevel: 3 }).name, '이야기 탐험가');
    assert.equal(getReadingLevel(5, { minimumLevel: 3 }).isTransitionProtected, true);
    assert.equal(getReadingLevel(0, { overrideLevel: 3 }).name, '이야기 탐험가');
    assert.equal(getReadingLevel(0, { overrideLevel: 3 }).isTestOverride, true);
});

test('기존 독자 수치는 소통 칭호로 이름만 바로잡고 점수 경계는 유지한다', () => {
    assert.deepEqual(READER_LEVELS.map((item) => item.from), [0, 1, 20, 50, 120, 200, 300]);
    assert.equal(getReaderLevel(200).name, '소통 달인');
});

test('DB 칭호 함수는 화면 상수에서 생성되고 새 칭호도 학기 스냅샷에 고정한다', async () => {
    const [syncMigration, syncScript, activityMigration] = await Promise.all([
        read('supabase/migrations/20261212_sync_title_levels.sql'),
        read('scripts/sync-title-levels.mjs'),
        read('supabase/migrations/20261203_separate_diary_reading_titles.sql')
    ]);

    assert.match(syncScript, /DIARY_LEVELS,[\s\S]*READING_LEVELS/);
    assert.match(syncScript, /--stamp=/);
    assert.match(syncMigration, /CREATE OR REPLACE FUNCTION public\.dragon_diary_level/);
    assert.match(syncMigration, /COALESCE\(p_days, 0\) >= 40 THEN 7/);
    assert.match(syncMigration, /CREATE OR REPLACE FUNCTION public\.dragon_reading_level/);
    assert.match(syncMigration, /COALESCE\(p_logs, 0\) >= 30 THEN 7/);
    assert.doesNotMatch(syncMigration.match(/CREATE OR REPLACE FUNCTION public\.dragon_reading_level[\s\S]*?\$\$;/)?.[0] || '', /p_books, 0/);
    assert.match(syncMigration, /student_reading_title_level_floors/);
    assert.match(syncMigration, /reading_level_floor/);
    assert.match(activityMigration, /'diary_level', public\.dragon_diary_level/);
    assert.match(activityMigration, /'reading_level', public\.dragon_reading_level/);
});

test('작가 칭호는 이번 시즌 전체에서 자율 일기·독서록을 제외해 다시 계산한다', async () => {
    const migration = await read('supabase/migrations/20261203_separate_diary_reading_titles.sql');
    const eligibleWriterPosts = migration.match(
        /eligible_writer_posts AS MATERIALIZED \(([\s\S]*?)\n    \), writer_stats AS MATERIALIZED/
    )?.[1];

    assert.doesNotMatch(migration, /writer_title_transition_baselines/);
    assert.ok(eligibleWriterPosts, '작가 칭호 대상 글 CTE를 찾을 수 있어야 한다');
    assert.match(
        eligibleWriterPosts,
        /WHERE NOT \([\s\S]*?post\.self_writing_type IN \('diary', 'reading_log'\)[\s\S]*?post\.completed_at >= p_started_at/
    );
    assert.match(migration, /COALESCE\(writer\.total_chars, 0\) AS writer_total_chars/);
    assert.match(migration, /COALESCE\(writer\.completed_posts, 0\) AS writer_completed_posts/);
    assert.doesNotMatch(migration, /baseline\.writer_total_chars|writer_post_keys/);
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

test('학생 홈·나의 아지트·교사 화면은 기존 칭호 RPC 안에서 네 가지 칭호를 함께 표시한다', async () => {
    const [hook, titleSeason, panel, teacher, home, homeCss, dashboard, tracks] = await Promise.all([
        read('src/modules/writing/title-status/useMyTitleStatus.js'),
        read('src/modules/writing/title-status/titleSeason.js'),
        read('src/modules/writing/title-status/MyTitleStatusPanel.jsx'),
        read('src/components/teacher/TeacherStudentAgitViewer.jsx'),
        read('src/components/student/StudentHomeGrowthPanel.jsx'),
        read('src/components/student/StudentHomeGrowthPanel.css'),
        read('src/components/student/StudentDashboard.jsx'),
        read('src/modules/writing/title-status/titleTracks.js')
    ]);

    assert.equal((hook.match(/supabase\.rpc\('get_my_title_status'\)/g) || []).length, 1);
    assert.match(titleSeason, /diaryDays: Number\(data\?\.diary_days/);
    assert.match(titleSeason, /readingBookCount: Number\(data\?\.reading_book_count/);
    for (const kind of ['writer', 'reader', 'diary', 'reading']) {
        assert.equal(panel.includes(`BadgeButton kind="${kind}"`), true);
    }
    assert.match(teacher, /getDiaryLevel\(raw\?\.diary_days\)/);
    assert.match(teacher, /확인 독서록 · 책 수\(참고\)/);
    for (const kind of ['writer', 'reader', 'diary', 'reading']) {
        assert.equal(home.includes(`TitleSummary kind="${kind}"`), true);
    }
    assert.match(home, /className="student-home-title-grid" role="group" aria-label="나의 칭호"/);
    assert.match(homeCss, /\.student-home-title-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(homeCss, /\.student-home-title-summary \{ grid-template-columns: 38px minmax\(0, 1fr\) 44px;/);
    assert.match(homeCss, /\.student-home-title-summary em \{[\s\S]*?grid-column: 3;[\s\S]*?grid-row: 1;[\s\S]*?place-items: center;/);
    assert.match(homeCss, /@media \(max-width: 560px\)[\s\S]*?\.student-home-title-summary \{[\s\S]*?grid-template-columns: 34px minmax\(0, 1fr\) 34px;/);
    assert.match(dashboard, /diaryLevel={diaryLevel}/);
    assert.match(dashboard, /readingLevel={readingLevel}/);
    assert.match(tracks, /작가 칭호[\s\S]*소통 칭호[\s\S]*기록가 칭호[\s\S]*독서가 칭호/);
});

test('친구 아지트는 기존 명단 RPC 한 번으로 네 칭호 원자료와 화면을 함께 제공한다', async () => {
    const [migration, hook, preview, profile, screen] = await Promise.all([
        read('supabase/migrations/20261204_expose_activity_titles_on_home_and_friends.sql'),
        read('src/modules/community/friends-hideout/useFriendsHideout.js'),
        read('src/modules/community/friends-hideout/profile/FriendHideoutPreviewCard.jsx'),
        read('src/modules/community/friends-hideout/profile/FriendProfileShell.jsx'),
        read('src/modules/community/friends-hideout/FriendsHideout.jsx')
    ]);

    assert.match(migration, /DROP FUNCTION IF EXISTS public\.get_student_hideout_directory\(\)/);
    assert.match(migration, /diary_days INTEGER,[\s\S]*reading_log_count INTEGER,[\s\S]*reading_book_count INTEGER/);
    assert.match(migration, /COALESCE\(title\.diary_days, 0\)::INTEGER AS diary_days/);
    assert.match(migration, /record\.snapshot ->> 'reading_book_count'/);
    assert.equal((hook.match(/\.rpc\('get_student_hideout_directory'\)/g) || []).length, 1);
    for (const component of [preview, profile]) {
        assert.match(component, /getDiaryLevel\(friend\?*\.?diary_days\)/);
        assert.match(component, /getReadingLevel\(friend\?*\.?reading_log_count, \{/);
        assert.match(component, /minimumLevel: friend\?*\.?reading_level_floor/);
        for (const kind of ['writer', 'reader', 'diary', 'reading']) {
            assert.equal(component.includes(`kind="${kind}"`), true);
        }
    }
    assert.match(screen, /작가·소통·기록가·독서가 칭호/);
});

test('기록가·독서가 보상은 시즌별 각각 5,000P이며 작가·소통에는 붙지 않는다', async () => {
    const [migration, tracks, teacherGuides, panel] = await Promise.all([
        read('supabase/migrations/20261206_title_season_rewards.sql'),
        read('src/modules/writing/title-status/titleTracks.js'),
        read('src/constants/teacherGuides.js'),
        read('src/modules/writing/title-status/MyTitleStatusPanel.jsx')
    ]);
    const rewardArrays = [...migration.matchAll(/"(?:diary|reading)":\[(.*?)\]/g)]
        .map((match) => match[1].split(',').map(Number));

    assert.ok(rewardArrays.length >= 2, '두 칭호의 시즌 보상표가 있어야 한다');
    for (const rewards of rewardArrays.slice(0, 2)) {
        assert.deepEqual(rewards, [0, 200, 400, 600, 800, 1200, 1800]);
        assert.equal(rewards.reduce((sum, points) => sum + points, 0), 5000);
    }
    assert.match(tracks, /id: 'writer', rewardEnabled: false/);
    assert.match(tracks, /id: 'reader', rewardEnabled: false/);
    assert.match(tracks, /id: 'diary', rewardEnabled: true/);
    assert.match(tracks, /id: 'reading', rewardEnabled: true/);
    assert.match(teacherGuides, /200·400·600·800·1,200·1,800P/);
    assert.match(teacherGuides, /종목별 총 5,000P/);
    assert.match(panel, /totalRewardPoints = rewardTrack\.levels\.reduce/);
});

test('학생 칭호 도움말은 네 칭호의 공용 시즌과 기록가·독서가 직접 수령 규칙을 안내한다', async () => {
    const [panel, tracks] = await Promise.all([
        read('src/modules/writing/title-status/MyTitleStatusPanel.jsx'),
        read('src/modules/writing/title-status/titleTracks.js')
    ]);

    assert.match(tracks, /TITLE_SYSTEM_GUIDE = Object\.freeze/);
    assert.match(tracks, /작가·소통·기록가·독서가.*같은 학기 시즌/);
    assert.match(tracks, /새 학기.*첫 단계/);
    assert.match(tracks, /쓴 글·보유 포인트·구입한 소품.*사라지지 않/);
    assert.match(tracks, /자동 지급되지 않/);
    assert.match(tracks, /한 시즌에 한 번/);
    assert.match(tracks, /성장 마감 기간까지/);
    assert.match(tracks, /시즌 종료 후.*미수령 보상.*받을 수 없/);
    assert.match(panel, /TITLE_SYSTEM_GUIDE\.season/);
    assert.match(panel, /TITLE_SYSTEM_GUIDE\.reset/);
    assert.match(panel, /TITLE_SYSTEM_GUIDE\.reward/);
    assert.match(panel, /totalRewardPoints/);
});

test('칭호 상태 정규화는 bootstrap과 수령 RPC의 보상 응답을 같은 모양으로 만든다', () => {
    const status = normalizeTitleStatus({
        diary_days: 14,
        diary_level_override: 3,
        reading_level_floor: 3,
        reading_level_override: 4,
        title_rewards: {
            enabled: true,
            policy_version: 1,
            season_id: 'season-1',
            claimable_total: 1000,
            tracks: {
                diary: {
                    current_level: 4,
                    claimable_total: 1000,
                    claimed_total: 200,
                    levels: [
                        { level: 2, points: 200, status: 'claimed' },
                        { level: 3, points: 400, status: 'claimable' },
                        { level: 4, points: 600, status: 'claimable' }
                    ]
                }
            }
        }
    });

    assert.equal(status.diaryDays, 14);
    assert.equal(status.diaryLevelOverride, 3);
    assert.equal(status.readingLevelFloor, 3);
    assert.equal(status.readingLevelOverride, 4);
    assert.equal(status.titleRewards.enabled, true);
    assert.equal(status.titleRewards.tracks.diary.currentLevel, 4);
    assert.equal(status.titleRewards.tracks.diary.claimableTotal, 1000);
    assert.deepEqual(status.titleRewards.tracks.diary.levels.map((item) => item.status), [
        'claimed', 'claimable', 'claimable'
    ]);
});

test('기록가·독서가 시험 단계는 실제 활동을 바꾸지 않고 화면과 보상 검증이 함께 사용한다', async () => {
    const [migration, levels, titleSeason, hook] = await Promise.all([
        read('supabase/migrations/20261207_activity_title_test_overrides.sql'),
        read('src/constants/writerLevels.js'),
        read('src/modules/writing/title-status/titleSeason.js'),
        read('src/modules/writing/title-status/useMyTitleStatus.js')
    ]);

    assert.match(migration, /ADD COLUMN IF NOT EXISTS diary_level SMALLINT/);
    assert.match(migration, /ADD COLUMN IF NOT EXISTS reading_level SMALLINT/);
    assert.equal((migration.match(/get_title_activity_test_state_v1\(/g) || []).length >= 3, true);
    assert.match(migration, /'diary_level_override'/);
    assert.match(migration, /'reading_level_override'/);
    assert.match(levels, /getDiaryLevel = \(days = 0, overrideLevel = null\)/);
    assert.match(levels, /getReadingLevel = \(logs = 0, \{ minimumLevel = 1, overrideLevel = null \} = \{\}\)/);
    assert.match(titleSeason, /diaryLevelOverride: data\?\.diary_level_override/);
    assert.match(titleSeason, /readingLevelOverride: data\?\.reading_level_override/);
    assert.match(titleSeason, /readingLevelFloor: Number\(data\?\.reading_level_floor/);
    assert.match(hook, /getDiaryLevel\(status\.diaryDays, status\.diaryLevelOverride\)/);
    assert.match(hook, /getReadingLevel\(status\.readingLogCount, \{[\s\S]*minimumLevel: status\.readingLevelFloor,[\s\S]*overrideLevel: status\.readingLevelOverride/);
});

test('칭호 보상은 명시적 수령·서버 재검증·공용 포인트 엔진·제한 공개를 한 계약으로 묶는다', async () => {
    const [migration, hook, panel, rewardApi, seasonApi, dashboard] = await Promise.all([
        read('supabase/migrations/20261206_title_season_rewards.sql'),
        read('src/modules/writing/title-status/useMyTitleStatus.js'),
        read('src/modules/writing/title-status/MyTitleStatusPanel.jsx'),
        read('src/modules/writing/title-status/titleRewardApi.js'),
        read('src/modules/writing/title-status/titleSeasonApi.js'),
        read('src/components/student/StudentDashboard.jsx')
    ]);

    assert.match(migration, /student_title_reward_claims_unique UNIQUE \(season_id, student_id, track_id, level\)/);
    assert.match(migration, /title-reward:%s:%s:%s/);
    assert.match(migration, /public\.point_engine_apply\([\s\S]*?'title_reward'/);
    assert.match(migration, /v_current_level := CASE p_track_id/);
    assert.match(migration, /title_reward_rollout_classes/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.student_title_reward_claims FROM PUBLIC, anon, authenticated/);
    assert.match(rewardApi, /claim_my_title_rewards_v1/);
    assert.doesNotMatch(rewardApi, /student_id|class_id/);
    assert.match(hook, /titleRewardApi\.claim/);
    assert.match(panel, /받을 보상 모두 받기/);
    assert.match(panel, /\+\{num\(reward\.points\)\}P 받기/);
    assert.match(seasonApi, /get_teacher_dragon_growth_dashboard/);
    assert.match(seasonApi, /start_teacher_dragon_season/);
    assert.match(dashboard, /onPointsChange=\{setPoints\}/);
    assert.equal((dashboard.match(/onPointsChange=\{setPoints\}/g) || []).length >= 2, true);
});

test('전체 공개는 전역 스위치로 현재·미래 학급에 적용되고 학급별 예외가 우선한다', async () => {
    const migration = await read('supabase/migrations/20261208_title_reward_global_rollout.sql');

    assert.match(migration, /CREATE TABLE IF NOT EXISTS public\.title_reward_rollout_state/);
    assert.match(migration, /globally_enabled BOOLEAN NOT NULL DEFAULT FALSE/);
    assert.match(migration, /COALESCE\(rollout\.enabled, global_state\.globally_enabled, FALSE\)/);
    assert.match(migration, /CREATE TRIGGER trg_create_title_season_for_new_class/);
    assert.match(migration, /AFTER INSERT ON public\.classes/);
    assert.match(migration, /CREATE OR REPLACE FUNCTION public\.set_title_reward_rollout_global_v1/);
    assert.match(migration, /public\.auth_user_role\(\) <> 'ADMIN'/);
    assert.match(migration, /REVOKE ALL ON TABLE public\.title_reward_rollout_state FROM PUBLIC, anon, authenticated/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_title_reward_rollout_global_v1\(BOOLEAN\) FROM PUBLIC, anon/);
});

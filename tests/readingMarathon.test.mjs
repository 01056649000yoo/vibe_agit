import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildMarathonTeamPayload,
    clampProgress,
    distributeMarathonRosterEvenly,
    distributeMarathonRosterRandomly,
    formatMarathonDistance,
    getCompetitionLabel,
    getCoursePosition,
    getMarathonTeamAssignmentSummary,
    getMedalRequirementLabel,
    getProgressPercent,
    normalizeMarathonSnapshot
} from '../src/modules/writing/reading-log/marathon/readingMarathon.js';

test('모둠 수가 바뀌면 전체 학생을 모둠별로 균등하게 다시 배정한다', () => {
    const teams = [
        { key: 't1', name: '1모둠', studentIds: ['old'] },
        { key: 't2', name: '2모둠', studentIds: [] },
        { key: 't3', name: '3모둠', studentIds: [] }
    ];
    const roster = Array.from({ length: 8 }, (_, index) => ({ student_id: `s${index + 1}` }));
    const distributed = distributeMarathonRosterEvenly(teams, roster);

    assert.deepEqual(distributed.map((team) => team.studentIds.length), [3, 3, 2]);
    assert.deepEqual(distributed[0].studentIds, ['s1', 's4', 's7']);
    assert.deepEqual(distributed[1].studentIds, ['s2', 's5', 's8']);
    assert.deepEqual(distributed[2].studentIds, ['s3', 's6']);
    assert.deepEqual(teams[0].studentIds, ['old']);
});

test('랜덤 배정은 학생 순서를 섞어도 모둠별 인원 차이를 1명 이하로 유지한다', () => {
    const teams = [{ key: 't1' }, { key: 't2' }, { key: 't3' }];
    const roster = Array.from({ length: 8 }, (_, index) => ({ student_id: `s${index + 1}` }));
    const randomValues = [0.2, 0.8, 0.1, 0.7, 0.3, 0.9, 0.4];
    let randomIndex = 0;
    const randomized = distributeMarathonRosterRandomly(
        teams,
        roster,
        () => randomValues[randomIndex++ % randomValues.length]
    );
    const assignedIds = randomized.flatMap((team) => team.studentIds);

    assert.deepEqual(randomized.map((team) => team.studentIds.length), [3, 3, 2]);
    assert.deepEqual([...assignedIds].sort(), roster.map((student) => student.student_id).sort());
    assert.notDeepEqual(assignedIds, roster.map((student) => student.student_id));
});

test('모둠 시작 전 모든 학생이 정확히 한 모둠에 배정됐는지 확인한다', () => {
    const roster = [{ student_id: 's1' }, { student_id: 's2' }, { student_id: 's3' }];
    const complete = getMarathonTeamAssignmentSummary([
        { studentIds: ['s1', 's3'] },
        { studentIds: ['s2'] }
    ], roster);
    const incomplete = getMarathonTeamAssignmentSummary([
        { studentIds: ['s1', 's2'] },
        { studentIds: ['s2'] }
    ], roster);

    assert.equal(complete.complete, true);
    assert.equal(complete.assignedCount, 3);
    assert.equal(incomplete.complete, false);
    assert.deepEqual(incomplete.unassignedIds, ['s3']);
    assert.deepEqual(incomplete.duplicateIds, ['s2']);
});

test('화면의 모둠 배정을 RPC student_ids 형식으로 빠짐없이 만든다', () => {
    assert.deepEqual(buildMarathonTeamPayload([
        { name: '  햇살 모둠  ', color: '#F97316', studentIds: ['s1', 's2'] },
        { name: '바다 모둠', color: '#0EA5E9', studentIds: ['s3'] }
    ]), [
        { name: '햇살 모둠', color: '#F97316', sort_order: 0, student_ids: ['s1', 's2'] },
        { name: '바다 모둠', color: '#0EA5E9', sort_order: 1, student_ids: ['s3'] }
    ]);
});

test('공동 목표 진행률은 0~100% 범위를 넘지 않는다', () => {
    assert.equal(getProgressPercent(5000, 10000), 50);
    assert.equal(getProgressPercent(12000, 10000), 100);
    assert.equal(getProgressPercent(-100, 10000), 0);
    assert.equal(clampProgress(Number.NaN), 0);
});

test('거리는 학생이 읽기 쉬운 m와 km로 표시한다', () => {
    assert.equal(formatMarathonDistance(950), '950m');
    assert.equal(formatMarathonDistance(2000), '2km');
    assert.equal(formatMarathonDistance(42195), '42.2km');
});

test('코스 주자는 출발점과 결승점 사이에서만 움직인다', () => {
    assert.deepEqual(getCoursePosition(0), { x: 44, y: 186 });
    assert.deepEqual(getCoursePosition(100), { x: 856, y: 108 });
    assert.deepEqual(getCoursePosition(200), { x: 856, y: 108 });
});

test('개인 순위와 학급 공동 집계의 숫자를 안전하게 정규화한다', () => {
    const snapshot = normalizeMarathonSnapshot({
        campaign: { target_distance_m: 10000 },
        summary: { total_pages: '250', total_distance_m: '2500', contributors: '3', book_count: '4' },
        leaderboard: [{ student_id: 'a', rank: '1', distance_m: '1200', total_pages: '120', book_count: '1' }],
        my: { rank: '2', distance_m: '900', total_pages: '90', book_count: '1' }
    });
    assert.equal(snapshot.summary.progressPercent, 25);
    assert.equal(snapshot.summary.contributors, 3);
    assert.equal(snapshot.leaderboard[0].rank, 1);
    assert.equal(snapshot.my.distance_m, 900);
});

test('개인전과 두 단체전의 이름·메달 조건을 쉽게 설명한다', () => {
    assert.equal(getCompetitionLabel('individual'), '개인전');
    assert.equal(getCompetitionLabel('class_team'), '우리 반 전체전');
    assert.equal(getCompetitionLabel('group_team'), '모둠 대항전');
    assert.equal(getMedalRequirementLabel({
        competition_type: 'group_team', medal_requirement_type: 'books', medal_requirement_value: 2
    }), '팀 완주 + 개인 2권 이상이면 메달을 받아요.');
});

test('모둠과 내 팀 누계도 숫자로 정규화한다', () => {
    const snapshot = normalizeMarathonSnapshot({
        campaign: { competition_type: 'group_team', target_distance_m: 10000 },
        teams: [{ id: 't1', total_pages: '300', total_distance_m: '3000', book_count: '3', member_count: '4' }],
        team_leaderboard: [{ id: 't1', rank: '1', total_distance_m: '3000' }],
        my_team: { id: 't1', rank: '1', total_pages: '300', total_distance_m: '3000', book_count: '3', member_count: '4' }
    });
    assert.equal(snapshot.teams[0].member_count, 4);
    assert.equal(snapshot.teamLeaderboard[0].rank, 1);
    assert.equal(snapshot.myTeam.totalDistanceM, undefined);
    assert.equal(snapshot.myTeam.total_distance_m, 3000);
});

test('독서마라톤은 확인 완료·고정 참가자 누계·서로 다른 메달을 서버에서 판정한다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [reviewMigration, marathonMigration, nullSafeMigration, approvalRewardMigration, manifest, dashboard] = await Promise.all([
        readFile('supabase/migrations/20261136_self_writing_review_decisions_notifications.sql', 'utf8'),
        readFile('supabase/migrations/20261137_reading_marathon_competitions_and_medals.sql', 'utf8'),
        readFile('supabase/migrations/20261138_reading_marathon_null_safe_submission.sql', 'utf8'),
        readFile('supabase/migrations/20261139_self_writing_teacher_approval_rewards.sql', 'utf8'),
        readFile('src/modules/writing/reading-log/manifest.js', 'utf8'),
        readFile('src/components/student/StudentDashboard.jsx', 'utf8')
    ]);

    assert.match(reviewMigration, /review_status IN \('checked', 'commented', 'revision_requested'\)/);
    assert.match(reviewMigration, /notification_emit_v1/);
    assert.match(marathonMigration, /competition_type IN \('individual', 'class_team', 'group_team'\)/);
    assert.match(marathonMigration, /CREATE TABLE IF NOT EXISTS public\.reading_marathon_participants/);
    assert.match(marathonMigration, /CREATE TABLE IF NOT EXISTS public\.reading_marathon_medals/);
    assert.match(marathonMigration, /UNIQUE \(campaign_id, student_id\)/);
    assert.match(marathonMigration, /get_my_reading_marathon_medals_v1/);
    assert.match(nullSafeMigration, /COALESCE\(v_post\.review_status, ''\) NOT IN/);
    assert.match(nullSafeMigration, /COALESCE\(v_post\.page_count, 0\) NOT BETWEEN 1 AND 10000/);
    assert.match(approvalRewardMigration, /CHECK \(review_status IN \('checked', 'revision_requested'\)\)/);
    assert.match(approvalRewardMigration, /award_self_writing_review_points_v1/);
    assert.match(approvalRewardMigration, /format\('self-writing-review:%s', v_post\.id\)/);
    assert.match(manifest, /myAgitEntry: \(\) => import\('\.\/marathon\/ReadingMarathonMedalCase'\)/);
    assert.match(dashboard, /marathonMedal=\{homeBootstrap\?\.reading_marathon\?\.latest_medal\}/);
});

test('모둠전은 초안 배정 뒤 명시적으로 시작하고 첫 기록 전까지만 배정을 복구한다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [settings, assignmentDialog, studentCard, styles, migration] = await Promise.all([
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeacherSettings.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeamAssignmentDialog.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonDashboardCard.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/readingMarathon.css', 'utf8'),
        readFile('supabase/migrations/20261143_reading_marathon_team_assignment_flow.sql', 'utf8')
    ]);

    assert.match(settings, /초안 저장하기/);
    assert.match(settings, /학생 배정 확인하고 시작하기/);
    assert.match(settings, /getMarathonTeamAssignmentSummary/);
    assert.match(settings, /distributeMarathonRosterEvenly\(nextTeams, roster\)/);
    assert.match(settings, /reading-marathon-team-editor__board/);
    assert.match(settings, /균등 재배정/);
    assert.match(settings, /🎲 랜덤 배정/);
    assert.match(settings, /⛶ 크게 보기/);
    assert.match(assignmentDialog, /학생들과 함께 보는 큰 화면/);
    assert.match(assignmentDialog, /균등 재배정[\s\S]*랜덤 배정[\s\S]*직접 배정/);
    assert.match(assignmentDialog, /maxWidth="1400px"/);
    assert.match(styles, /assignment-buttons[^}]*grid-template-columns:repeat\(3,max-content\)/);
    assert.match(studentCard, /우리 모둠.*myTeam\?\.total_distance_m/);
    assert.match(studentCard, /모둠 합계.*내 기여/);
    assert.match(settings, /teamAssignmentLocked = completed \|\| \(modeLocked && Number\(summary\?\.bookCount \|\| 0\) > 0\)/);
    assert.match(migration, /v_roster_repair_allowed/);
    assert.match(migration, /NOT EXISTS \([\s\S]*reading_marathon_contributions/);
    assert.match(migration, /학생 한 명은 한 모둠에만 배정할 수 있습니다/);
    assert.match(migration, /모든 학생을 한 모둠에 한 번씩 배정해주세요/);
});

test('독서마라톤 사용 스위치는 확인 후 다른 설정과 분리해 즉시 서버에 반영한다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [settings, migration] = await Promise.all([
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeacherSettings.jsx', 'utf8'),
        readFile('supabase/migrations/20261153_reading_marathon_immediate_availability.sql', 'utf8')
    ]);

    assert.match(settings, /onChange=\{requestCampaignAvailabilityChange\}/);
    assert.match(settings, /loading=\{availabilitySaving\}/);
    assert.match(settings, /독서마라톤을 \$\{pendingAvailability \? '활성화' : '비활성화'\}하시겠습니까/);
    assert.match(settings, /예, 바로 활성화/);
    assert.match(settings, /예, 바로 비활성화/);
    assert.match(settings, /confirmCampaignAvailabilityChange/);
    assert.match(settings, /supabase\.rpc\('set_teacher_reading_marathon_enabled_v1'/);
    assert.match(settings, /누르는 즉시 저장되어 학생 화면/);
    assert.doesNotMatch(settings, /onChange=\{\(enabled\) => setForm\(\(current\) => \(\{ \.\.\.current, enabled \}\)\)\}/);
    assert.match(migration, /SET search_path = ''/);
    assert.match(migration, /class\.teacher_id = auth\.uid\(\)/);
    assert.match(migration, /status = CASE WHEN p_enabled THEN 'active' ELSE 'paused' END/);
    assert.match(migration, /REVOKE ALL ON FUNCTION public\.set_teacher_reading_marathon_enabled_v1\(UUID, BOOLEAN\)[\s\S]*FROM PUBLIC, anon/);
});

test('교사는 선택 사유로 확인 또는 보완 요청만 남긴다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [readingManager, diaryManager] = await Promise.all([
        readFile('src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx', 'utf8'),
        readFile('src/modules/writing/diary/teacher/TeacherDiaryManager.jsx', 'utf8')
    ]);

    assert.doesNotMatch(readingManager, /decision === 'revision_requested' && !teacherComment\.trim\(\)/);
    assert.match(readingManager, /onClick=\{\(\) => saveReview\(comment\.trim\(\), 'revision_requested'\)\}[\s\S]{0,160}disabled=\{saving\}/);
    assert.doesNotMatch(readingManager, /disabled=\{saving \|\| !comment\.trim\(\)\}/);
    assert.match(readingManager, /한마디는 선택/);
    assert.doesNotMatch(diaryManager, /decision === 'revision_requested' && !comment\.trim\(\)/);
    assert.doesNotMatch(diaryManager, /disabled=\{saving \|\| !comment\.trim\(\)\}/);
});

test('독서록과 일기는 같은 압축형 대기함과 단일 RPC 일괄 확인을 사용한다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [readingManager, diaryManager, workspace, workspaceCss, migration] = await Promise.all([
        readFile('src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx', 'utf8'),
        readFile('src/modules/writing/diary/teacher/TeacherDiaryManager.jsx', 'utf8'),
        readFile('src/modules/writing/review/SelfWritingReviewWorkspace.jsx', 'utf8'),
        readFile('src/modules/writing/review/selfWritingReviewWorkspace.css', 'utf8'),
        readFile('supabase/migrations/20261140_self_writing_bulk_review_workspace.sql', 'utf8')
    ]);

    for (const manager of [readingManager, diaryManager]) {
        assert.match(manager, /SelfWritingReviewSummary/);
        assert.match(manager, /SelfWritingReviewViewTabs/);
        assert.match(manager, /SelfWritingBulkToolbar/);
        assert.match(manager, /SelfWritingQueueCard/);
        assert.match(manager, /save_teacher_self_writing_reviews_bulk_v1/);
        assert.match(manager, /const PAGE_SIZE = 20/);
    }
    assert.match(workspace, /보이는 \{typeLabel\} 전체 선택/);
    assert.match(workspaceCss, /grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/);
    assert.match(workspaceCss, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
    assert.match(workspaceCss, /min-height: 108px/);
    assert.match(migration, /p_writing_type NOT IN \('reading_log', 'diary'\)/);
    assert.match(migration, /save_teacher_self_writing_review_v2\(v_post_id, '', 'accepted'\)/);
    assert.match(migration, /'counts', jsonb_build_object\(/);
});

test('자율 글은 자유롭게 제출하고 포인트는 교사 확인 뒤에만 안내한다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [readingPage, diaryPage, dashboardMenu, migration] = await Promise.all([
        readFile('src/modules/writing/reading-log/ReadingLogPage.jsx', 'utf8'),
        readFile('src/modules/writing/diary/DiaryPage.jsx', 'utf8'),
        readFile('src/components/student/DashboardMenu.jsx', 'utf8'),
        readFile('supabase/migrations/20261139_self_writing_teacher_approval_rewards.sql', 'utf8')
    ]);

    assert.match(readingPage, /선생님이 확인하면 포인트가 지급돼요/);
    assert.match(diaryPage, /선생님이 확인하면 포인트가 지급돼요/);
    assert.doesNotMatch(readingPage, /disabled=\{[^}]*dailyStatus\.canComplete/);
    assert.doesNotMatch(readingPage, /새 독서록은 내일 다시/);
    assert.match(dashboardMenu, /자유롭게 더 쓰기/);
    assert.match(migration, /'reward_status', 'pending_review'/);
    assert.match(migration, /public\.point_engine_apply\(/);
    assert.match(migration, /FROM public\.student_posts post[\s\S]*post\.self_writing_type IN \('reading_log', 'diary'\)/);
});

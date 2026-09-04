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

test('독서마라톤은 시작 뒤 사용 스위치 없이 완주 또는 중간 종료까지 계속 운영한다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [settings, migration] = await Promise.all([
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeacherSettings.jsx', 'utf8'),
        readFile('supabase/migrations/20261153_reading_marathon_lifecycle_only.sql', 'utf8')
    ]);

    assert.doesNotMatch(settings, /FeatureAvailabilitySwitch/);
    assert.doesNotMatch(settings, /set_teacher_reading_marathon_enabled_v1/);
    assert.doesNotMatch(settings, /availabilitySaving|pendingAvailability/);
    assert.match(settings, /p_enabled: enabledOverride \?\? Boolean\(snapshot\?\.campaign\?\.started_at\)/);
    assert.match(settings, /현재 마라톤 중간 종료하기/);
    assert.match(migration, /status = 'active'[\s\S]*status = 'paused'/);
    assert.match(migration, /DROP FUNCTION IF EXISTS public\.set_teacher_reading_marathon_enabled_v1\(UUID, BOOLEAN\)/);
    assert.match(migration, /NEW\.status = 'paused'[\s\S]*NEW\.status := 'active'/);
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

test('교사 독서록은 확인 저장 성공 뒤 상세 창을 닫고 목록에 결과를 남긴다', async () => {
    const { readFile } = await import('node:fs/promises');
    const readingManager = await readFile(
        'src/modules/writing/reading-log/teacher/TeacherReadingLogManager.jsx',
        'utf8'
    );
    const saveReview = readingManager.match(
        /const saveReview = async[\s\S]*?\n    const toggleReviewSelection/
    )?.[0];

    assert.ok(saveReview, '독서록 확인 저장 함수를 찾지 못했습니다.');
    assert.match(saveReview, /if \(error\) \{[\s\S]*?return;[\s\S]*?\}/);
    assert.match(
        saveReview,
        /setBulkNotice\(`✅ \$\{successNotice\}`\);[\s\S]*?setSelected\(null\);[\s\S]*?setDetail\(null\);[\s\S]*?await refresh\(\);/
    );
    assert.doesNotMatch(saveReview, /setReviewNotice/);
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

/*
 * 2026-09-03: 마라톤을 시작하면 교사 화면이 세로로 길게 늘어져 스크롤해야만 전체가 보였다.
 * 실측 1440×900 기준 884px(쓸 수 있는 높이 710px)로 174px 넘쳤다.
 *
 * ⚠️ 여백을 줄여 맞춘 것이라 **누가 다시 여백을 늘리면 조용히 되돌아간다.**
 *    그래서 "무엇을 접었는지"를 여기서 못 박는다. 글자 크기는 건드리지 않았으므로
 *    바닥(0.8rem)은 `tests/teacherTypeScale.test.mjs` 가 따로 지킨다.
 */
test('마라톤 운영 화면은 탭으로 나뉘고 운영 현황이 한 화면에 들어간다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [settings, css] = await Promise.all([
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeacherSettings.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/readingMarathon.css', 'utf8')
    ]);

    // 셋으로 나누고, 운영 중에는 현황부터 연다 — 설정은 필요할 때만 들어간다.
    for (const label of ['운영 현황', '설정', '지난 기록']) {
        assert.ok(settings.includes(`label: '${label}'`), `탭 '${label}' 이(가) 없다`);
    }
    assert.match(settings, /useState\('status'\)/, '기본 탭이 운영 현황이 아니다');
    // 시작 전에는 탭이 없어야 한다. 볼 현황이 없는데 탭만 있으면 빈 화면을 보여 준다.
    assert.match(settings, /const showTabs = Boolean\(campaign\)/);

    /*
     * `아직 만든 독서마라톤이 없습니다` 는 **마라톤이 정말 없을 때만** 나와야 한다.
     * 2026-09-03: 조건이 `campaign && tab === 'status'` 하나뿐이라, 마라톤이 있어도 `설정` 탭으로 옮기면
     * 이 안내가 떴다(사용자가 발견). 탭을 나누면서 딸려 온 실수다.
     */
    assert.match(
        settings,
        /\) : campaign \? null : \(/,
        '마라톤이 있는데도 탭에 따라 "없습니다" 안내가 나온다'
    );

    // 학생 미리보기는 접힌 채로 시작한다. 펼치면 자리를 크게 먹는다.
    const previewTag = settings.match(/<details[^>]*reading-marathon-student-preview[^>]*>/)?.[0];
    assert.ok(previewTag, '학생 미리보기가 접었다 폈다 하는 칸이 아니다');
    assert.doesNotMatch(previewTag, /\bopen\b/, '학생 미리보기가 펼친 채로 시작한다');

    /*
     * ⚠️ 아이를 이름으로 지목하지 않는다(2026-09-03). 예전에는 가장 느린 아이를 빨간 점과
     *    "가장 뒤처진 친구 ○○○" 한 줄로 따로 불렀는데, 그 표현을 뺐다. 다시 들어오면 여기서 걸린다.
     */
    // 주석은 왜 뺐는지를 적어 두는 곳이라 함께 보지 않는다. 화면에 나오는 글만 본다.
    const withoutComments = (source) => source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    for (const source of [settings, css]) {
        assert.doesNotMatch(withoutComments(source), /뒤처진/, '아이를 뒤처졌다고 부르는 표현이 다시 들어왔다');
    }
    assert.doesNotMatch(css, /is-behind/, '느린 아이만 다른 색으로 칠하고 있다');

    // 아이들 위치는 늘 펼쳐 두지 않고 눌러서 여는 창으로 본다.
    assert.match(settings, /ReadingMarathonStatusModal/);
    assert.match(settings, /🏃 우리 반 마라톤 현황 보기/);
    // 2026-09-03: 트랙 그림 자체를 걷어내고 표로 바꿨다. 부품도 함께 지웠으므로 다시 들어오면 눈에 띈다.
    assert.doesNotMatch(settings, /ClassCourse/, '걷어낸 트랙이 다시 들어왔다');

    const modal = await readFile(
        'src/modules/writing/reading-log/marathon/ReadingMarathonStatusModal.jsx', 'utf8');
    // 거리순으로 줄을 세우면 맨 아래가 "꼴찌 자리"로 굳는다. 이름 차례로 늘어놓는다.
    assert.match(modal, /localeCompare\(right\.name, 'ko'\)/, '명단이 가나다순이 아니다');
    assert.match(modal, /학생 화면과 교실 화면에는 나오지 않습니다/);
    // 낮은 화면에서만 한 번 더 조인다. 큰 화면까지 조이면 답답해진다.
    assert.match(css, /@media \(max-height: 950px\)/);
    assert.match(css, /@media \(max-height: 830px\)/);
    // 탭 이름이 '운영 현황'이라 카드 안 꼬리표는 접는다.
    assert.match(css, /\.reading-marathon-tabs ~ \.reading-marathon-overview[\s\S]{0,120}> span \{ display: none; \}/);
});

test('완주하면 알림·축하 창·결승선 반짝임이 함께 움직인다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [migration, manifest, card, engine, css, preview] = await Promise.all([
        readFile('supabase/migrations/20261231_reading_marathon_completion_notification.sql', 'utf8'),
        readFile('src/modules/writing/reading-log/manifest.js', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonDashboardCard.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/readingMarathon.js', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/readingMarathon.css', 'utf8'),
        readFile('src/dev/ReadingMarathonCelebratePreview.jsx', 'utf8')
    ]);

    /*
     * ① 알림 — 그전에는 메달이 조용히 쌓이기만 해 아이가 완주한 줄도 몰랐다.
     *    다른 성취와 같은 원장을 쓰고, 같은 완주로 두 번 알리지 않는다.
     */
    assert.match(migration, /notification_emit_v1/);
    assert.match(migration, /'reading-log\.marathon_completed'/);
    assert.match(migration, /format\('marathon-medal:%s:%s'/, '같은 완주로 알림이 여러 번 쌓일 수 있다');
    assert.match(migration, /EXCEPTION WHEN OTHERS THEN/, '알림 실패가 메달·거리 계산을 되돌리면 안 된다');
    assert.match(manifest, /eventType: 'reading-log\.marathon_completed'/, '학생 화면에 문구가 없어 기본 문구로 뜬다');

    /*
     * ② 축하 창 — 완주 뒤 처음 들어왔을 때 한 번만.
     *    렌더 중이나 effect 본문에서 상태를 바꾸지 않는다(자료가 도착한 자리에서 판정).
     */
    assert.match(card, /const celebrateIfFirstTime = useCallback/);
    assert.match(card, /hasCelebrated\(campaignId\)/);
    assert.match(card, /rememberCelebrated\(campaignId\)/);
    assert.match(card, /reading-marathon-celebrate/);
    assert.match(card, /role="dialog"/);

    // 완주 판정은 한 곳에서만 한다 — 두 곳에서 따로 세면 한쪽만 고쳐져 어긋난다
    assert.match(engine, /export const isMarathonCompletedForStudent/);
    assert.equal((card.match(/isMarathonCompletedForStudent\(/g) || []).length, 2);
    assert.doesNotMatch(card, /Boolean\(my\?\.completed_at\)/, '완주 판정이 화면에 다시 복사됐다');

    /*
     * ③ 결승선 반짝임 — 그전에는 달리는 사람 동그라미만 깜빡였다.
     *    움직임을 줄이도록 설정한 기기에서는 멈춘다.
     */
    assert.match(css, /marathonFinishGlow/);
    assert.match(
        css,
        /prefers-reduced-motion: reduce\)[\s\S]{0,300}landmarks text:last-child \{ animation: none/,
        '움직임을 줄이도록 설정한 기기에서 결승선 반짝임이 멈추지 않는다'
    );
    // 접힌 카드가 축하 창을 잘라 먹지 않는다(실험실에서 실제로 잘렸다)
    assert.match(css, /\.reading-marathon-card\.is-celebrating \{ overflow: visible/);

    // 완주는 실제로 만들기 어려운 상태다 — 실험실에서 눈으로 볼 수 있어야 한다
    assert.match(preview, /ReadingMarathonDashboardCard/);
    assert.doesNotMatch(preview, /supabase/, '미리보기가 운영 데이터를 부르면 안 됩니다');
});

/*
 * 2026-09-03: 교사가 "1쪽은 1m 여야 하는데 10m 로 계산된다"고 알려 왔다.
 * 버그가 아니라 설계값이었지만(1쪽=10m), 학급마다 책 두께가 달라 교사가 정하도록 열었다.
 *
 * ⚠️ 기본 비율이 **화면과 서버 두 곳에** 적혀 있다. 한쪽만 바꾸면 교사가 보는 숫자와
 *    실제 쌓이는 거리가 어긋난다. 그래서 두 곳을 이 검사 하나가 함께 본다.
 */
test('쪽당 거리는 기본 1m 이고 화면과 서버가 같은 값을 쓴다', async () => {
    const { readFile } = await import('node:fs/promises');
    const { DEFAULT_METERS_PER_PAGE } =
        await import('../src/modules/writing/reading-log/marathon/readingMarathon.js');
    const [migration, screen] = await Promise.all([
        readFile('supabase/migrations/20261232_reading_marathon_meters_per_page.sql', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeacherSettings.jsx', 'utf8')
    ]);

    assert.equal(DEFAULT_METERS_PER_PAGE, 1, '화면의 기본 비율이 1m 가 아니다');
    // ⚠️ `DEFAULT 1` 로 견주면 `DEFAULT 10` 에도 걸린다. 쌍반점까지 붙여 정확히 맞춘다.
    //    화면 상수를 그대로 끼워 넣어, 한쪽만 바꾸면 여기서 걸리게 한다.
    assert.ok(
        migration.includes(`ALTER COLUMN meters_per_page SET DEFAULT ${DEFAULT_METERS_PER_PAGE};`),
        '서버의 기본 비율이 화면 상수와 다르다'
    );

    // 교사가 정한 값을 실제로 서버에 넘겨야 한다. 안 넘기면 늘 기본값으로 저장된다.
    assert.match(screen, /p_meters_per_page: Math\.round\(Number\(form\.metersPerPage\)\)/);
    // 불러올 때도 저장된 값을 읽어야 한다. 안 읽으면 저장할 때마다 기본값으로 되돌아간다.
    assert.match(screen, /metersPerPage: Number\(normalized\.campaign\.meters_per_page\)/);

    /*
     * ⚠️ 비율을 바꾸면 지난 기록도 같은 비율로 다시 센다. 새 기록만 새 비율로 쌓으면
     *    한 화면에 두 비율이 섞여 누가 얼마나 왔는지 아무도 설명할 수 없다.
     */
    assert.match(migration, /page_count \* p_meters_per_page/, '비율을 바꿔도 지난 기록을 다시 세지 않는다');

    /*
     * ⚠️ 거리를 줄이면 완주가 취소되어 **아이 메달함에서 메달이 사라진다.**
     *    그래서 메달이 걸려 있으면 옮기기를 멈추게 해 두었다.
     */
    // ⚠️ `메달` 만으로 견주면 함수 안의 "메달 최소 참여 조건" 안내에도 걸린다. 안전장치 문구를 짚는다.
    assert.match(migration, /SELECT COUNT\(\*\) INTO v_medals[\s\S]{0,400}reading_marathon_medals/,
        '메달이 걸려 있는지 세지 않는다');
    assert.match(migration, /IF v_medals > 0 THEN[\s\S]{0,400}RAISE EXCEPTION/,
        '메달이 있어도 멈추지 않고 그냥 밀어붙인다');
    assert.match(migration, /메달함에서 메달이 사라집니다/, '왜 멈추는지 설명하지 않는다');

    // 시작한 마라톤에서 비율을 건드리면 아이들이 보는 진행률이 바뀐다. 저장 전에 알려야 한다.
    assert.match(screen, /rateChangedOnRunning/);
    assert.match(screen, /지금까지 쌓인 거리도 새 비율로 다시 계산/);
});

/*
 * 2026-09-03: 교사가 "개인전인데 공동 달성 거리와 남은 거리가 보인다"고 알려 왔다.
 * 세 방식이 같은 숫자를 쓰고 있었는데, 목표가 가리키는 대상이 서로 다르다 —
 * 개인전은 학생 한 명당, 모둠 대항전은 모둠 하나당, 우리 반 전체전만 반 전체다.
 * 그래서 개인전·모둠전에서 반 전체 합계를 목표와 견주면 뜻이 통하지 않는 숫자가 된다.
 */
test('운영 현황 숫자칸은 경기 방식에 맞는 것만 보여 준다', async () => {
    const { getMarathonDashboardStats } =
        await import('../src/modules/writing/reading-log/marathon/readingMarathon.js');
    const labelsOf = (stats) => stats.map((stat) => stat.label);
    const valueOf = (stats, key) => stats.find((stat) => stat.key === key)?.value;

    // 개인전 — 목표는 학생 한 명당이다. 반 전체 합계와 남은 거리는 견줄 수 없다.
    const individual = getMarathonDashboardStats({
        campaign: { competition_type: 'individual' },
        summary: { targetDistanceM: 2000, totalDistanceM: 5500, contributors: 3 },
        leaderboard: [{ distance_m: 2500 }, { distance_m: 1000 }, { distance_m: 0 }, { distance_m: 2000 }]
    });
    assert.deepEqual(labelsOf(individual), ['1인당 목표 거리', '완주한 학생', '평균 달성률', '아직 첫 책 전']);
    assert.ok(!labelsOf(individual).includes('공동 달성 거리'), '개인전에 공동 달성 거리가 남아 있다');
    assert.ok(!labelsOf(individual).includes('남은 거리'), '개인전에 남은 거리가 남아 있다');
    // 목표를 넘긴 학생과 딱 채운 학생 둘 다 완주로 센다.
    assert.equal(valueOf(individual, 'finished'), '2/4명');
    assert.equal(valueOf(individual, 'not-started'), '1명');
    // 100%를 넘겨도 평균이 부풀지 않는다((100+50+0+100)/4 = 63).
    assert.equal(valueOf(individual, 'average'), '63%');

    // 모둠 대항전 — 목표는 모둠 하나당이다. 여기도 반 전체 합계를 견주면 안 된다.
    const group = getMarathonDashboardStats({
        campaign: { competition_type: 'group_team' },
        summary: { targetDistanceM: 5000, totalDistanceM: 7700, contributors: 24 },
        teams: [{ total_distance_m: 5200 }, { total_distance_m: 2500 }, { total_distance_m: 0 }]
    });
    assert.deepEqual(labelsOf(group), ['모둠별 목표 거리', '완주한 모둠', '모둠 평균 달성률', '참여 학생']);
    assert.equal(valueOf(group, 'finished'), '1/3모둠');

    // 우리 반 전체전 — 목표가 반 전체이므로 합계와 남은 거리가 그대로 뜻이 통한다.
    const classTeam = getMarathonDashboardStats({
        campaign: { competition_type: 'class_team' },
        summary: { targetDistanceM: 42195, totalDistanceM: 3350, contributors: 24 }
    });
    assert.deepEqual(labelsOf(classTeam), ['공동 달성 거리', '목표 달성률', '남은 거리', '참여 학생']);
    assert.equal(valueOf(classTeam, 'remaining'), '38.8km');

    // 아직 아무 기록이 없어도 터지지 않는다.
    for (const type of ['individual', 'group_team', 'class_team']) {
        const empty = getMarathonDashboardStats({ campaign: { competition_type: type }, summary: {} });
        assert.equal(empty.length, 4, `${type}: 빈 학급에서 칸 수가 다르다`);
    }
    assert.equal(getMarathonDashboardStats().length, 4, '아무것도 안 넘겨도 터지면 안 된다');
});

test('설정 화면과 현황 창이 같은 계산을 쓴다', async () => {
    const { readFile } = await import('node:fs/promises');
    const [screen, modal] = await Promise.all([
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeacherSettings.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonStatusModal.jsx', 'utf8')
    ]);
    // ⚠️ 두 곳이 같은 숫자를 보여 준다. 따로 계산하면 한쪽만 고쳐져 서로 어긋난다.
    for (const source of [screen, modal]) {
        assert.match(source, /getMarathonDashboardStats\(/);
    }
    assert.doesNotMatch(screen, /<dt>공동 달성 거리<\/dt>/, '설정 화면이 아직 직접 적고 있다');
    assert.doesNotMatch(modal, /<dt>공동 달성 거리<\/dt>/, '현황 창이 아직 직접 적고 있다');
    // 경기 방식을 넘겨야 방식별로 갈린다 — 넘기는 쪽과 받는 쪽을 모두 본다.
    assert.match(screen, /<ReadingMarathonStatusModal[\s\S]{0,400}campaign=\{campaign\}/,
        '현황 창에 경기 방식을 넘기지 않는다');
    assert.match(modal, /campaign = null/, '현황 창이 경기 방식을 받지 않는다');
});

/*
 * 2026-09-03: 교사 화면을 방식별로 나눈 뒤 학생 화면도 확인했다.
 * 진행률 계산은 이미 방식별로 맞았지만(개인전=내 거리, 모둠전=우리 모둠, 전체전=반 전체)
 * **모둠에 아직 들어가지 않은 아이** 하나가 빠져 있었다 — 마라톤이 시작된 뒤 전학 온 경우다.
 * 반 전체 합계로 흘러가 모둠 하나의 목표와 견주면, 아무것도 안 읽은 아이에게 100%가 뜬다.
 */
test('학생 카드는 경기 방식마다 자기에게 맞는 거리를 견준다', async () => {
    const { readFile } = await import('node:fs/promises');
    const card = await readFile(
        'src/modules/writing/reading-log/marathon/ReadingMarathonDashboardCard.jsx', 'utf8');

    // 개인전은 내 거리, 모둠전은 우리 모둠 거리를 목표와 견딘다. 반 전체 합계를 쓰면 안 된다.
    assert.match(card, /getProgressPercent\(my\?\.distance_m, snapshot\.campaign\.target_distance_m\)/,
        '개인전이 내 거리를 견주지 않는다');
    assert.match(card, /getProgressPercent\(myTeam\.total_distance_m, snapshot\.campaign\.target_distance_m\)/,
        '모둠전이 우리 모둠 거리를 견주지 않는다');

    /*
     * ⚠️ 모둠이 없는 아이가 `snapshot.summary`(반 전체 합계)로 흘러가면 안 된다.
     *    `} : snapshot.summary;` 앞에 모둠전 갈래가 하나 더 있어야 한다.
     */
    assert.match(card, /\} : isGroup \? \{[\s\S]{0,600}progressPercent: 0[\s\S]{0,40}\} : snapshot\.summary;/,
        '모둠에 없는 아이가 반 전체 합계를 자기 것처럼 본다');
    assert.match(card, /const waitingForTeam = isGroup && !myTeam;/);
    assert.match(card, /아직 모둠에 들어가지 않았어요/, '왜 0인지 아이에게 알려 주지 않는다');

    // 완주 판정도 방식마다 자기 것을 본다.
    const { isMarathonCompletedForStudent } =
        await import('../src/modules/writing/reading-log/marathon/readingMarathon.js');
    const campaignOf = (competition_type, status = 'active') => ({ campaign: { competition_type, status } });
    assert.equal(isMarathonCompletedForStudent({
        ...campaignOf('individual'), my: { completed_at: '2026-09-01' } }), true);
    assert.equal(isMarathonCompletedForStudent({
        ...campaignOf('individual'), my: { completed_at: null } }), false);
    // 개인전에서 반이 완주해도 나는 아직일 수 있다.
    assert.equal(isMarathonCompletedForStudent({
        ...campaignOf('individual', 'completed'), my: { completed_at: null } }), false);
    assert.equal(isMarathonCompletedForStudent({
        ...campaignOf('group_team'), myTeam: { completed_at: '2026-09-01' } }), true);
    assert.equal(isMarathonCompletedForStudent({ ...campaignOf('group_team') }), false);
    assert.equal(isMarathonCompletedForStudent(campaignOf('class_team', 'completed')), true);
    assert.equal(isMarathonCompletedForStudent(campaignOf('class_team')), false);
});

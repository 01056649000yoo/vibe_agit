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
    const [settings, course, css] = await Promise.all([
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonTeacherSettings.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/ReadingMarathonClassCourse.jsx', 'utf8'),
        readFile('src/modules/writing/reading-log/marathon/readingMarathon.css', 'utf8')
    ]);

    // 셋으로 나누고, 운영 중에는 현황부터 연다 — 설정은 필요할 때만 들어간다.
    for (const label of ['운영 현황', '설정', '지난 기록']) {
        assert.ok(settings.includes(`label: '${label}'`), `탭 '${label}' 이(가) 없다`);
    }
    assert.match(settings, /useState\('status'\)/, '기본 탭이 운영 현황이 아니다');
    // 시작 전에는 탭이 없어야 한다. 볼 현황이 없는데 탭만 있으면 빈 화면을 보여 준다.
    assert.match(settings, /const showTabs = Boolean\(campaign\)/);

    // 학생 미리보기는 접힌 채로 시작한다. 펼치면 자리를 크게 먹는다.
    const previewTag = settings.match(/<details[^>]*reading-marathon-student-preview[^>]*>/)?.[0];
    assert.ok(previewTag, '학생 미리보기가 접었다 폈다 하는 칸이 아니다');
    assert.doesNotMatch(previewTag, /\bopen\b/, '학생 미리보기가 펼친 채로 시작한다');

    /*
     * ⚠️ 출발·목표 글자를 선 **위**에 두면 위로 어긋난 점과 겹친다(실제로 겹쳐 보였다).
     *    선 양옆에 두어야 겹치지 않고 띠 높이도 줄어든다.
     */
    const { LABEL_LEFT, TRACK_LEFT } =
        await import('../src/modules/writing/reading-log/marathon/classCourseLayout.js');
    assert.ok(LABEL_LEFT < TRACK_LEFT, '출발 글자가 선 안쪽에 있다 — 점과 겹친다');
    assert.doesNotMatch(course, /y=\{TRACK_Y - \d+\}/, '글자가 다시 선 위로 올라갔다');

    /*
     * ⚠️ 아이를 이름으로 지목하지 않는다(2026-09-03). 예전에는 가장 느린 아이를 빨간 점과
     *    "가장 뒤처진 친구 ○○○" 한 줄로 따로 불렀는데, 그 표현을 뺐다. 다시 들어오면 여기서 걸린다.
     */
    // 주석은 왜 뺐는지를 적어 두는 곳이라 함께 보지 않는다. 화면에 나오는 글만 본다.
    const withoutComments = (source) => source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    for (const source of [course, settings, css]) {
        assert.doesNotMatch(withoutComments(source), /뒤처진/, '아이를 뒤처졌다고 부르는 표현이 다시 들어왔다');
    }
    assert.doesNotMatch(course, /is-behind/, '느린 아이만 다른 색으로 칠하고 있다');

    // 아이들 위치는 늘 펼쳐 두지 않고 눌러서 여는 창으로 본다.
    assert.match(settings, /ReadingMarathonStatusModal/);
    assert.match(settings, /🏃 우리 반 마라톤 현황 보기/);
    assert.doesNotMatch(settings, /<ReadingMarathonClassCourse/, '트랙이 아직 화면에 그대로 펼쳐져 있다');

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

/*
 * 2026-09-03: 트랙 위 점이 서로 가리는지는 **눈이 아니라 좌표로** 본다.
 * 처음에는 위아래 네 줄로만 어긋나게 놓았는데, 학기 초처럼 스물넷이 같은 자리에 서면
 * 네 줄에 여섯씩 겹쳐 앉아 실제로 60쌍이 서로 가렸다(dev-lab 에서 재어 확인).
 */
test('트랙 위의 점은 아이가 몰려도 서로 가리지 않는다', async () => {
    const { buildRunners, DOT_RADIUS, TRACK_LEFT, TRACK_RIGHT } =
        await import('../src/modules/writing/reading-log/marathon/classCourseLayout.js');

    // 첨자로 꺼내면 lint 가 경고한다. 짝을 잘라 내며 훑는다.
    const closestGap = (placed) => {
        let min = Infinity;
        placed.forEach((one, index) => {
            placed.slice(index + 1).forEach((other) => {
                min = Math.min(min, Math.hypot(one.x - other.x, one.y - other.y));
            });
        });
        return min;
    };

    const names = Array.from({ length: 24 }, (_, index) => ({
        student_id: `s${index}`, name: `학생${index}`, distance_m: 0
    }));

    // 학기 초 — 스물넷이 모두 출발선에 서 있다.
    const allAtStart = buildRunners(names, 20000);
    assert.equal(allAtStart.length, 24);
    assert.ok(closestGap(allAtStart) >= DOT_RADIUS * 2,
        `출발선에 몰린 아이들의 점이 겹친다 (가장 가까운 사이 ${closestGap(allAtStart).toFixed(1)})`);

    // 거의 같은 자리에 몰린 경우도 마찬가지다.
    const huddled = names.map((row, index) => ({ ...row, distance_m: 9000 + (index % 3) * 60 }));
    const placedHuddled = buildRunners(huddled, 20000);
    assert.ok(closestGap(placedHuddled) >= DOT_RADIUS * 2,
        `몰린 아이들의 점이 겹친다 (가장 가까운 사이 ${closestGap(placedHuddled).toFixed(1)})`);

    // 반이 다 같이 목표에 닿은 경우 — 오른쪽 끝에서도 겹치거나 넘치면 안 된다.
    const allAtGoal = buildRunners(
        names.map((row) => ({ ...row, distance_m: 30000 })), 20000);
    assert.ok(closestGap(allAtGoal) >= DOT_RADIUS * 2,
        `목표선에 몰린 아이들의 점이 겹친다 (가장 가까운 사이 ${closestGap(allAtGoal).toFixed(1)})`);

    // 벌리다가 트랙 밖으로 나가면 안 된다.
    for (const runner of [...allAtStart, ...placedHuddled, ...allAtGoal]) {
        assert.ok(runner.x >= TRACK_LEFT && runner.x <= TRACK_RIGHT,
            `점이 트랙 밖으로 나갔다 (${runner.x})`);
    }

    // ⚠️ 빈 학급에서 터졌다(2026-09-03). 마지막 flush 가 빈 무리로 들어온다.
    assert.deepEqual(buildRunners([], 20000), []);
    assert.deepEqual(buildRunners(null, 20000), []);
    assert.deepEqual(buildRunners([{ name: '' }], 20000), []);
});

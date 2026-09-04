/*
 * 쪽수를 거리로 바꾸는 비율의 기본값.
 * 2026-09-03: 10m 에서 1m 로 내렸다 — 교사가 "1쪽은 1m 여야 한다"고 알려 왔다.
 * 학급마다 다르게 잡을 수 있어 설정 화면에서 1~100m 중 고른다(서버도 같은 범위를 지킨다).
 * ⚠️ 서버의 `reading_marathon_campaigns.meters_per_page` 기본값과 **같아야 한다**
 *    (마이그레이션 20261232). 한쪽만 바꾸면 화면과 실제 거리가 어긋난다.
 */
export const DEFAULT_METERS_PER_PAGE = 1;
export const DEFAULT_TARGET_DISTANCE_M = 42195;

export const getMarathonTeamAssignmentSummary = (teams = [], roster = []) => {
    const rosterIds = new Set(roster.map((student) => student.student_id).filter(Boolean));
    const assignmentCounts = new Map([...rosterIds].map((studentId) => [studentId, 0]));

    teams.forEach((team) => {
        (team.studentIds || []).forEach((studentId) => {
            if (assignmentCounts.has(studentId)) {
                assignmentCounts.set(studentId, assignmentCounts.get(studentId) + 1);
            }
        });
    });

    const unassignedIds = [];
    const duplicateIds = [];
    assignmentCounts.forEach((count, studentId) => {
        if (count === 0) unassignedIds.push(studentId);
        if (count > 1) duplicateIds.push(studentId);
    });

    return {
        complete: rosterIds.size > 0 && unassignedIds.length === 0 && duplicateIds.length === 0,
        assignedCount: rosterIds.size - unassignedIds.length,
        totalCount: rosterIds.size,
        unassignedIds,
        duplicateIds
    };
};

export const buildMarathonTeamPayload = (teams = []) => teams.map((team, index) => ({
    name: team.name.trim(),
    color: team.color,
    sort_order: index,
    student_ids: team.studentIds || []
}));

export const distributeMarathonRosterEvenly = (teams = [], roster = []) => {
    if (teams.length === 0) return [];
    const distributed = teams.map((team) => ({ ...team, studentIds: [] }));
    roster.forEach((student, index) => {
        if (!student?.student_id) return;
        distributed[index % distributed.length].studentIds.push(student.student_id);
    });
    return distributed;
};

export const distributeMarathonRosterRandomly = (teams = [], roster = [], random = Math.random) => {
    const shuffledRoster = [...roster];
    for (let index = shuffledRoster.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(random() * (index + 1));
        const [pickedStudent] = shuffledRoster.splice(randomIndex, 1);
        shuffledRoster.splice(index, 0, pickedStudent);
    }
    return distributeMarathonRosterEvenly(teams, shuffledRoster);
};

const COURSE_POINTS = Object.freeze([
    [44, 186], [172, 126], [305, 168], [438, 91],
    [578, 137], [724, 66], [856, 108]
]);

export const clampProgress = (value) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return 0;
    return Math.min(100, Math.max(0, numeric));
};

export const getProgressPercent = (distanceM, targetDistanceM) => {
    const target = Number(targetDistanceM);
    if (!Number.isFinite(target) || target <= 0) return 0;
    return clampProgress((Number(distanceM) || 0) * 100 / target);
};

export const formatMarathonDistance = (distanceM) => {
    const meters = Math.max(0, Math.round(Number(distanceM) || 0));
    if (meters < 1000) return `${meters.toLocaleString('ko-KR')}m`;
    const kilometers = meters / 1000;
    const digits = kilometers >= 100 || Number.isInteger(kilometers) ? 0 : 1;
    return `${kilometers.toLocaleString('ko-KR', {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
    })}km`;
};

export const getCoursePosition = (progressValue) => {
    const progress = clampProgress(progressValue) / 100;
    const scaled = progress * (COURSE_POINTS.length - 1);
    const segmentIndex = Math.min(COURSE_POINTS.length - 2, Math.floor(scaled));
    const segmentProgress = scaled - segmentIndex;
    const [startX, startY] = COURSE_POINTS.at(segmentIndex);
    const [endX, endY] = COURSE_POINTS.at(segmentIndex + 1);
    return {
        x: startX + (endX - startX) * segmentProgress,
        y: startY + (endY - startY) * segmentProgress
    };
};

export const normalizeMarathonSnapshot = (data) => {
    const campaign = data?.campaign || null;
    const summary = data?.summary || {};
    return {
        campaign,
        summary: {
            totalPages: Number(summary.total_pages) || 0,
            totalDistanceM: Number(summary.total_distance_m) || 0,
            targetDistanceM: Number(summary.target_distance_m || campaign?.target_distance_m) || 0,
            progressPercent: getProgressPercent(
                summary.total_distance_m,
                summary.target_distance_m || campaign?.target_distance_m
            ),
            contributors: Number(summary.contributors) || 0,
            bookCount: Number(summary.book_count) || 0,
            pendingBookCount: Number(summary.pending_book_count) || 0
        },
        leaderboard: Array.isArray(data?.leaderboard) ? data.leaderboard.map((row) => ({
            ...row,
            rank: Number(row.rank) || 0,
            total_pages: Number(row.total_pages) || 0,
            distance_m: Number(row.distance_m) || 0,
            book_count: Number(row.book_count) || 0
        })) : [],
        teams: Array.isArray(data?.teams) ? data.teams.map((row) => ({
            ...row,
            total_pages: Number(row.total_pages) || 0,
            total_distance_m: Number(row.total_distance_m) || 0,
            book_count: Number(row.book_count) || 0,
            member_count: Number(row.member_count) || 0,
            rank: Number(row.rank) || 0
        })) : [],
        teamLeaderboard: Array.isArray(data?.team_leaderboard) ? data.team_leaderboard.map((row) => ({
            ...row,
            total_pages: Number(row.total_pages) || 0,
            total_distance_m: Number(row.total_distance_m) || 0,
            book_count: Number(row.book_count) || 0,
            member_count: Number(row.member_count) || 0,
            rank: Number(row.rank) || 0
        })) : [],
        recent: Array.isArray(data?.recent) ? data.recent : [],
        pendingBooks: Array.isArray(data?.pending_books) ? data.pending_books : [],
        my: data?.my ? {
            ...data.my,
            rank: Number(data.my.rank) || 0,
            total_pages: Number(data.my.total_pages) || 0,
            distance_m: Number(data.my.distance_m) || 0,
            book_count: Number(data.my.book_count) || 0
        } : null,
        myTeam: data?.my_team ? {
            ...data.my_team,
            total_pages: Number(data.my_team.total_pages) || 0,
            total_distance_m: Number(data.my_team.total_distance_m) || 0,
            book_count: Number(data.my_team.book_count) || 0,
            member_count: Number(data.my_team.member_count) || 0,
            rank: Number(data.my_team.rank) || 0
        } : null,
        roster: Array.isArray(data?.roster) ? data.roster.map((row) => ({
            ...row,
            total_pages: Number(row.total_pages) || 0,
            distance_m: Number(row.distance_m) || 0,
            book_count: Number(row.book_count) || 0,
            rank: Number(row.rank) || 0
        })) : [],
        latestMedal: data?.latest_medal || null,
        medalCount: Number(data?.medal_count) || 0,
        isTeacher: Boolean(data?.is_teacher)
    };
};

export const getCompetitionLabel = (competitionType) => {
    if (competitionType === 'individual') return '개인전';
    if (competitionType === 'group_team') return '모둠 대항전';
    return '우리 반 전체전';
};

export const getMedalRequirementLabel = (campaign) => {
    if (!campaign || campaign.competition_type === 'individual') return '개인 목표 거리를 완주하면 메달을 받아요.';
    if (campaign.medal_requirement_type === 'none') return '팀이 완주하면 모든 팀원이 메달을 받아요.';
    const value = Number(campaign.medal_requirement_value) || 0;
    return campaign.medal_requirement_type === 'pages'
        ? `팀 완주 + 개인 ${value.toLocaleString('ko-KR')}쪽 이상이면 메달을 받아요.`
        : `팀 완주 + 개인 ${value.toLocaleString('ko-KR')}권 이상이면 메달을 받아요.`;
};

/*
 * 이 학생이 완주했는가.
 *
 * 개인전은 내 거리, 모둠전은 우리 모둠, 학급 전체전은 캠페인 상태로 가른다.
 * 화면 표시(`🎉 완주!`)와 축하 창이 **같은 기준**을 쓰도록 한 곳에 둔다 —
 * 두 곳에서 따로 세면 한쪽만 고쳐져 어긋난다(2026-09-03).
 */
export const isMarathonCompletedForStudent = (snapshot) => {
    const campaign = snapshot?.campaign;
    if (!campaign) return false;
    const type = campaign.competition_type || 'class_team';
    if (type === 'individual') return Boolean(snapshot.my?.completed_at);
    if (type === 'group_team') return Boolean(snapshot.myTeam?.completed_at);
    return campaign.status === 'completed';
};

/*
 * 운영 현황 위쪽 숫자칸을 경기 방식에 맞게 고른다(2026-09-03).
 *
 * 왜: 세 방식 모두 같은 숫자를 보여 주고 있었는데, 목표가 가리키는 대상이 서로 다르다.
 *  - 개인전   : 목표는 **학생 한 명당**
 *  - 모둠 대항전: 목표는 **모둠 하나당**
 *  - 우리 반 전체전: 목표는 **반 전체**
 * 그래서 개인전·모둠전에서 `공동 달성 거리`와 `남은 거리`를 반 전체 합계로 보여 주면
 * 목표와 견줄 수 없는 숫자가 된다(교사가 "개인전인데 공동 거리가 보인다"고 알려 왔다).
 *
 * ⚠️ 새로 읽는 자료는 없다. 이미 받아 둔 순위표·모둠 목록을 다시 셀 뿐이다.
 * ⚠️ 개인 이름은 넣지 않는다 — 여기는 반 전체를 한눈에 보는 자리다.
 */

const percentOf = (distanceM, targetM) => getProgressPercent(distanceM, targetM);

const averagePercent = (rows, targetM) => {
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const sum = rows.reduce((total, row) => total + percentOf(row.distance_m ?? row.total_distance_m, targetM), 0);
    return Math.round(sum / rows.length);
};

export const getMarathonDashboardStats = ({ campaign, summary, leaderboard = [], teams = [] } = {}) => {
    const targetM = Number(summary?.targetDistanceM || campaign?.target_distance_m) || 0;
    const competitionType = campaign?.competition_type;

    if (competitionType === 'individual') {
        const students = Array.isArray(leaderboard) ? leaderboard : [];
        const finished = students.filter((row) => Number(row.distance_m) >= targetM && targetM > 0).length;
        const notStarted = students.filter((row) => !Number(row.distance_m)).length;
        return [
            { key: 'target', label: '1인당 목표 거리', value: formatMarathonDistance(targetM) },
            { key: 'finished', label: '완주한 학생', value: `${finished}/${students.length}명` },
            { key: 'average', label: '평균 달성률', value: `${averagePercent(students, targetM)}%` },
            { key: 'not-started', label: '아직 첫 책 전', value: `${notStarted}명` }
        ];
    }

    if (competitionType === 'group_team') {
        const groups = Array.isArray(teams) ? teams : [];
        const finished = groups.filter((team) => Number(team.total_distance_m) >= targetM && targetM > 0).length;
        return [
            { key: 'target', label: '모둠별 목표 거리', value: formatMarathonDistance(targetM) },
            { key: 'finished', label: '완주한 모둠', value: `${finished}/${groups.length}모둠` },
            { key: 'average', label: '모둠 평균 달성률', value: `${averagePercent(groups, targetM)}%` },
            { key: 'contributors', label: '참여 학생', value: `${Number(summary?.contributors) || 0}명` }
        ];
    }

    // 우리 반 전체전 — 목표가 반 전체이므로 합계와 남은 거리가 그대로 뜻이 통한다.
    const totalM = Number(summary?.totalDistanceM) || 0;
    return [
        { key: 'total', label: '공동 달성 거리', value: formatMarathonDistance(totalM) },
        { key: 'progress', label: '목표 달성률', value: `${Math.round(percentOf(totalM, targetM))}%` },
        { key: 'remaining', label: '남은 거리', value: formatMarathonDistance(Math.max(0, targetM - totalM)) },
        { key: 'contributors', label: '참여 학생', value: `${Number(summary?.contributors) || 0}명` }
    ];
};

const DEFAULT_METERS_PER_PAGE = 10;
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

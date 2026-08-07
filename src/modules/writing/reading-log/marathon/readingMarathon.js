export const DEFAULT_METERS_PER_PAGE = 10;
export const DEFAULT_TARGET_DISTANCE_M = 42195;

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
        recent: Array.isArray(data?.recent) ? data.recent : [],
        pendingBooks: Array.isArray(data?.pending_books) ? data.pending_books : [],
        my: data?.my ? {
            ...data.my,
            rank: Number(data.my.rank) || 0,
            total_pages: Number(data.my.total_pages) || 0,
            distance_m: Number(data.my.distance_m) || 0,
            book_count: Number(data.my.book_count) || 0
        } : null,
        isTeacher: Boolean(data?.is_teacher)
    };
};

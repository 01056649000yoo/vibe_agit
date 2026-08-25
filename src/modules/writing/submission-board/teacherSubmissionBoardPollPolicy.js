export const TEACHER_SUBMISSION_BOARD_POLL_INTERVAL_MS = 12000;
export const TEACHER_SUBMISSION_BOARD_POLL_MAX_BACKOFF_MS = 120000;
export const TEACHER_SUBMISSION_BOARD_RECENT_LIMIT = 8;

export const getTeacherSubmissionBoardNextDelay = ({ failureCount = 0, elapsedMs = 0 } = {}) => {
    if (failureCount > 0) {
        return Math.min(
            TEACHER_SUBMISSION_BOARD_POLL_MAX_BACKOFF_MS,
            30000 * (2 ** Math.min(2, failureCount - 1))
        );
    }
    return Math.max(0, TEACHER_SUBMISSION_BOARD_POLL_INTERVAL_MS - Math.max(0, elapsedMs));
};

export const PRIORITY_WRITING_POLL_INTERVAL_MS = 12000;
export const PRIORITY_WRITING_POLL_MAX_BACKOFF_MS = 120000;
export const PRIORITY_WRITING_BANNER_VISIBLE_MS = 8000;
export const PRIORITY_WRITING_INITIAL_CURSOR_ID = '00000000-0000-0000-0000-000000000000';

export const getPriorityWritingInitialDelay = (randomValue = Math.random()) => {
    const bounded = Math.min(0.999999, Math.max(0, Number(randomValue) || 0));
    return Math.floor(bounded * PRIORITY_WRITING_POLL_INTERVAL_MS);
};

export const getPriorityWritingNextDelay = ({ failureCount = 0, elapsedMs = 0 } = {}) => {
    if (failureCount > 0) {
        return Math.min(
            PRIORITY_WRITING_POLL_MAX_BACKOFF_MS,
            30000 * (2 ** Math.min(2, failureCount - 1))
        );
    }
    return Math.max(0, PRIORITY_WRITING_POLL_INTERVAL_MS - Math.max(0, elapsedMs));
};

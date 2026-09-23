import { useEffect } from 'react';
import { getTeacherSubmissionBoardNextDelay } from '../../writing/submission-board/teacherSubmissionBoardPollPolicy';

/*
 * 교사가 모두의 아지트를 보고 있을 때만 작업 공간을 다시 읽는다.
 * 제출 전광판과 같은 완료 시점 기준 12초 정책을 써서 요청이 겹치지 않고, 숨은 탭에서는 멈춘다.
 */
export const useTeacherWorkspacePoll = ({ enabled, refresh }) => {
    useEffect(() => {
        if (!enabled || !refresh) return undefined;

        let stopped = false;
        let inFlight = false;
        let timerId = null;
        let failureCount = 0;

        const clearTimer = () => {
            if (timerId !== null) window.clearTimeout(timerId);
            timerId = null;
        };
        const schedule = (delay) => {
            if (stopped || document.visibilityState !== 'visible') return;
            clearTimer();
            timerId = window.setTimeout(runPoll, delay);
        };
        async function runPoll() {
            timerId = null;
            if (stopped || inFlight || document.visibilityState !== 'visible') return;
            inFlight = true;
            const startedAt = Date.now();
            try {
                await refresh();
                failureCount = 0;
            } catch {
                failureCount += 1;
            } finally {
                inFlight = false;
                schedule(getTeacherSubmissionBoardNextDelay({
                    failureCount,
                    elapsedMs: Date.now() - startedAt
                }));
            }
        }
        const pollOnReturn = () => {
            if (document.visibilityState !== 'visible') {
                clearTimer();
                return;
            }
            schedule(0);
        };

        schedule(0);
        window.addEventListener('focus', pollOnReturn);
        window.addEventListener('online', pollOnReturn);
        document.addEventListener('visibilitychange', pollOnReturn);
        return () => {
            stopped = true;
            clearTimer();
            window.removeEventListener('focus', pollOnReturn);
            window.removeEventListener('online', pollOnReturn);
            document.removeEventListener('visibilitychange', pollOnReturn);
        };
    }, [enabled, refresh]);
};

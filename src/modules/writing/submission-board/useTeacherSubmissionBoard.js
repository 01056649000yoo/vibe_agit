import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { teacherSubmissionBoardApi } from './teacherSubmissionBoardApi';
import {
    getTeacherSubmissionBoardNextDelay
} from './teacherSubmissionBoardPollPolicy';

const emptyBoard = (totalStudents = 0) => ({
    version: 1,
    generated_at: null,
    total_students: Number(totalStudents || 0),
    pending_total: 0,
    submitted_total: 0,
    submission_counts: {},
    completion_counts: {},
    mission_statuses: {},
    recent_submissions: []
});

const numberOrZero = (value) => Math.max(0, Number(value || 0));

const normalizeStatus = (status, totalStudents) => ({
    totalStudents: numberOrZero(status?.totalStudents ?? totalStudents),
    submittedCount: numberOrZero(status?.submittedCount),
    confirmedCount: numberOrZero(status?.confirmedCount),
    pendingCount: numberOrZero(status?.pendingCount),
    rewritingCount: numberOrZero(status?.rewritingCount),
    notSubmittedCount: numberOrZero(status?.notSubmittedCount)
});

const normalizeBoard = (value, fallback = {}) => {
    const totalStudents = numberOrZero(value?.total_students ?? fallback.totalStudents);
    const legacyCounts = fallback.submissionCounts || {};
    const sourceStatuses = value?.mission_statuses || Object.fromEntries(
        Object.entries(legacyCounts).map(([missionId, count]) => [missionId, {
            totalStudents,
            submittedCount: numberOrZero(count),
            confirmedCount: numberOrZero(count),
            pendingCount: 0,
            rewritingCount: 0,
            notSubmittedCount: Math.max(0, totalStudents - numberOrZero(count))
        }])
    );
    const missionStatuses = Object.fromEntries(
        Object.entries(sourceStatuses).map(([missionId, status]) => [
            missionId,
            normalizeStatus(status, totalStudents)
        ])
    );
    const submissionCounts = value?.submission_counts || Object.fromEntries(
        Object.entries(missionStatuses).map(([missionId, status]) => [missionId, status.submittedCount])
    );

    return {
        ...emptyBoard(totalStudents),
        ...value,
        total_students: totalStudents,
        pending_total: numberOrZero(value?.pending_total),
        submitted_total: numberOrZero(value?.submitted_total),
        submission_counts: submissionCounts,
        completion_counts: value?.completion_counts || {},
        mission_statuses: missionStatuses,
        recent_submissions: Array.isArray(value?.recent_submissions) ? value.recent_submissions.slice(0, 8) : []
    };
};

const TRANSITION_DELTAS = new Map([
    ['approve', Object.freeze({ confirmedCount: 1, pendingCount: -1 })],
    ['recover', Object.freeze({ confirmedCount: -1, pendingCount: 1 })],
    ['request-rewrite', Object.freeze({ submittedCount: -1, pendingCount: -1, rewritingCount: 1 })],
    ['recall', Object.freeze({ submittedCount: 1, pendingCount: 1, rewritingCount: -1 })],
    ['undo-recall', Object.freeze({ submittedCount: -1, pendingCount: -1, rewritingCount: 1 })]
]);

export const useTeacherSubmissionBoard = (classId, { enabled = false } = {}) => {
    const [board, setBoard] = useState(() => emptyBoard());
    const [hasSnapshot, setHasSnapshot] = useState(false);
    const [pollError, setPollError] = useState(false);
    const localMutationVersionRef = useRef(0);

    useEffect(() => {
        setBoard(emptyBoard());
        setHasSnapshot(false);
        setPollError(false);
        localMutationVersionRef.current = 0;
    }, [classId]);

    const hydrateBoard = useCallback((value, fallback = {}) => {
        setBoard(normalizeBoard(value, fallback));
        setHasSnapshot(true);
        setPollError(false);
        localMutationVersionRef.current = 0;
    }, []);

    useEffect(() => {
        if (!enabled || !classId || !hasSnapshot) return undefined;

        let stopped = false;
        let timerId = null;
        let inFlight = false;
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

        const runPoll = async () => {
            timerId = null;
            if (stopped || inFlight || document.visibilityState !== 'visible') return;
            inFlight = true;
            const startedAt = Date.now();
            const mutationVersionAtStart = localMutationVersionRef.current;
            try {
                const nextBoard = await teacherSubmissionBoardApi.getSnapshot(classId);
                if (!stopped && mutationVersionAtStart === localMutationVersionRef.current) {
                    setBoard(normalizeBoard(nextBoard));
                }
                if (!stopped) setPollError(false);
                failureCount = 0;
            } catch {
                failureCount += 1;
                if (!stopped) setPollError(true);
            } finally {
                inFlight = false;
                if (!stopped && document.visibilityState === 'visible') {
                    schedule(getTeacherSubmissionBoardNextDelay({
                        failureCount,
                        elapsedMs: Date.now() - startedAt
                    }));
                }
            }
        };

        const pollOnReturn = () => {
            if (document.visibilityState !== 'visible') {
                clearTimer();
                return;
            }
            schedule(0);
        };

        // 전광판 화면을 직접 연 동작에는 현재 스냅샷을 즉시 확인하고,
        // 이후 요청만 완료 시점 기준 12초 간격으로 이어 간다.
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
    }, [classId, enabled, hasSnapshot]);

    const transitionMissionStatus = useCallback((missionId, transition, count = 1) => {
        const delta = TRANSITION_DELTAS.get(transition);
        const amount = Math.max(0, Number(count || 0));
        if (!missionId || !delta || amount === 0) return;

        localMutationVersionRef.current += 1;
        setBoard((current) => {
            const currentStatus = Reflect.get(current.mission_statuses || {}, missionId);
            if (!currentStatus) return current;

            const total = numberOrZero(currentStatus.totalStudents || current.total_students);
            const submittedCount = Math.min(total, Math.max(0,
                currentStatus.submittedCount + (delta.submittedCount || 0) * amount
            ));
            const confirmedCount = Math.min(submittedCount, Math.max(0,
                currentStatus.confirmedCount + (delta.confirmedCount || 0) * amount
            ));
            const pendingCount = Math.min(submittedCount - confirmedCount, Math.max(0,
                currentStatus.pendingCount + (delta.pendingCount || 0) * amount
            ));
            const rewritingCount = Math.min(total - submittedCount, Math.max(0,
                currentStatus.rewritingCount + (delta.rewritingCount || 0) * amount
            ));
            const nextStatus = {
                ...currentStatus,
                submittedCount,
                confirmedCount,
                pendingCount,
                rewritingCount,
                notSubmittedCount: Math.max(0, total - submittedCount - rewritingCount)
            };

            return {
                ...current,
                pending_total: Math.max(0, numberOrZero(current.pending_total) - currentStatus.pendingCount + pendingCount),
                submitted_total: Math.max(0, numberOrZero(current.submitted_total) - currentStatus.submittedCount + submittedCount),
                submission_counts: { ...current.submission_counts, [missionId]: submittedCount },
                completion_counts: { ...current.completion_counts, [missionId]: confirmedCount },
                mission_statuses: { ...current.mission_statuses, [missionId]: nextStatus }
            };
        });
    }, []);

    const submissionCounts = useMemo(() => board.submission_counts || {}, [board.submission_counts]);
    const loadSubmissionHistory = useCallback(() => {
        if (!classId) return Promise.reject(new Error('학급을 먼저 선택해주세요.'));
        return teacherSubmissionBoardApi.getHistory(classId);
    }, [classId]);

    return {
        board,
        submissionCounts,
        hasSnapshot,
        pollError,
        hydrateBoard,
        transitionMissionStatus,
        loadSubmissionHistory
    };
};

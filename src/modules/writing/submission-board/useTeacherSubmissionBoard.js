import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { teacherSubmissionBoardApi } from './teacherSubmissionBoardApi';
import {
    getTeacherSubmissionBoardNextDelay
} from './teacherSubmissionBoardPollPolicy';

const emptyBoard = (totalStudents = 0) => ({
    version: 1,
    scope: 'all',
    selected_mission_id: null,
    selected_mission_title: null,
    generated_at: null,
    total_students: Number(totalStudents || 0),
    pending_total: 0,
    submitted_total: 0,
    submission_counts: {},
    completion_counts: {},
    mission_statuses: {},
    scope_summary: {
        total_students: Number(totalStudents || 0),
        confirmed_count: 0,
        pending_count: 0,
        rewriting_count: 0,
        not_submitted_count: 0
    },
    student_statuses: [],
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

const normalizeStudentStatus = (status) => ({
    student_id: status?.student_id || null,
    student_name: status?.student_name || '학생',
    assignment_count: numberOrZero(status?.assignment_count),
    confirmed_count: numberOrZero(status?.confirmed_count),
    pending_count: numberOrZero(status?.pending_count),
    rewriting_count: numberOrZero(status?.rewriting_count),
    not_submitted_count: numberOrZero(status?.not_submitted_count),
    status: ['confirmed', 'pending', 'rewriting', 'not_submitted'].includes(status?.status)
        ? status.status
        : null
});

const summarizeStudents = (students, totalStudents) => students.reduce((summary, student) => ({
    ...summary,
    confirmed_count: summary.confirmed_count + numberOrZero(student.confirmed_count),
    pending_count: summary.pending_count + numberOrZero(student.pending_count),
    rewriting_count: summary.rewriting_count + numberOrZero(student.rewriting_count),
    not_submitted_count: summary.not_submitted_count + numberOrZero(student.not_submitted_count)
}), {
    total_students: numberOrZero(totalStudents),
    confirmed_count: 0,
    pending_count: 0,
    rewriting_count: 0,
    not_submitted_count: 0
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

    const studentStatuses = Array.isArray(value?.student_statuses)
        ? value.student_statuses.slice(0, 100).map(normalizeStudentStatus)
        : [];

    return {
        ...emptyBoard(totalStudents),
        ...value,
        scope: value?.scope === 'mission' ? 'mission' : 'all',
        selected_mission_id: value?.selected_mission_id || null,
        selected_mission_title: value?.selected_mission_title || null,
        total_students: totalStudents,
        pending_total: numberOrZero(value?.pending_total),
        submitted_total: numberOrZero(value?.submitted_total),
        submission_counts: submissionCounts,
        completion_counts: value?.completion_counts || {},
        mission_statuses: missionStatuses,
        scope_summary: value?.scope_summary
            ? {
                total_students: numberOrZero(value.scope_summary.total_students ?? totalStudents),
                confirmed_count: numberOrZero(value.scope_summary.confirmed_count),
                pending_count: numberOrZero(value.scope_summary.pending_count),
                rewriting_count: numberOrZero(value.scope_summary.rewriting_count),
                not_submitted_count: numberOrZero(value.scope_summary.not_submitted_count)
            }
            : summarizeStudents(studentStatuses, totalStudents),
        student_statuses: studentStatuses,
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

const STUDENT_TRANSITION_DELTAS = new Map([
    ['approve', Object.freeze({ confirmed_count: 1, pending_count: -1 })],
    ['recover', Object.freeze({ confirmed_count: -1, pending_count: 1 })],
    ['request-rewrite', Object.freeze({ pending_count: -1, rewriting_count: 1 })],
    ['recall', Object.freeze({ pending_count: 1, rewriting_count: -1 })],
    ['undo-recall', Object.freeze({ pending_count: -1, rewriting_count: 1 })]
]);

export const useTeacherSubmissionBoard = (classId, { enabled = false } = {}) => {
    const [board, setBoard] = useState(() => emptyBoard());
    const [hasSnapshot, setHasSnapshot] = useState(false);
    const [pollError, setPollError] = useState(false);
    const [selectedMissionId, setSelectedMissionId] = useState(null);
    const [isScopeLoading, setIsScopeLoading] = useState(false);
    const localMutationVersionRef = useRef(0);
    // 교사가 범위를 한 번이라도 직접 고르면 그 뒤로는 기본값을 덮어쓰지 않는다.
    const scopeChosenRef = useRef(false);

    useEffect(() => {
        setBoard(emptyBoard());
        setHasSnapshot(false);
        setPollError(false);
        setSelectedMissionId(null);
        setIsScopeLoading(false);
        localMutationVersionRef.current = 0;
        scopeChosenRef.current = false;
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
                const nextBoard = await teacherSubmissionBoardApi.getSnapshot(classId, selectedMissionId);
                if (!stopped && mutationVersionAtStart === localMutationVersionRef.current) {
                    setBoard(normalizeBoard(nextBoard));
                }
                if (!stopped) {
                    setPollError(false);
                    setIsScopeLoading(false);
                }
                failureCount = 0;
            } catch {
                failureCount += 1;
                if (!stopped) {
                    setPollError(true);
                    setIsScopeLoading(false);
                }
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
    }, [classId, enabled, hasSnapshot, selectedMissionId]);

    const selectMissionScope = useCallback((missionId) => {
        const nextMissionId = missionId || null;
        scopeChosenRef.current = true;
        if (selectedMissionId === nextMissionId) return;
        setIsScopeLoading(true);
        setPollError(false);
        setSelectedMissionId(nextMissionId);
    }, [selectedMissionId]);

    // 화면을 처음 열 때 한 번만 가장 최근 과제로 맞춘다. 과제 목록은 전광판을 연 뒤에
    // 도착할 수 있으므로 도착 시점에 적용하며, 교사가 이미 범위를 골랐다면 건드리지 않는다.
    const applyDefaultMissionScope = useCallback((missionId) => {
        if (!missionId || scopeChosenRef.current) return;
        scopeChosenRef.current = true;
        setIsScopeLoading(true);
        setPollError(false);
        setSelectedMissionId(missionId);
    }, []);

    const transitionMissionStatus = useCallback((missionId, transition, count = 1, studentIds = []) => {
        const delta = TRANSITION_DELTAS.get(transition);
        const studentDelta = STUDENT_TRANSITION_DELTAS.get(transition);
        const amount = Math.max(0, Number(count || 0));
        if (!missionId || !delta || amount === 0) return;
        const targetStudentIds = new Set(
            (Array.isArray(studentIds) ? studentIds : [studentIds]).filter(Boolean)
        );

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
            const canUpdateScopedStudents = current.scope !== 'mission'
                || current.selected_mission_id === missionId;
            const studentStatuses = targetStudentIds.size > 0 && studentDelta && canUpdateScopedStudents
                ? current.student_statuses.map((student) => {
                    if (!targetStudentIds.has(student.student_id)) return student;
                    const nextStudent = { ...student };
                    Object.entries(studentDelta).forEach(([key, value]) => {
                        Reflect.set(nextStudent, key, Math.max(0, numberOrZero(Reflect.get(student, key)) + value));
                    });
                    if (current.scope === 'mission') {
                        nextStudent.status = nextStudent.confirmed_count > 0
                            ? 'confirmed'
                            : nextStudent.pending_count > 0
                                ? 'pending'
                                : nextStudent.rewriting_count > 0 ? 'rewriting' : 'not_submitted';
                    }
                    return nextStudent;
                })
                : current.student_statuses;

            return {
                ...current,
                pending_total: Math.max(0, numberOrZero(current.pending_total) - currentStatus.pendingCount + pendingCount),
                submitted_total: Math.max(0, numberOrZero(current.submitted_total) - currentStatus.submittedCount + submittedCount),
                submission_counts: { ...current.submission_counts, [missionId]: submittedCount },
                completion_counts: { ...current.completion_counts, [missionId]: confirmedCount },
                mission_statuses: { ...current.mission_statuses, [missionId]: nextStatus },
                scope_summary: summarizeStudents(studentStatuses, current.total_students),
                student_statuses: studentStatuses
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
        selectedMissionId,
        isScopeLoading,
        hydrateBoard,
        selectMissionScope,
        applyDefaultMissionScope,
        transitionMissionStatus,
        loadSubmissionHistory
    };
};

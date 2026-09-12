/*
 * 동행 모드의 상태 한 곳.
 *
 * 무엇이 다음 단계인지는 `teacherTour.js`(순수 함수)가 정한다. 이 훅은 그 결정을
 * DB 에 적고, 자동 판정에 필요한 숫자만 모은다.
 *
 * 학생 수를 **그 단계일 때만** 센다: 동행 모드를 쓰지 않는 교사에게는 조회가 한 번도
 * 붙지 않아야 한다. 학급 수는 대시보드가 이미 들고 있으므로 그대로 받는다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    getTeacherTourSteps,
    getTourEntry,
    isStepSatisfied,
    normalizeTourState,
    reduceTourState,
    shouldOfferTour
} from '../guides/teacherTour.js';
import { countActiveStudents, loadTeacherTourState, saveTeacherTourState } from '../lib/teacherTourStore';

const DEFAULT_TOUR_ID = 'getting-started';
const STUDENT_POLL_MS = 2500;

const useTeacherTour = ({ userId, classes = [], activeClassId = null, tourId = DEFAULT_TOUR_ID }) => {
    const [state, setState] = useState(() => normalizeTourState(null));
    const [loaded, setLoaded] = useState(false);
    // 학급을 바꾸면 앞 학급의 학생 수로 다음 단계가 열리면 안 된다. 학급 이름표를 함께 들고 다닌다.
    const [studentTally, setStudentTally] = useState(null);
    const stateRef = useRef(state);
    const ready = !userId || loaded;

    const steps = useMemo(() => getTeacherTourSteps(tourId), [tourId]);
    const entry = useMemo(() => getTourEntry(state, tourId), [state, tourId]);
    const stepIndex = useMemo(() => {
        const found = steps.findIndex((step) => step.stepId === entry?.stepId);
        return found === -1 ? 0 : found;
    }, [steps, entry]);
    const step = steps.at(stepIndex) || null;
    const isRunning = entry?.status === 'running' && Boolean(step);

    useEffect(() => { stateRef.current = state; }, [state]);

    useEffect(() => {
        if (!userId) return undefined;
        let cancelled = false;
        loadTeacherTourState(userId)
            .then((next) => { if (!cancelled) setState(next); })
            // 진행 기록을 못 읽는 것이 대시보드를 막을 이유는 없다. 안내만 안 뜬다.
            .catch(() => {})
            .finally(() => { if (!cancelled) setLoaded(true); });
        return () => { cancelled = true; };
    }, [userId]);

    const apply = useCallback((action) => {
        const next = reduceTourState(stateRef.current, tourId, action);
        stateRef.current = next;
        setState(next);
        void saveTeacherTourState(userId, next).catch(() => {});
    }, [tourId, userId]);

    // 학생 수는 그 단계일 때만, 그 학급만 센다.
    const needsStudentCount = isRunning && step?.done?.signal === 'studentCount';
    useEffect(() => {
        if (!needsStudentCount || !activeClassId) return undefined;
        let cancelled = false;
        const read = () => {
            countActiveStudents(activeClassId)
                .then((count) => { if (!cancelled) setStudentTally({ classId: activeClassId, count }); })
                .catch(() => {});
        };
        read();
        const timerId = window.setInterval(read, STUDENT_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timerId);
        };
    }, [needsStudentCount, activeClassId]);

    const signals = useMemo(() => ({
        classCount: classes.length,
        studentCount: studentTally?.classId === activeClassId ? studentTally.count : 0
    }), [classes.length, studentTally, activeClassId]);

    // 교사가 실제로 해냈으면 저절로 다음 단계로 넘어간다.
    useEffect(() => {
        if (!isRunning || !step) return;
        if (!isStepSatisfied(step, signals)) return;
        apply('complete');
    }, [isRunning, step, signals, apply]);

    return {
        ready,
        tourId,
        steps,
        step,
        stepIndex,
        totalSteps: steps.length,
        isRunning,
        status: entry?.status || 'idle',
        completedStepIds: entry?.completed || [],
        // 이미 학급이 있는 교사에게는 첫 걸음 카드를 권하지 않는다.
        canOffer: ready && shouldOfferTour(state, tourId),
        start: useCallback(() => apply('start'), [apply]),
        acknowledge: useCallback(() => apply('complete'), [apply]),
        skipStep: useCallback(() => apply('skipStep'), [apply]),
        back: useCallback(() => apply('back'), [apply]),
        stop: useCallback(() => apply('stop'), [apply])
    };
};

export default useTeacherTour;

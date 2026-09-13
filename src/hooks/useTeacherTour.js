/*
 * 동행 모드의 상태 한 곳.
 *
 * 무엇이 다음 단계인지는 `teacherTour.js`(순수 함수)가 정한다. 이 훅은 그 결정을
 * DB 에 적고, 자동 판정에 필요한 숫자만 모은다.
 *
 * 숫자는 **그 단계일 때만** 센다: 동행 모드를 쓰지 않는 교사에게는 조회가 한 번도
 * 붙지 않아야 한다. 학급 수는 대시보드가 이미 들고 있으므로 그대로 받는다.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    FIRST_TEACHER_TOUR_ID,
    getNextTourId,
    getTeacherTourSteps,
    getTourEntry,
    getTourStatuses,
    isStepSatisfied,
    markWelcomeSeen,
    normalizeTourState,
    reduceTourState,
    shouldOfferTour
} from '../guides/teacherTour.js';
import { countActiveStudents, countClassMissions, loadTeacherTourState, saveTeacherTourState } from '../lib/teacherTourStore';

const SIGNAL_POLL_MS = 2500;

// 자동 판정이 필요한 단계에서만, 그 단계가 보는 숫자만 센다.
const SIGNAL_READERS = Object.freeze({
    studentCount: countActiveStudents,
    missionCount: countClassMissions
});

const useTeacherTour = ({ userId, classes = [], classesLoaded = false, activeClassId = null }) => {
    const [state, setState] = useState(() => normalizeTourState(null));
    const [loaded, setLoaded] = useState(false);
    const [activeTourId, setActiveTourId] = useState(FIRST_TEACHER_TOUR_ID);
    // 학급을 바꾸면 앞 학급의 숫자로 다음 단계가 열리면 안 된다. 학급 이름표를 함께 들고 다닌다.
    const [tally, setTally] = useState(null);
    /*
     * "흐름 하나를 방금 끝냈다" 는 **이번 접속에서만** 참이다. DB 의 done 으로 판단하면
     * 다음 로그인 때마다 끝난 인사가 다시 뜬다.
     */
    const [justFinishedTourId, setJustFinishedTourId] = useState(null);
    const stateRef = useRef(state);
    /*
     * 학급 목록을 **다 받은 뒤에야** 판단한다. 받는 동안에는 `classes` 가 빈 배열이라,
     * 이미 학급이 있는 선생님도 잠깐 "학급 0개" 로 보인다. 그 틈에 환영 안내가 번쩍이거나
     * 동행 모드가 저절로 켜지면 안 된다.
     */
    const ready = (!userId || loaded) && classesLoaded;
    // 이번 접속에서 학급이 0개에서 늘어난 순간을 잡는다(= 첫 학급을 방금 만들었다).
    const lastClassCountRef = useRef(null);

    const steps = useMemo(() => getTeacherTourSteps(activeTourId), [activeTourId]);
    const entry = useMemo(() => getTourEntry(state, activeTourId), [state, activeTourId]);
    const stepIndex = useMemo(() => {
        const found = steps.findIndex((candidate) => candidate.stepId === entry?.stepId);
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

    const apply = useCallback((action, tourId = activeTourId) => {
        const next = reduceTourState(stateRef.current, tourId, action);
        stateRef.current = next;
        setState(next);
        setJustFinishedTourId(getTourEntry(next, tourId)?.status === 'done' ? tourId : null);
        void saveTeacherTourState(userId, next).catch(() => {});
    }, [activeTourId, userId]);

    const start = useCallback((tourId = FIRST_TEACHER_TOUR_ID) => {
        setActiveTourId(tourId);
        apply('start', tourId);
    }, [apply]);

    const signalName = isRunning && !step?.done?.ack ? step?.done?.signal : null;
    useEffect(() => {
        const reader = signalName ? Reflect.get(SIGNAL_READERS, signalName) : null;
        if (!reader || !activeClassId) return undefined;
        let cancelled = false;
        const read = () => {
            reader(activeClassId)
                .then((count) => { if (!cancelled) setTally({ classId: activeClassId, signal: signalName, count }); })
                .catch(() => {});
        };
        read();
        const timerId = window.setInterval(read, SIGNAL_POLL_MS);
        return () => {
            cancelled = true;
            window.clearInterval(timerId);
        };
    }, [signalName, activeClassId]);

    const signals = useMemo(() => {
        const observed = tally?.classId === activeClassId ? tally : null;
        return {
            classCount: classes.length,
            studentCount: observed?.signal === 'studentCount' ? observed.count : 0,
            missionCount: observed?.signal === 'missionCount' ? observed.count : 0
        };
    }, [classes.length, tally, activeClassId]);

    // 교사가 실제로 해냈으면 저절로 다음 단계로 넘어간다.
    useEffect(() => {
        if (!isRunning || !step) return;
        if (!isStepSatisfied(step, signals)) return;
        apply('complete');
    }, [isRunning, step, signals, apply]);

    const rememberWelcomeSeen = useCallback(() => {
        const next = markWelcomeSeen(stateRef.current);
        stateRef.current = next;
        setState(next);
        void saveTeacherTourState(userId, next).catch(() => {});
    }, [userId]);

    /*
     * 첫 학급을 만들면 그 자리에서 동행 모드가 이어진다.
     *
     * 전에는 학급이 생기는 순간 첫 걸음 카드가 사라져(카드는 학급 0개 화면에만 있다)
     * 안내서로 들어가지 않는 한 다시 시작할 길이 없었다. **이번 접속에서 0 → 1 로 바뀐
     * 경우만** 켠다 — 이미 학급이 있는 선생님은 처음부터 1 이상이라 걸리지 않는다.
     */
    useEffect(() => {
        if (!ready) return;
        const previous = lastClassCountRef.current;
        lastClassCountRef.current = classes.length;
        if (previous !== 0 || classes.length === 0) return;
        if (!shouldOfferTour(stateRef.current, FIRST_TEACHER_TOUR_ID)) return;
        if (getTourEntry(stateRef.current, FIRST_TEACHER_TOUR_ID)?.status === 'running') return;
        // 흐름 이름을 따로 세우지 않는다 — 첫 흐름이 기본값이라 그대로 이어 연다.
        apply('start', FIRST_TEACHER_TOUR_ID);
    }, [ready, classes.length, apply]);

    const statuses = useMemo(() => getTourStatuses(state), [state]);
    const nextTourId = useMemo(
        () => (justFinishedTourId ? getNextTourId(state, justFinishedTourId) : null),
        [state, justFinishedTourId]
    );

    return {
        ready,
        tourId: activeTourId,
        steps,
        step,
        stepIndex,
        totalSteps: steps.length,
        isRunning,
        status: entry?.status || 'idle',
        statuses,
        completedStepIds: entry?.completed || [],
        // 흐름 하나가 끝나면 이어서 볼 다음 흐름(이미 본 흐름은 건너뛴다). 없으면 null.
        justFinishedTourId,
        nextTourId,
        dismissFinished: useCallback(() => setJustFinishedTourId(null), []),
        // 이미 학급이 있는 교사에게는 첫 걸음 카드를 권하지 않는다.
        canOffer: ready && shouldOfferTour(state, FIRST_TEACHER_TOUR_ID),
        /*
         * 환영 안내는 **가입 직후에만** 뜬다. 학급이 하나라도 있으면 이미 쓰고 계신
         * 선생님이라 어느 날 갑자기 환영 인사가 뜨면 안 된다.
         */
        needsWelcome: ready && !state.welcomeSeenAt && classes.length === 0
            && shouldOfferTour(state, FIRST_TEACHER_TOUR_ID),
        markWelcomeSeen: rememberWelcomeSeen,
        start,
        acknowledge: useCallback(() => apply('complete'), [apply]),
        skipStep: useCallback(() => apply('skipStep'), [apply]),
        back: useCallback(() => apply('back'), [apply]),
        stop: useCallback(() => apply('stop'), [apply])
    };
};

export default useTeacherTour;

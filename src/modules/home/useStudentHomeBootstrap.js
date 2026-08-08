import { useCallback, useEffect, useRef, useState } from 'react';
import { STUDENT_HOME_INVALIDATE_EVENT, studentHomeApi } from './studentHomeApi';

const FOCUS_STALE_MS = 60000;
const MAX_FOCUS_JITTER_MS = 5000;

export const useStudentHomeBootstrap = (studentSession) => {
    const studentId = studentSession?.id || null;
    const [state, setState] = useState({ studentId: null, data: null, loading: Boolean(studentId), error: null });
    const loadedAtRef = useRef(0);
    const focusTimerRef = useRef(null);

    const refresh = useCallback(async ({ force = false } = {}) => {
        if (!studentId) return null;
        setState((current) => ({ ...current, studentId, loading: current.data == null, error: null }));
        try {
            const data = await studentHomeApi.get(studentId, { force });
            loadedAtRef.current = Date.now();
            setState({ studentId, data, loading: false, error: null });
            return data;
        } catch (error) {
            console.error('학생 홈 통합 데이터 로드 실패:', error.message);
            setState((current) => ({ ...current, studentId, loading: false, error }));
            return null;
        }
    }, [studentId]);

    useEffect(() => {
        if (!studentId) {
            setState({ studentId: null, data: null, loading: false, error: null });
            return undefined;
        }
        void refresh();

        const refreshIfStale = () => {
            if (document.visibilityState !== 'visible') return;
            if (Date.now() - loadedAtRef.current < FOCUS_STALE_MS) return;
            if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
            focusTimerRef.current = window.setTimeout(() => {
                focusTimerRef.current = null;
                void refresh({ force: true });
            }, Math.floor(Math.random() * MAX_FOCUS_JITTER_MS));
        };
        window.addEventListener('focus', refreshIfStale);
        document.addEventListener('visibilitychange', refreshIfStale);
        const handleInvalidation = (event) => {
            if (event.detail?.studentId === studentId) void refresh({ force: true });
        };
        window.addEventListener(STUDENT_HOME_INVALIDATE_EVENT, handleInvalidation);
        return () => {
            if (focusTimerRef.current) window.clearTimeout(focusTimerRef.current);
            window.removeEventListener('focus', refreshIfStale);
            document.removeEventListener('visibilitychange', refreshIfStale);
            window.removeEventListener(STUDENT_HOME_INVALIDATE_EVENT, handleInvalidation);
        };
    }, [refresh, studentId]);

    const loaded = state.studentId === studentId;
    return {
        data: loaded ? state.data : null,
        loading: Boolean(studentId) && (!loaded || state.loading),
        error: loaded ? state.error : null,
        refresh
    };
};

export default useStudentHomeBootstrap;

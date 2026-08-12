import { useCallback, useEffect, useRef, useState } from 'react';
import { STUDENT_HOME_INVALIDATE_EVENT, studentHomeApi } from './studentHomeApi';

const FOCUS_STALE_MS = 60000;

const useStudentHomeBootstrap = (studentSession) => {
    const studentId = studentSession?.id || null;
    const [state, setState] = useState({ studentId: null, data: null, loading: Boolean(studentId), error: null });
    const loadedAtRef = useRef(0);

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

    const refreshIfStale = useCallback(async ({ maxAgeMs = FOCUS_STALE_MS } = {}) => {
        if (!studentId || Date.now() - loadedAtRef.current < maxAgeMs) return null;
        return refresh({ force: true });
    }, [refresh, studentId]);

    useEffect(() => {
        if (!studentId) {
            setState({ studentId: null, data: null, loading: false, error: null });
            return undefined;
        }
        // 로그인 직후에는 같은 학생의 이전 세션 캐시를 쓰지 않고 서버의 미확인 알림을 바로 확인한다.
        void refresh({ force: true });

        const handleInvalidation = (event) => {
            if (event.detail?.studentId === studentId) void refresh({ force: true });
        };
        window.addEventListener(STUDENT_HOME_INVALIDATE_EVENT, handleInvalidation);
        return () => {
            window.removeEventListener(STUDENT_HOME_INVALIDATE_EVENT, handleInvalidation);
        };
    }, [refresh, studentId]);

    const loaded = state.studentId === studentId;
    return {
        data: loaded ? state.data : null,
        loading: Boolean(studentId) && (!loaded || state.loading),
        error: loaded ? state.error : null,
        refresh,
        refreshIfStale
    };
};

export default useStudentHomeBootstrap;

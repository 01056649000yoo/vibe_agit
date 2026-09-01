import { useCallback, useEffect, useRef, useState } from 'react';
import { classBoardApi } from '../../classBoardApi';
import { getClassBoardStatusDelay } from './pollPolicy';

export const useWritingStatus = ({ classId, missionId, poll = true }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const runningScopeRef = useRef(null);
  const failuresRef = useRef(0);
  const scopeKey = `${classId || 'none'}:${missionId || 'current'}:${poll ? 'poll' : 'once'}`;
  const currentScopeRef = useRef(scopeKey);
  currentScopeRef.current = scopeKey;

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const load = useCallback(async ({ schedule = poll } = {}) => {
    if (!classId || runningScopeRef.current === scopeKey || !mountedRef.current) return;
    if (document.visibilityState === 'hidden' && schedule) {
      clearTimer();
      timerRef.current = window.setTimeout(() => void load({ schedule: true }), getClassBoardStatusDelay(failuresRef.current));
      return;
    }
    const requestScope = scopeKey;
    runningScopeRef.current = requestScope;
    try {
      const result = await classBoardApi.getWritingStatus(classId, missionId || null);
      if (!mountedRef.current || currentScopeRef.current !== requestScope) return;
      setStatus(result);
      setError('');
      failuresRef.current = 0;
    } catch (loadError) {
      if (!mountedRef.current || currentScopeRef.current !== requestScope) return;
      failuresRef.current += 1;
      setError(loadError.message || '글쓰기 현황을 불러오지 못했습니다.');
    } finally {
      if (runningScopeRef.current === requestScope) runningScopeRef.current = null;
      if (mountedRef.current && currentScopeRef.current === requestScope) {
        setLoading(false);
        if (schedule) {
          clearTimer();
          timerRef.current = window.setTimeout(
            () => void load({ schedule: true }),
            getClassBoardStatusDelay(failuresRef.current)
          );
        }
      }
    }
  }, [classId, clearTimer, missionId, poll, scopeKey]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    void load({ schedule: poll });
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      clearTimer();
      void load({ schedule: poll });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimer();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [clearTimer, load, poll]);

  return { status, loading, error, refresh: () => load({ schedule: false }) };
};

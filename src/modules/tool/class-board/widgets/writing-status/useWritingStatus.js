import { useCallback, useEffect, useRef, useState } from 'react';
import { classBoardApi } from '../../classBoardApi';
import { getClassBoardStatusDelay } from './pollPolicy';

export const useWritingStatus = ({ classId, missionId, sections = null, poll = true }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const runningScopeRef = useRef(null);
  const failuresRef = useRef(0);
  const sectionKey = Array.isArray(sections) ? sections.join(',') : 'default';
  const scopeKey = `${classId || 'none'}:${missionId || 'current'}:${sectionKey}:${poll ? 'poll' : 'once'}`;
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
      const result = await classBoardApi.getWritingStatus(classId, missionId || null, sections);
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
    // sections 는 scopeKey 에 담겨 있어 목록이 바뀌면 이 콜백도 새로 만들어진다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

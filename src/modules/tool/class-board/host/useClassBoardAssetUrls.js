import { useCallback, useEffect, useRef, useState } from 'react';
import { getClassBoardImageUrls } from '../classBoardImageApi';
import {
  CLASS_BOARD_ASSET_TTL_SECONDS,
  getClassBoardAssetErrorMessage,
  getClassBoardAssetRefreshDelayMs,
  getClassBoardAssetRetryDelayMs,
  getMissingClassBoardAssetPaths,
  isClassBoardAssetStale,
  mergeClassBoardAssetUrls,
  rememberClassBoardAssetPaths,
} from './classBoardAssetPolicy';

const EMPTY_URLS = new Map();

/**
 * 역할: 스크린에 올린 사진의 임시 주소를 받아 두고, 만료 전에 스스로 다시 받는다.
 * props:
 *  - paths: 지금 화면에 필요한 사진 경로 목록
 *  - boardId: 다음에 열 때 미리 시작할 수 있도록 이 스크린의 사진 목록을 기억해 둘 열쇠
 *  - seed: 스크린 내용을 받아오는 동안 나란히 시작해 둔 주소 받기(Promise). 있으면 왕복 한 번을 아낀다.
 *
 * 지키는 것
 *  - 실패해도 이전 주소를 버리지 않는다(빈 목록으로 바꾸면 "사진을 올려 주세요"로 잘못 보인다).
 *  - 실패하면 점점 뜸하게 다시 해 보고, 교사가 직접 다시 시도할 손잡이도 준다.
 *  - 하루 종일 켜 두는 화면이라 6시간짜리 주소를 시간과 화면 복귀 두 가지로 다시 확인한다.
 */
export default function useClassBoardAssetUrls(paths, { boardId = null, seed = null } = {}) {
  const [urls, setUrls] = useState(EMPTY_URLS);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const urlsRef = useRef(EMPTY_URLS);
  const signedAtRef = useRef(0);
  const failuresRef = useRef(0);
  const timerRef = useRef(null);
  const mountedRef = useRef(true);
  const runningRef = useRef(false);
  const seedRef = useRef(seed);

  const pathKey = (paths || []).join('\n');

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  // 미리 시작해 둔 결과는 한 번만 쓴다. 다시 받을 때는 그때의 새 주소가 필요하다.
  const takeSeed = useCallback(async () => {
    const pending = seedRef.current;
    seedRef.current = null;
    if (!pending) return EMPTY_URLS;
    try {
      return (await pending) || EMPTY_URLS;
    } catch {
      return EMPTY_URLS;
    }
  }, []);

  const load = useCallback(async () => {
    const wanted = pathKey ? pathKey.split('\n') : [];
    clearTimer();
    if (wanted.length === 0) {
      seedRef.current = null;
      urlsRef.current = EMPTY_URLS;
      signedAtRef.current = 0;
      failuresRef.current = 0;
      setUrls(EMPTY_URLS);
      setError('');
      rememberClassBoardAssetPaths(window.localStorage, boardId, []);
      return;
    }
    if (runningRef.current) return;
    runningRef.current = true;
    setLoading(true);
    try {
      const seeded = mergeClassBoardAssetUrls(urlsRef.current, await takeSeed(), wanted);
      const stillMissing = getMissingClassBoardAssetPaths(seeded, wanted);
      // 미리 받아 둔 것으로 다 채워졌으면 서버에 다시 묻지 않는다.
      const received = stillMissing.length > 0 ? await getClassBoardImageUrls(stillMissing) : EMPTY_URLS;
      if (!mountedRef.current) return;
      const merged = mergeClassBoardAssetUrls(seeded, received, wanted);
      const missing = getMissingClassBoardAssetPaths(merged, wanted);
      urlsRef.current = merged;
      setUrls(merged);
      if (missing.length > 0) {
        // 일부만 못 받았으면 나머지는 그대로 보여 주되, 못 받은 사실은 숨기지 않는다.
        failuresRef.current += 1;
        setError(getClassBoardAssetErrorMessage(missing.length));
        timerRef.current = window.setTimeout(() => void load(), getClassBoardAssetRetryDelayMs(failuresRef.current));
        return;
      }
      signedAtRef.current = Date.now();
      failuresRef.current = 0;
      setError('');
      rememberClassBoardAssetPaths(window.localStorage, boardId, wanted);
      timerRef.current = window.setTimeout(() => void load(), getClassBoardAssetRefreshDelayMs(CLASS_BOARD_ASSET_TTL_SECONDS));
    } catch (loadError) {
      if (!mountedRef.current) return;
      // 이전 주소는 그대로 둔다. 화면에 이미 떠 있는 사진까지 사라지면 안 된다.
      failuresRef.current += 1;
      const missing = getMissingClassBoardAssetPaths(urlsRef.current, wanted);
      const message = getClassBoardAssetErrorMessage(missing.length);
      const detail = String(loadError?.message || '').slice(0, 60);
      setError(detail ? `${message} (${detail})` : message);
      timerRef.current = window.setTimeout(() => void load(), getClassBoardAssetRetryDelayMs(failuresRef.current));
    } finally {
      runningRef.current = false;
      if (mountedRef.current) setLoading(false);
    }
  }, [boardId, clearTimer, pathKey, takeSeed]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, [clearTimer]);

  useEffect(() => {
    void load();
    // 컴퓨터를 덮어 두면 타이머가 늦게 울린다. 화면으로 돌아왔을 때 시각으로도 다시 본다.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      if (!isClassBoardAssetStale(signedAtRef.current, Date.now(), CLASS_BOARD_ASSET_TTL_SECONDS)) return;
      void load();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [load]);

  const retry = useCallback(() => {
    failuresRef.current = 0;
    void load();
  }, [load]);

  return { urls, error, loading, retry };
}

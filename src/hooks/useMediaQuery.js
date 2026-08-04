import { useCallback, useSyncExternalStore } from 'react';

/**
 * 브라우저 폭·방향이 바뀌면 즉시 다시 렌더하는 공용 미디어 쿼리 훅.
 * 태블릿 회전 뒤에도 처음 열었을 때의 레이아웃이 남지 않게 한다.
 */
const useMediaQuery = (query) => {
    const subscribe = useCallback((onChange) => {
        const mediaQuery = window.matchMedia(query);
        mediaQuery.addEventListener('change', onChange);
        return () => mediaQuery.removeEventListener('change', onChange);
    }, [query]);

    const getSnapshot = useCallback(
        () => (typeof window === 'undefined' ? false : window.matchMedia(query).matches),
        [query]
    );

    return useSyncExternalStore(subscribe, getSnapshot, () => false);
};

export default useMediaQuery;

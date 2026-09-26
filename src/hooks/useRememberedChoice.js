import { useEffect, useState } from 'react';

/**
 * 한 화면 안에서 고른 항목을 이 탭이 열려 있는 동안 기억한다(sessionStorage).
 * 설정·학급운영도구는 새로고침하면 늘 첫 항목으로 돌아가 방금 보던 자리를 다시 찾아야 했다(2026-09-26).
 * 저장소가 막힌 환경에서는 조용히 처음 값으로 돌아간다.
 */
export const useRememberedChoice = (storageKey, validIds, initialId) => {
    const [choice, setChoice] = useState(() => {
        if (initialId && validIds.includes(initialId)) return initialId;
        try {
            const saved = window.sessionStorage.getItem(storageKey);
            if (validIds.includes(saved)) return saved;
        } catch {
            // 저장소가 막혀 있으면 첫 항목으로 연다.
        }
        return validIds[0] ?? null;
    });
    useEffect(() => {
        try {
            if (choice) window.sessionStorage.setItem(storageKey, choice);
        } catch {
            // 저장소가 막혀 있어도 지금 화면의 선택은 그대로 둔다.
        }
    }, [storageKey, choice]);
    return [choice, setChoice];
};

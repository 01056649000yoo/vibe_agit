import { useCallback, useMemo, useState } from 'react';

/*
 * 공지를 읽었는지 기억한다.
 *
 * 예전에는 **최신 공지 ID 하나만** 저장했다. 그래서 새 공지가 3건 쌓여도 목록을 한 번 열면
 * 3건 모두 읽은 것이 됐고, 반대로 오래된 공지를 안 읽었어도 표시가 나지 않았다.
 * 여기서는 **읽은 공지 ID를 모두** 기억해 안 읽은 개수를 정확히 센다.
 *
 * ⚠️ 저장 위치는 이 브라우저다 — 교실 PC에서 읽어도 태블릿에서는 다시 새 공지로 뜬다.
 * 기기끼리 맞추려면 서버에 읽음 기록을 두어야 하고 마이그레이션이 필요하다.
 * 지금 문제는 "눈에 안 띈다" 쪽이라 거기부터 고치고, 기기 동기화는 남겨 둔다.
 */

const SEEN_KEY_PREFIX = 'teacher_announcements_seen_v2_';
const POPUP_KEY_PREFIX = 'teacher_announcement_popup_hidden_v1_';
const MAX_REMEMBERED = 100;

const readIds = (key) => {
    try {
        const raw = window.localStorage.getItem(key);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
        // 저장소가 막힌 환경에서는 "다 안 읽음" 으로 두고 동작만 이어 간다.
        return [];
    }
};

const writeIds = (key, ids) => {
    try {
        // 오래된 것부터 버린다. 공지는 20건까지만 읽어 오므로 100개면 충분하다.
        window.localStorage.setItem(key, JSON.stringify(ids.slice(-MAX_REMEMBERED)));
    } catch {
        // 저장 실패는 배지가 다시 뜨는 정도의 문제라 막지 않는다.
    }
};

const useAnnouncementSeen = (userId, announcements = []) => {
    const seenKey = `${SEEN_KEY_PREFIX}${userId || 'guest'}`;
    const popupKey = `${POPUP_KEY_PREFIX}${userId || 'guest'}`;

    const [seenIds, setSeenIds] = useState(() => readIds(seenKey));
    const [hiddenPopupIds, setHiddenPopupIds] = useState(() => readIds(popupKey));

    const unread = useMemo(
        () => announcements.filter((item) => !seenIds.includes(String(item.id))),
        [announcements, seenIds]
    );

    /*
     * 띄울 팝업. 관리자가 `팝업` 으로 표시했고, 아직 안 읽었고, `다시 보지 않기` 를 누르지 않은 것.
     * 여러 건이면 가장 최근 것 하나만 띄운다 — 로그인하자마자 창이 연달아 뜨면 그냥 닫아 버린다.
     */
    const popupAnnouncement = useMemo(
        () => unread.find((item) => item.is_popup && !hiddenPopupIds.includes(String(item.id))) || null,
        [unread, hiddenPopupIds]
    );

    const markSeen = useCallback((ids) => {
        const incoming = (Array.isArray(ids) ? ids : [ids]).filter(Boolean).map(String);
        if (incoming.length === 0) return;
        setSeenIds((current) => {
            const next = [...new Set([...current, ...incoming])];
            writeIds(seenKey, next);
            return next;
        });
    }, [seenKey]);

    const markAllSeen = useCallback(() => {
        markSeen(announcements.map((item) => item.id));
    }, [announcements, markSeen]);

    const hidePopup = useCallback((id) => {
        if (!id) return;
        setHiddenPopupIds((current) => {
            const next = [...new Set([...current, String(id)])];
            writeIds(popupKey, next);
            return next;
        });
    }, [popupKey]);

    return { unread, unreadCount: unread.length, popupAnnouncement, markSeen, markAllSeen, hidePopup };
};

export default useAnnouncementSeen;

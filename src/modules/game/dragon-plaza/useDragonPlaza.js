import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildSeats, markPostSeen, pickNewPosts, readSeenPosts } from './plazaModel';

/** 광장 화면 상태. 한 번 읽고, 일부가 실패해도(새 글·방문자) 교실은 그대로 보여 준다. */
export default function useDragonPlaza(api, studentId) {
    const [state, setState] = useState({ status: 'loading', classmates: [], me: null, feed: [], visitors: [], message: '' });
    const [seen, setSeen] = useState(() => readSeenPosts(studentId));

    const load = useCallback(async () => {
        setState((current) => ({ ...current, status: 'loading', message: '' }));
        try {
            const [classmates, me] = await Promise.all([api.loadClassmates(), api.loadMe(studentId)]);
            setState({ status: 'ready', classmates, me, feed: [], visitors: [], message: '' });
            // 새 글·방문자는 교실을 먼저 보여 준 뒤 읽는다(실패해도 교실은 유지).
            const [feed, visitors] = await Promise.all([
                api.loadFeed().catch(() => []),
                api.loadVisitors().catch(() => [])
            ]);
            setState((current) => ({ ...current, feed, visitors }));
        } catch (error) {
            setState((current) => ({ ...current, status: 'error', message: error?.message || '교실을 불러오지 못했어요.' }));
        }
    }, [api, studentId]);

    useEffect(() => {
        const timer = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    const seats = useMemo(() => buildSeats(state.classmates, state.me), [state.classmates, state.me]);
    const newPosts = useMemo(() => pickNewPosts(state.feed, seen, studentId), [state.feed, seen, studentId]);
    const markSeen = useCallback((postId) => setSeen(markPostSeen(studentId, postId)), [studentId]);

    return { ...state, seats, newPosts, markSeen, reload: load };
}

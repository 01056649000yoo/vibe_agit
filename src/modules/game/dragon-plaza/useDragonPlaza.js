import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildSeats, markPostSeen, pickNewPosts, readSeenPosts } from './plazaModel';

/** 광장 화면 상태. 한 번 읽고, 일부가 실패해도(새 글·방문자) 교실은 그대로 보여 준다. */
export default function useDragonPlaza(api, studentId) {
    const [state, setState] = useState({ status: 'loading', classmates: [], me: null, feed: [], visitors: [], conquests: [], message: '' });
    const [seen, setSeen] = useState(() => readSeenPosts(studentId));

    const requestRef = useRef(0); // 새로고침을 연달아 눌렀을 때 늦게 도착한 옛 응답이 최신 결과를 덮지 않게 한다

    const load = useCallback(async () => {
        requestRef.current += 1;
        const mine = requestRef.current;
        const latest = () => mine === requestRef.current;
        setState((current) => ({ ...current, status: 'loading', message: '' }));
        try {
            const [classmates, me] = await Promise.all([api.loadClassmates(), api.loadMe(studentId)]);
            if (!latest()) return;
            setState({ status: 'ready', classmates, me, feed: [], visitors: [], conquests: [], message: '' });
            // 새 글·방문자는 교실을 먼저 보여 준 뒤 읽는다(실패해도 교실은 유지).
            const [feed, visitors, conquests] = await Promise.all([
                api.loadFeed().catch(() => []),
                api.loadVisitors().catch(() => []),
                (api.loadConquests ? api.loadConquests() : Promise.resolve([])).catch(() => [])
            ]);
            if (!latest()) return;
            setState((current) => ({ ...current, feed, visitors, conquests }));
        } catch (error) {
            if (!latest()) return;
            setState((current) => ({ ...current, status: 'error', message: error?.message || '교실을 불러오지 못했어요.' }));
        }
    }, [api, studentId]);

    useEffect(() => {
        const timer = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    const seats = useMemo(() => buildSeats(state.classmates, state.me), [state.classmates, state.me]);
    // 학생 id → 정복한 덱 수(배지용). 덱 번호는 친구 아지트 창의 카드가 따로 읽는다.
    const conquestCounts = useMemo(() => new Map((state.conquests || []).map((row) => [row.student_id, Array.isArray(row.decks) ? row.decks.length : 0])), [state.conquests]);
    const newPosts = useMemo(() => pickNewPosts(state.feed, seen, studentId), [state.feed, seen, studentId]);
    // 저장이 막힌 기기에서도 화면 안에서는 앞서 읽은 기록을 잃지 않게 지금 상태에 합친다.
    const markSeen = useCallback((postIds) => setSeen((current) => ({ ...current, ...markPostSeen(studentId, postIds) })), [studentId]);

    return { ...state, seats, conquestCounts, newPosts, markSeen, reload: load };
}

import { useEffect, useRef, useState } from 'react';
import ModalPortal from '../../components/common/ModalPortal';
import { notificationApi } from './notificationApi';
import {
    PRIORITY_WRITING_BANNER_VISIBLE_MS,
    PRIORITY_WRITING_INITIAL_CURSOR_ID,
    getPriorityWritingInitialDelay,
    getPriorityWritingNextDelay
} from './priorityWritingPollPolicy';
import './PriorityWritingNotificationBanner.css';

const PRESENTATIONS = Object.freeze({
    'writing.rewrite_requested': Object.freeze({
        tone: 'rewrite',
        title: '글이 되돌아왔어요',
        message: '선생님의 피드백을 확인해 보세요.'
    }),
    'writing.approved': Object.freeze({
        tone: 'approved',
        title: '글이 승인되었어요',
        message: '선생님이 글을 확인했어요.'
    })
});

const PriorityWritingNotificationBanner = ({ studentId, initialCursorCreatedAt }) => {
    // App이 bootstrap 완료 뒤 학생 ID를 key로 이 컴포넌트를 만들기 때문에 최초 서버 시각을
    // 세션 기준선으로 고정할 수 있다. 이후 홈 재검증 시각이 바뀌어도 폴링 커서를 덮지 않는다.
    const initialCursorRef = useRef({
        createdAt: initialCursorCreatedAt,
        id: PRIORITY_WRITING_INITIAL_CURSOR_ID
    });
    const [queue, setQueue] = useState([]);
    const [active, setActive] = useState(null);

    useEffect(() => {
        if (!studentId || !initialCursorRef.current.createdAt) return undefined;

        let stopped = false;
        let timerId = null;
        let inFlight = false;
        let failureCount = 0;
        let cursor = { ...initialCursorRef.current };

        const clearTimer = () => {
            if (timerId !== null) window.clearTimeout(timerId);
            timerId = null;
        };

        const schedule = (delay) => {
            if (stopped || document.visibilityState !== 'visible') return;
            clearTimer();
            timerId = window.setTimeout(runPoll, delay);
        };

        const runPoll = async () => {
            timerId = null;
            if (stopped || inFlight || document.visibilityState !== 'visible') return;
            inFlight = true;
            const startedAt = Date.now();
            try {
                const result = await notificationApi.pollPriorityWriting({
                    afterCreatedAt: cursor.createdAt,
                    afterId: cursor.id
                });
                const nextCursor = result?.cursor;
                if (nextCursor?.created_at && nextCursor?.id) {
                    cursor = { createdAt: nextCursor.created_at, id: nextCursor.id };
                }

                const additions = (Array.isArray(result?.items) ? result.items : []).filter((item) => {
                    return item?.id && PRESENTATIONS[item.event_type];
                });
                if (additions.length > 0 && !stopped) {
                    setQueue((current) => [...current, ...additions]);
                }
                failureCount = 0;
            } catch {
                failureCount += 1;
            } finally {
                inFlight = false;
                if (!stopped && document.visibilityState === 'visible') {
                    schedule(getPriorityWritingNextDelay({
                        failureCount,
                        elapsedMs: Date.now() - startedAt
                    }));
                }
            }
        };

        const pollOnReturn = () => {
            if (document.visibilityState !== 'visible') {
                clearTimer();
                return;
            }
            schedule(0);
        };

        schedule(getPriorityWritingInitialDelay());
        window.addEventListener('focus', pollOnReturn);
        window.addEventListener('online', pollOnReturn);
        document.addEventListener('visibilitychange', pollOnReturn);
        return () => {
            stopped = true;
            clearTimer();
            window.removeEventListener('focus', pollOnReturn);
            window.removeEventListener('online', pollOnReturn);
            document.removeEventListener('visibilitychange', pollOnReturn);
        };
    }, [studentId]);

    useEffect(() => {
        if (active || queue.length === 0) return;
        setActive(queue[0]);
        setQueue((current) => current.slice(1));
    }, [active, queue]);

    useEffect(() => {
        if (!active) return undefined;
        const timerId = window.setTimeout(() => setActive(null), PRIORITY_WRITING_BANNER_VISIBLE_MS);
        return () => window.clearTimeout(timerId);
    }, [active]);

    const presentation = active ? PRESENTATIONS[active.event_type] : null;
    if (!presentation) return null;

    return (
        <ModalPortal>
            <div className="priority-writing-notification" aria-live="polite" aria-atomic="true">
                <button
                    type="button"
                    className={`priority-writing-notification__banner priority-writing-notification__banner--${presentation.tone}`}
                    aria-label={`${presentation.title}. ${presentation.message} 눌러서 닫기`}
                    onClick={() => setActive(null)}
                >
                    <strong>{presentation.title}</strong>
                    <span>{presentation.message}</span>
                </button>
            </div>
        </ModalPortal>
    );
};

export default PriorityWritingNotificationBanner;

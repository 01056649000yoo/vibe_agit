import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import ModalPortal from '../../components/common/ModalPortal';
import ModalCloseButton from '../../components/common/ModalCloseButton';
import { notificationApi } from './notificationApi';
import { resolveActivityNotification } from './registry';
import './ActivityNotificationPanel.css';

const EMPTY_SUMMARY = Object.freeze({ version: 1, unread_count: 0, latest: null });

const NotificationDetailModal = ({ initialEvent, onClose, onRead, onAction }) => {
    const [items, setItems] = useState(initialEvent ? [initialEvent] : []);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        const load = async () => {
            try {
                const result = await notificationApi.listUnread({ limit: 50 });
                if (!active) return;
                setItems(result.items || []);
                setIndex(0);
            } catch (loadError) {
                if (active) setError('알림 목록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
                console.error('활동 알림 목록 로드 실패:', loadError.message);
            } finally {
                if (active) setLoading(false);
            }
        };
        void load();
        return () => { active = false; };
    }, []);

    useEffect(() => {
        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const current = items.at(index) || null;
    const presentation = useMemo(() => resolveActivityNotification(current), [current]);

    const handleConfirm = async () => {
        if (!current || saving) return;
        setSaving(true);
        setError('');
        try {
            await notificationApi.markRead([current.id]);
            const remaining = items.filter((item) => item.id !== current.id);
            const nextIndex = Math.min(index, Math.max(0, remaining.length - 1));
            setItems(remaining);
            setIndex(nextIndex);
            onRead(current, remaining[0] || null);
            if (presentation.action !== 'confirm') {
                onAction(current, presentation);
                onClose();
            } else if (remaining.length === 0) {
                onClose();
            }
        } catch (saveError) {
            console.error('활동 알림 읽음 처리 실패:', saveError.message);
            setError('확인 상태를 저장하지 못했어요. 다시 눌러 주세요.');
        } finally {
            setSaving(false);
        }
    };

    return (
        <ModalPortal>
            <div className="activity-notification-modal__backdrop" role="presentation" onMouseDown={(event) => {
                if (event.target === event.currentTarget) onClose();
            }}>
                <motion.section
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="activity-notification-title"
                    className={`activity-notification-modal activity-notification-modal--${presentation.tone}`}
                    initial={{ opacity: 0, y: 18, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                >
                    <header className="activity-notification-modal__header">
                        <span>활동 알림</span>
                        <ModalCloseButton onClick={onClose} label="활동 알림 닫기" />
                    </header>

                    {loading && items.length === 0 ? (
                        <div className="activity-notification-modal__state">알림을 확인하고 있어요…</div>
                    ) : current ? (
                        <>
                            <div className="activity-notification-modal__icon" aria-hidden="true">{presentation.icon}</div>
                            <h2 id="activity-notification-title">{presentation.title}</h2>
                            <p>{presentation.message}</p>
                            <time dateTime={current.created_at}>
                                {new Date(current.created_at).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' })}
                            </time>

                            {items.length > 1 && (
                                <div className="activity-notification-modal__pager" aria-label="알림 이동">
                                    <button type="button" onClick={() => setIndex((value) => Math.max(0, value - 1))} disabled={index === 0}>이전</button>
                                    <strong>{index + 1} / {items.length}</strong>
                                    <button type="button" onClick={() => setIndex((value) => Math.min(items.length - 1, value + 1))} disabled={index >= items.length - 1}>다음</button>
                                </div>
                            )}

                            {error && <p className="activity-notification-modal__error" role="alert">{error}</p>}
                            <button type="button" className="activity-notification-modal__primary" onClick={handleConfirm} disabled={saving} autoFocus>
                                {saving ? '저장하는 중…' : presentation.actionLabel}
                            </button>
                            <small>이 버튼을 누르면 확인한 알림으로 처리돼요.</small>
                        </>
                    ) : (
                        <div className="activity-notification-modal__state">확인할 알림이 없어요.</div>
                    )}
                </motion.section>
            </div>
        </ModalPortal>
    );
};

const ActivityNotificationPanel = ({ summary = EMPTY_SUMMARY, loading = false, onSummaryChange, onNavigate, onOpenPost }) => {
    const [open, setOpen] = useState(false);
    const latest = summary?.latest || null;
    const unreadCount = Number(summary?.unread_count || 0);
    const presentation = useMemo(() => resolveActivityNotification(latest), [latest]);

    const handleRead = (_event, nextLatest) => {
        onSummaryChange({
            version: 1,
            unread_count: Math.max(0, unreadCount - 1),
            latest: nextLatest
        });
    };

    const handleAction = (event, eventPresentation) => {
        if (eventPresentation.action === 'custom' && typeof eventPresentation.handleAction === 'function') {
            eventPresentation.handleAction({ event, onNavigate, onOpenPost });
        } else if (eventPresentation.action === 'rewrite') {
            onNavigate('writing', {
                missionId: event.payload?.mission_id,
                postId: event.payload?.post_id || event.entity_id,
                mode: 'edit'
            });
        } else if (eventPresentation.action === 'post') {
            onOpenPost({
                id: event.payload?.post_id || event.entity_id,
                title: event.payload?.post_title || event.payload?.mission_title || '내 글'
            });
        }
    };

    return (
        <motion.section
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            aria-label="활동 알림"
            className="activity-notification-panel"
        >
            <header className="activity-notification-panel__header">
                <h2>활동 알림</h2>
                {!loading && unreadCount > 0 && <strong>{unreadCount}개</strong>}
            </header>
            <button
                type="button"
                className={`activity-notification-panel__body activity-notification-panel__body--${latest ? presentation.tone : 'empty'}`}
                onClick={() => unreadCount > 0 && setOpen(true)}
                disabled={loading || unreadCount === 0}
            >
                {loading ? (
                    <span className="activity-notification-panel__empty">알림을 확인하고 있어요…</span>
                ) : latest ? (
                    <>
                        <span className="activity-notification-panel__icon" aria-hidden="true">{presentation.icon}</span>
                        <span className="activity-notification-panel__copy">
                            <strong>{presentation.title}</strong>
                            <small>{presentation.message}</small>
                        </span>
                        <span className="activity-notification-panel__action">보기</span>
                    </>
                ) : unreadCount > 0 ? (
                    <>
                        <span className="activity-notification-panel__icon" aria-hidden="true">🔔</span>
                        <span className="activity-notification-panel__copy">
                            <strong>확인하지 않은 알림이 {unreadCount}개 있어요</strong>
                            <small>눌러서 다음 알림을 확인해 주세요.</small>
                        </span>
                        <span className="activity-notification-panel__action">보기</span>
                    </>
                ) : (
                    <span className="activity-notification-panel__empty">표시할 활동 알림이 없어요.</span>
                )}
            </button>

            {open && (
                <NotificationDetailModal
                    initialEvent={latest}
                    onClose={() => setOpen(false)}
                    onRead={handleRead}
                    onAction={handleAction}
                />
            )}
        </motion.section>
    );
};

export default ActivityNotificationPanel;

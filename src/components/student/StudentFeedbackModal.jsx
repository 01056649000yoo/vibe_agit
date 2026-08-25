import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';
import { resolveActivityNotification } from '../../modules/notifications/registry';

/**
 * 역할: 학생 - 내 글 소식(알림) 모달 🔔
 * 친구들의 반응과 친구·선생님 댓글을 한눈에 확인하고 바로 이동합니다.
 *
 * 2026-08-17부터 알림 원장(student_notification_events)을 읽는다. 예전에는 읽음 상태를
 * last_feedback_check 시각 하나로만 갈라서 "탭을 모두 방문하면 전부 읽음"으로 처리했는데,
 * 전체 탭에서 소식을 다 보고 닫은 학생에게는 배지가 그대로 남아 "눌러도 안 사라진다"가 됐다.
 * 이제 항목마다 `확인`을 눌러 하나씩 정리하고, 한 번에 끝내려면 `모두 확인`을 쓴다.
 */
// eventType 이 null 인 탭은 거르지 않고 전부 보여 준다.
const TABS = Object.freeze([
    { id: 0, label: '전체', emoji: '🌈', eventType: null },
    { id: 1, label: '친구들 반응', emoji: '❤️', eventType: 'feedback.reaction_received' },
    { id: 2, label: '댓글', emoji: '💬', eventType: 'feedback.comment_received' }
]);

const StudentFeedbackModal = ({
    isOpen,
    onClose,
    feedbacks,
    loading,
    onNavigate,
    initialTab = 0,
    onMarkRead,
    onMarkAllRead
}) => {
    const [activeTab, setActiveTab] = React.useState(initialTab);
    const [pendingId, setPendingId] = React.useState(null);
    const [bulkStatus, setBulkStatus] = React.useState('idle');
    const [error, setError] = React.useState('');

    React.useEffect(() => {
        if (!isOpen) return;
        setActiveTab(initialTab);
        setBulkStatus('idle');
        setPendingId(null);
        setError('');
    }, [initialTab, isOpen]);

    const filteredFeedbacks = React.useMemo(() => {
        const wanted = TABS.find((tab) => tab.id === activeTab)?.eventType || null;
        if (!wanted) return feedbacks;
        return feedbacks.filter((item) => item.event_type === wanted);
    }, [activeTab, feedbacks]);

    const handleConfirm = async (event, item) => {
        // 카드 전체가 글로 이동하는 버튼이라 확인 클릭이 이동으로 새지 않게 막는다.
        event.stopPropagation();
        if (pendingId) return;
        setPendingId(item.id);
        setError('');
        const saved = await onMarkRead(item.id);
        setPendingId(null);
        if (!saved) setError('확인 처리를 저장하지 못했어요. 다시 눌러 주세요.');
    };

    const handleConfirmAll = async () => {
        if (bulkStatus === 'saving') return;
        setBulkStatus('saving');
        setError('');
        const saved = await onMarkAllRead();
        setBulkStatus(saved ? 'idle' : 'idle');
        if (!saved) setError('모두 확인을 저장하지 못했어요. 다시 눌러 주세요.');
    };

    const handleGoToPost = (item) => {
        const postId = item.payload?.post_id || item.entity_id;
        if (!postId) return;
        onNavigate('friends_hideout', { initialPostId: postId });
        onClose();
    };

    if (!isOpen) return null;

    return (
        <ModalPortal>
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(8px)',
                    zIndex: 3000, display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: '20px'
                }}
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20, opacity: 0 }}
                    animate={{ scale: 1, y: 0, opacity: 1 }}
                    exit={{ scale: 0.9, y: 20, opacity: 0 }}
                    style={{
                        background: 'white', borderRadius: '32px', width: '100%', maxWidth: '500px',
                        maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    <div style={{ padding: '24px 32px 10px 32px', borderBottom: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h2 style={{ margin: 0, fontSize: 'var(--ui-text-2xl)', fontWeight: '900', color: '#2C3E50' }}>🔔 내 글 소식</h2>
                        <ModalCloseButton onClick={onClose} label="내 글 소식 닫기" />
                    </div>

                    {/* 탭 메뉴 */}
                    <div style={{ display: 'flex', padding: '0 24px', gap: '10px', marginBottom: '10px' }}>
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '15px',
                                    border: 'none',
                                    background: activeTab === tab.id ? '#E3F2FD' : '#F8F9FA',
                                    color: activeTab === tab.id ? '#1976D2' : '#95A5A6',
                                    fontWeight: '900',
                                    cursor: 'pointer',
                                    fontSize: 'var(--ui-text-sm)',
                                    transition: 'all 0.2s',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <span>{tab.emoji}</span> {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* 하루에 스무 건까지 올 수 있어 한 건씩만 처리하게 두면 지금보다 나빠진다. */}
                    {!loading && feedbacks.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 28px 8px', gap: '12px' }}>
                            <span style={{ color: '#607D8B', fontSize: 'var(--ui-text-sm)', fontWeight: 800 }}>
                                확인하지 않은 소식 {feedbacks.length}개
                            </span>
                            <Button size="sm" variant="ghost" onClick={handleConfirmAll} disabled={bulkStatus === 'saving'}>
                                {bulkStatus === 'saving' ? '정리하는 중…' : '모두 확인'}
                            </Button>
                        </div>
                    )}

                    {error && (
                        <div role="alert" style={{ padding: '0 28px 6px', color: '#C62828', fontSize: 'var(--ui-text-sm)', fontWeight: 800 }}>
                            {error}
                        </div>
                    )}

                    <div style={{ flex: 1, overflowY: 'auto', maxHeight: '60vh', padding: '16px 24px 24px 24px' }}>
                        {loading ? (
                            <p style={{ textAlign: 'center', color: '#95A5A6', padding: '40px' }}>소식을 불러오는 중... ✨</p>
                        ) : filteredFeedbacks.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🍃</div>
                                <p style={{ color: '#95A5A6', fontWeight: 'bold' }}>아직 새로운 소식이 없어요.</p>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {filteredFeedbacks.map((item) => {
                                    const presentation = resolveActivityNotification(item);
                                    const isPending = pendingId === item.id;

                                    return (
                                        <div
                                            key={item.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={() => handleGoToPost(item)}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    handleGoToPost(item);
                                                }
                                            }}
                                            style={{
                                                padding: '16px',
                                                background: '#F8F9FA',
                                                borderRadius: '20px',
                                                border: '1px solid #F1F1F1',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                position: 'relative'
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = '#F0F7FF';
                                                e.currentTarget.style.borderColor = '#D0E1F9';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = '#F8F9FA';
                                                e.currentTarget.style.borderColor = '#F1F1F1';
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                                                <span style={{ fontSize: '1.2rem', lineHeight: 1.4 }} aria-hidden="true">
                                                    {presentation.icon}
                                                </span>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 'bold', color: '#5D4037', fontSize: 'var(--ui-text-md)', marginBottom: '4px' }}>
                                                        {presentation.title}
                                                    </div>
                                                    <div style={{ fontSize: 'var(--ui-text-sm)', color: '#795548', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                                                        {presentation.message}
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={(event) => handleConfirm(event, item)}
                                                    disabled={isPending}
                                                    aria-label="이 소식 확인"
                                                    style={{
                                                        flexShrink: 0,
                                                        padding: '6px 12px',
                                                        borderRadius: '12px',
                                                        border: '1px solid #C8E6C9',
                                                        background: isPending ? '#ECEFF1' : '#E8F5E9',
                                                        color: isPending ? '#90A4AE' : '#2E7D32',
                                                        fontWeight: 900,
                                                        fontSize: 'var(--ui-text-sm)',
                                                        cursor: isPending ? 'default' : 'pointer'
                                                    }}
                                                >
                                                    {isPending ? '…' : '✓ 확인'}
                                                </button>
                                            </div>

                                            <div style={{ fontSize: 'var(--ui-text-sm)', color: '#BDBDBD', marginTop: '10px', textAlign: 'right' }}>
                                                {new Date(item.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
        </ModalPortal>
    );
};

export default StudentFeedbackModal;

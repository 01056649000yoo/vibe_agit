import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import ModalPortal from '../common/ModalPortal';
import ModalCloseButton from '../common/ModalCloseButton';

/**
 * 역할: 학생 - 내 글 소식(알림) 모달 🔔
 * 친구들의 반응과 친구·선생님 댓글을 한눈에 확인하고 바로 이동합니다.
 */
const StudentFeedbackModal = ({ isOpen, onClose, feedbacks, loading, onNavigate, initialTab = 0, onMarkRead }) => {
    const [activeTab, setActiveTab] = React.useState(initialTab);
    const [visitedTabs, setVisitedTabs] = React.useState(() => new Set());
    const [readStatus, setReadStatus] = React.useState('idle');
    const readRequestRef = React.useRef(0);

    const requiredTabs = React.useMemo(() => {
        const tabs = [];
        if (feedbacks.some(item => item.type === 'reaction')) tabs.push(1);
        if (feedbacks.some(item => item.type === 'comment')) tabs.push(2);
        return tabs;
    }, [feedbacks]);

    // 창을 새로 열 때만 탭 확인 상태를 초기화한다. 전체 탭은 개별 탭 확인으로 세지 않는다.
    React.useEffect(() => {
        readRequestRef.current += 1;
        if (!isOpen) return;
        setActiveTab(initialTab);
        setVisitedTabs(new Set(initialTab === 1 || initialTab === 2 ? [initialTab] : []));
        setReadStatus('idle');
    }, [initialTab, isOpen]);

    React.useEffect(() => {
        if (!isOpen || loading || readStatus !== 'idle' || requiredTabs.length === 0) return undefined;
        if (!requiredTabs.every(tabId => visitedTabs.has(tabId))) return undefined;

        const requestId = ++readRequestRef.current;
        setReadStatus('saving');
        const markRead = async () => {
            const saved = await onMarkRead();
            if (readRequestRef.current === requestId) setReadStatus(saved ? 'done' : 'error');
        };
        markRead();
        return undefined;
    }, [isOpen, loading, onMarkRead, readStatus, requiredTabs, visitedTabs]);

    const handleTabChange = (tabId) => {
        setActiveTab(tabId);
        if (tabId === 1 || tabId === 2) {
            setVisitedTabs(current => {
                if (current.has(tabId)) return current;
                const next = new Set(current);
                next.add(tabId);
                return next;
            });
        }
    };

    const handleNotificationClick = (item) => {
        // 소셜 알림(리액션/댓글) 클릭 시 해당 글 보기
        if (item.type === 'reaction' || item.type === 'comment') {
            onNavigate('friends_hideout', { initialPostId: item.post_id || item.student_posts?.id });
            onClose();
        }
    };

    // 탭별 필터링 데이터. 댓글 탭에는 친구 댓글과 선생님 댓글이 함께 들어간다.
    const filteredFeedbacks = feedbacks.filter(f => {
        if (activeTab === 1) return f.type === 'reaction';
        if (activeTab === 2) return f.type === 'comment';
        return true;
    });

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
                        <h2 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#2C3E50' }}>🔔 내 글 소식</h2>
                        <ModalCloseButton onClick={onClose} label="내 글 소식 닫기" />
                    </div>

                    {/* 탭 메뉴 */}
                    <div style={{ display: 'flex', padding: '0 24px', gap: '10px', marginBottom: '10px' }}>
                        {[
                            { id: 0, label: '전체', emoji: '🌈' },
                            { id: 1, label: '친구들 반응', emoji: '❤️' },
                            { id: 2, label: '댓글', emoji: '💬' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '15px',
                                    border: 'none',
                                    background: activeTab === tab.id ? '#E3F2FD' : '#F8F9FA',
                                    color: activeTab === tab.id ? '#1976D2' : '#95A5A6',
                                    fontWeight: '900',
                                    cursor: 'pointer',
                                    fontSize: '0.85rem',
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

                    {readStatus !== 'idle' && (
                        <div aria-live="polite" style={{ minHeight: '24px', padding: '0 28px 6px', color: readStatus === 'error' ? '#C62828' : '#607D8B', fontSize: '0.75rem', fontWeight: 800 }}>
                            {readStatus === 'saving' && '확인한 소식을 정리하고 있어요…'}
                            {readStatus === 'done' && '모두 확인했어요. 창을 닫으면 목록이 정리돼요.'}
                            {readStatus === 'error' && (
                                <Button size="sm" variant="ghost" onClick={() => setReadStatus('idle')}>읽음 처리 다시 시도</Button>
                            )}
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
                                {filteredFeedbacks.map((f, idx) => {
                                    const bgColor = '#F8F9FA';
                                    const borderColor = '#F1F1F1';
                                    const hoverBg = '#F0F7FF';
                                    const hoverBorder = '#D0E1F9';

                                    return (
                                        <div
                                            key={f.id ? `feedback-${f.id}` : `idx-${idx}`}
                                            style={{
                                                padding: '16px',
                                                background: bgColor,
                                                borderRadius: '20px',
                                                border: `1px solid ${borderColor}`,
                                                cursor: 'pointer',
                                                transition: 'all 0.2s',
                                                position: 'relative'
                                            }}
                                            onClick={() => handleNotificationClick(f)}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = hoverBg;
                                                e.currentTarget.style.borderColor = hoverBorder;
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = bgColor;
                                                e.currentTarget.style.borderColor = borderColor;
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                                                <span style={{ fontSize: '1.2rem' }}>
                                                    {f.type === 'reaction' ? (
                                                        f.reaction_type === 'heart' ? '❤️' :
                                                            f.reaction_type === 'laugh' ? '😂' :
                                                                f.reaction_type === 'wow' ? '👏' :
                                                                    f.reaction_type === 'bulb' ? '💡' : '✨'
                                                    ) : '💬'}
                                                </span>
                                                <span style={{ fontWeight: 'bold', color: '#5D4037', fontSize: '0.95rem' }}>
                                                    {f.type === 'reaction' ? `${f.students?.name} 친구가 리액션을 남겼어요!` :
                                                        f.type === 'comment' ? (
                                                            f.teacher_id
                                                                ? '🍎 선생님이 댓글을 남겼어요!'
                                                                : `${f.students?.name} 친구가 댓글을 남겼어요!`
                                                        ) :
                                                            '새로운 소식이 도착했어요!'}
                                                </span>
                                            </div>

                                            <div style={{ fontSize: '0.85rem', color: '#9E9E9E', marginBottom: '4px' }}>
                                                글 제목: "{f.student_posts?.title || f.title || '제목 없음'}"
                                            </div>

                                            <div style={{
                                                fontSize: '0.9rem',
                                                color: '#795548',
                                                background: 'white',
                                                padding: '8px 12px', borderRadius: '12px', marginTop: '6px',
                                                border: '1px solid rgba(0,0,0,0.05)',
                                                whiteSpace: 'pre-wrap',
                                                lineHeight: '1.6'
                                            }}>
                                                {f.content}
                                            </div>

                                            <div style={{ fontSize: '0.75rem', color: '#BDBDBD', marginTop: '10px', textAlign: 'right' }}>
                                                {new Date(f.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
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

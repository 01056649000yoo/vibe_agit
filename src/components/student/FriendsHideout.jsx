import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { useFriendsHideout } from '../../hooks/useFriendsHideout';
import PostDetailModal from './PostDetailModal';

// 상수 및 아이콘 설정
const REACTION_ICONS = [
    { type: 'heart', label: '좋아요', emoji: '❤️' },
    { type: 'laugh', label: '재밌어요', emoji: '😂' },
    { type: 'wow', label: '멋져요', emoji: '👏' },
    { type: 'bulb', label: '배워요', emoji: '💡' },
    { type: 'star', label: '최고야', emoji: '✨' }
];

const ACCESSORIES = [
    { id: 'crown', emoji: '👑', pos: { top: '-25%', left: '25%', fontSize: '2.5rem' } },
    { id: 'sunglasses', emoji: '🕶️', pos: { top: '15%', left: '15%', fontSize: '2rem' } },
    { id: 'flame', emoji: '🔥', pos: { top: '0', left: '0', fontSize: '6rem', zIndex: -1, filter: 'blur(2px) opacity(0.7)' } },
    { id: 'star', emoji: '⭐', pos: { top: '-10%', left: '60%', fontSize: '1.5rem' } },
];

/**
 * 역할: 학생 - 친구들의 글을 읽고 반응/댓글 남기기 (친구 글 아지트) 🌈
 */
const FriendsHideout = ({ studentSession, onBack, params }) => {
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    const {
        missions,
        selectedMission,
        posts,
        loading,
        viewingPost,
        setViewingPost,
        handleMissionChange
    } = useFriendsHideout(studentSession, params);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleCloseModal = () => {
        if (params?.initialPostId) {
            onBack();
        } else {
            setViewingPost(null);
        }
    };

    return (
        <Card style={{ maxWidth: '900px', padding: '32px', background: '#F8F9FA', border: 'none' }}>
            {/* 상단 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 돌아가기</Button>
                    <h2 style={{ margin: 0, color: '#2C3E50', fontWeight: '900', fontSize: '1.8rem' }}>👀 친구 글 아지트</h2>
                </div>
            </div>

            {/* 미션 선택 탭 */}
            <div style={{
                display: 'flex',
                gap: '12px',
                marginBottom: '24px',
                overflowX: 'auto',
                paddingBottom: '8px',
                scrollbarWidth: 'none'
            }}>
                {missions.map(m => (
                    <button
                        key={m.id}
                        onClick={() => handleMissionChange(m)}
                        style={{
                            padding: '10px 20px',
                            borderRadius: '16px',
                            border: 'none',
                            background: selectedMission?.id === m.id ? 'var(--primary-color)' : 'white',
                            color: selectedMission?.id === m.id ? 'white' : '#607D8B',
                            fontWeight: 'bold',
                            whiteSpace: 'nowrap',
                            cursor: 'pointer',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.05)',
                            transition: 'all 0.2s'
                        }}
                    >
                        {m.title}
                    </button>
                ))}
            </div>

            {/* 글 목록 그리드 */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                gap: '20px'
            }}>
                {loading ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px' }}>친구들의 글을 불러오는 중... ✨</div>
                ) : posts.length === 0 ? (
                    <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', background: 'white', borderRadius: '24px' }}>
                        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🌵</div>
                        <p style={{ color: '#95A5A6', fontWeight: 'bold' }}>아직 제출된 친구의 글이 없어요.</p>
                    </div>
                ) : (
                    posts.map(post => (
                        <motion.div
                            key={post.id}
                            whileHover={{ y: -5 }}
                            onClick={() => setViewingPost(post)}
                            style={{
                                background: 'white',
                                padding: '24px',
                                borderRadius: '24px',
                                boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                cursor: 'pointer',
                                border: '1px solid #E9ECEF'
                            }}
                        >
                            <div style={{ marginBottom: '12px' }}>
                                <span style={{
                                    fontSize: '0.8rem',
                                    padding: '4px 8px',
                                    background: '#E1F5FE',
                                    color: '#0288D1',
                                    borderRadius: '8px',
                                    fontWeight: 'bold'
                                }}>
                                    {post.students?.name}
                                </span>
                            </div>
                            <h4 style={{ margin: '0 0 12px 0', fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900' }}>{post.title}</h4>
                            <p style={{
                                fontSize: '0.9rem',
                                color: '#7F8C8D',
                                margin: 0,
                                lineHeight: '1.6',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                display: '-webkit-box',
                                WebkitLineClamp: 3,
                                WebkitBoxOrient: 'vertical'
                            }}>
                                {post.content}
                            </p>
                        </motion.div>
                    ))
                )}
            </div>

            {/* 상세 보기 모달 */}
            <AnimatePresence>
                {viewingPost && (
                    <PostDetailModal
                        post={viewingPost}
                        mission={selectedMission || viewingPost?.writing_missions}
                        studentSession={studentSession}
                        onClose={handleCloseModal}
                        reactionIcons={REACTION_ICONS}
                        isMobile={isMobile}
                        ACCESSORIES={ACCESSORIES}
                    />
                )}
            </AnimatePresence>
        </Card>
    );
};

export default FriendsHideout;

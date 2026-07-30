import React, { useState, useEffect, useRef, useCallback, lazy, memo, Suspense } from 'react';
import Card from '../../../components/common/Card';
import Button from '../../../components/common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { useFriendsHideout } from './useFriendsHideout';
import PostDetailModal from '../../../components/student/PostDetailModal';
import FriendHideoutPreviewCard from './profile/FriendHideoutPreviewCard';

const FriendProfileShell = lazy(() => import('./profile/FriendProfileShell'));

// 상수 및 아이콘 설정 (Optimization 5: 외부 상수화)
const REACTION_ICONS = [
    { type: 'heart', label: '좋아요', emoji: '❤️' },
    { type: 'laugh', label: '재밌어요', emoji: '😂' },
    { type: 'wow', label: '멋져요', emoji: '👏' },
    { type: 'bulb', label: '배워요', emoji: '💡' },
    { type: 'star', label: '최고야', emoji: '✨' }
];

const MEETING_REACTION_ICONS = [
    { type: 'agree', label: '마음에 들어요', emoji: '💜' },
    { type: 'supplement', label: '더 이야기해요', emoji: '🔧' },
    { type: 'disagree', label: '다른 생각이에요', emoji: '💭' }
];

const ACCESSORIES = [
    { id: 'crown', emoji: '👑', pos: { top: '-25%', left: '25%', fontSize: '2.5rem' } },
    { id: 'sunglasses', emoji: '🕶️', pos: { top: '15%', left: '15%', fontSize: '2rem' } },
    { id: 'flame', emoji: '🔥', pos: { top: '0', left: '0', fontSize: '6rem', zIndex: -1, filter: 'blur(2px) opacity(0.7)' } },
    { id: 'star', emoji: '⭐', pos: { top: '-10%', left: '60%', fontSize: '1.5rem' } },
];

const CONTAINER_STYLE = { maxWidth: '900px', padding: '32px', background: '#F8F9FA', border: 'none' };
const TAB_CONTAINER_STYLE = { display: 'flex', gap: '12px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' };
const GRID_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' };
const MAIN_TABS = [
    {
        id: 'posts',
        icon: '📰',
        title: '최신 글',
        description: '우리 반이 최근 공개한 글'
    },
    {
        id: 'hideouts',
        icon: '🏠',
        title: '친구 아지트',
        description: '친구의 성장과 서재 방문'
    }
];

// 개별 포스트 카드 컴포넌트 분리 및 memo 적용
const PostCard = memo(({ post, isLast, lastElementRef, onClick, isMeeting, studentId, onMeetingPick }) => {
    const isMine = post.student_id === studentId;
    const authorName =
        (isMine ? '내 글' : '') ||
        post.student_name ||
        (Array.isArray(post.students) ? post.students[0]?.name : post.students?.name) ||
        '알 수 없는 친구';
    const agreeReactions = (post.post_reactions || []).filter(reaction => reaction.reaction_type === 'agree');
    const isMyPick = agreeReactions.some(reaction => reaction.student_id === studentId);

    return (
        <motion.div
            ref={isLast ? lastElementRef : null}
            whileHover={{ y: -5 }}
            onClick={() => onClick(post)}
            style={{
                background: isMeeting
                    ? 'linear-gradient(145deg, #FAF5FF 0%, #F3E8FF 100%)'
                    : 'white',
                padding: '24px',
                borderRadius: isMeeting ? '30px 10px 30px 10px' : '24px',
                boxShadow: isMeeting
                    ? '0 10px 24px rgba(126, 34, 206, 0.12)'
                    : '0 4px 12px rgba(0,0,0,0.03)',
                cursor: 'pointer',
                border: isMeeting ? '2px solid #C084FC' : '1px solid #E9ECEF',
                minHeight: isMeeting ? '240px' : '200px',
                display: 'flex', flexDirection: 'column',
                position: 'relative', overflow: 'hidden'
            }}
        >
            {isMeeting && (
                <div style={{
                    position: 'absolute', top: '-28px', right: '-28px',
                    width: '86px', height: '86px', borderRadius: '50%',
                    background: 'rgba(168, 85, 247, 0.12)'
                }} />
            )}
            <div style={{ marginBottom: '12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{
                    fontSize: '0.8rem', padding: '4px 8px',
                    background: isMine ? '#FFF3E0' : (isMeeting ? '#EDE9FE' : '#E1F5FE'),
                    color: isMine ? '#E65100' : (isMeeting ? '#7E22CE' : '#0288D1'),
                    borderRadius: '8px', fontWeight: 'bold'
                }}>
                    {isMine ? '✍️ 내 글' : authorName}
                </span>
                {isMeeting && (
                    <span style={{
                        fontSize: '0.72rem', padding: '4px 9px', borderRadius: '999px',
                        background: '#7E22CE', color: 'white', fontWeight: '900'
                    }}>
                        🏛️ 안건 후보
                    </span>
                )}
            </div>
            <h4 style={{
                margin: '0 0 8px 0', fontSize: '1.1rem', color: '#2C3E50', fontWeight: '900',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
            }} title={post.title}>{post.title}</h4>
            <p style={{
                fontSize: '0.9rem', color: '#7F8C8D', margin: 0, lineHeight: '1.6',
                overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box',
                WebkitLineClamp: 3, WebkitBoxOrient: 'vertical'
            }}>
                {post.content && post.content.length > 150 ? post.content.slice(0, 150) + '...' : post.content}
            </p>
            {isMeeting && (
                <button
                    type="button"
                    onClick={(event) => {
                        event.stopPropagation();
                        onMeetingPick(post.id);
                    }}
                    style={{
                        marginTop: 'auto', padding: '10px 14px', borderRadius: '14px',
                        border: isMyPick ? '2px solid #7E22CE' : '1px solid #D8B4FE',
                        background: isMyPick ? '#7E22CE' : 'rgba(255,255,255,0.8)',
                        color: isMyPick ? 'white' : '#7E22CE',
                        fontSize: '0.85rem', fontWeight: '900', cursor: 'pointer',
                        display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '7px'
                    }}
                    aria-pressed={isMyPick}
                    aria-label={`${post.title} 안건 마음에 들어요`}
                >
                    <span>{isMyPick ? '💜 선택했어요' : '🤍 마음에 들어요'}</span>
                    <span>{agreeReactions.length}</span>
                </button>
            )}
        </motion.div>
    );
});

/**
 * 역할: 학생 - 친구들의 글을 읽고 반응/댓글 남기기 (친구 글 아지트) 🌈
 */
const FriendsHideout = ({ studentSession, onBack, params }) => {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1024);
    const [activeMainTab, setActiveMainTab] = useState('posts'); // 'posts' or 'hideouts'
    const [viewingFriendHideout, setViewingFriendHideout] = useState(null);
    const observer = useRef();

    const {
        missions, selectedMission, posts, classmates, loading, loadingMore, hasMore, loadMore,
        viewingPost, setViewingPost, handleMissionChange, handleMeetingPick,
        resolvedClassId
    } = useFriendsHideout(studentSession, params);
    const isMeetingMission =
        selectedMission?.mission_type === 'meeting' || selectedMission?.input_template === 'meeting';
    const viewingMission = viewingPost
        ? (viewingPost.mission_id ? (viewingPost.writing_missions || selectedMission) : null)
        : selectedMission;
    const viewingIsMeeting =
        viewingMission?.mission_type === 'meeting' || viewingMission?.input_template === 'meeting';

    const lastElementRef = useCallback(node => {
        if (loading || loadingMore) return;
        if (observer.current) observer.current.disconnect();
        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && hasMore) loadMore();
        });
        if (node) observer.current.observe(node);
    }, [loading, loadingMore, hasMore, loadMore]);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleCloseModal = useCallback(() => {
        if (params?.initialPostId) onBack();
        else if (viewingFriendHideout) setViewingPost(null);
        else {
            setViewingPost(null);
            if (selectedMission) handleMissionChange(selectedMission);
        }
    }, [params, onBack, viewingFriendHideout, setViewingPost, selectedMission, handleMissionChange]);

    const handleOpenFriendPost = useCallback((post) => {
        setViewingPost(post);
    }, [setViewingPost]);

    return (
        <>
            <Card style={isMobile ? {
                width: '100%',
                maxWidth: '900px', // 태블릿 최적화 (친구 아지트는 좀 더 넓게)
                margin: '0 auto',
                minHeight: '100vh',
                padding: '20px 20px 100px 20px',
                background: '#F8F9FA',
                border: 'none',
                borderRadius: 0,
                boxSizing: 'border-box'
            } : CONTAINER_STYLE}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px', marginBottom: '22px' }}>
                    <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 돌아가기</Button>
                    <div>
                        <h2 style={{ margin: 0, color: '#2C3E50', fontWeight: '950', fontSize: isMobile ? '1.5rem' : '1.8rem' }}>🌈 우리 반 글과 아지트</h2>
                        <p style={{ margin: '7px 0 0', color: '#78909C', fontSize: '0.9rem', fontWeight: '700' }}>
                            최신 글을 읽거나 친구가 꾸민 아지트로 바로 놀러 가요.
                        </p>
                    </div>
                </div>

                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: '7px',
                    marginBottom: '25px', padding: '6px', borderRadius: '18px', background: '#E8EDF3',
                    position: 'sticky', top: '8px', zIndex: 20, boxShadow: '0 6px 18px rgba(38,50,56,.08)'
                }} role="tablist" aria-label="최신 글과 친구 아지트">
                    {MAIN_TABS.map((tab) => {
                        const selected = activeMainTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                role="tab"
                                aria-selected={selected}
                                onClick={() => setActiveMainTab(tab.id)}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                    minHeight: '58px', padding: '9px 10px', borderRadius: '13px', cursor: 'pointer',
                                    border: selected ? '1px solid #5C6BC0' : '1px solid transparent',
                                    background: selected ? '#FFFFFF' : 'transparent',
                                    boxShadow: selected ? '0 4px 12px rgba(92,107,192,.14)' : 'none'
                                }}
                            >
                                <span aria-hidden="true" style={{ fontSize: '1.15rem' }}>{tab.icon}</span>
                                <span style={{ minWidth: 0, textAlign: 'left' }}>
                                    <strong style={{ display: 'block', color: selected ? '#3949AB' : '#546E7A', fontSize: '.9rem' }}>{tab.title}</strong>
                                    {!isMobile && <small style={{ display: 'block', marginTop: '2px', color: '#78909C', fontSize: '.68rem' }}>{tab.description}</small>}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {activeMainTab === 'posts' ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div style={{ marginBottom: '18px' }}>
                            <span style={{ color: '#5C6BC0', fontSize: '0.75rem', fontWeight: '950' }}>우리 반 새 글 탐색</span>
                            <h3 style={{ margin: '5px 0 3px', color: '#263238', fontSize: '1.25rem' }}>📰 최신 글 찾아보기</h3>
                            <p style={{ margin: 0, color: '#78909C', fontSize: '0.85rem' }}>과제·독서록을 최신순으로 읽고, 원하면 과제별로 좁혀 보세요.</p>
                        </div>
                    </div>
                ) : (
                    <div style={{ marginBottom: '18px' }}>
                        <span style={{ color: '#8E24AA', fontSize: '0.75rem', fontWeight: '950' }}>친구의 공간 방문</span>
                        <h3 style={{ margin: '5px 0 3px', color: '#263238', fontSize: '1.25rem' }}>🏠 누구의 아지트로 갈까요?</h3>
                        <p style={{ margin: 0, color: '#78909C', fontSize: '0.85rem' }}>나의 아지트처럼 친구의 성장·드래곤·공개 책장을 한 화면에서 구경해요.</p>
                    </div>
                )}

                {activeMainTab === 'posts' ? (
                    <>
                        <div style={TAB_CONTAINER_STYLE}>
                            <button
                                type="button"
                                onClick={() => handleMissionChange(null)}
                                style={{
                                    padding: '10px 20px', borderRadius: '16px', border: 'none',
                                    background: !selectedMission ? '#5C6BC0' : 'white',
                                    color: !selectedMission ? 'white' : '#607D8B',
                                    fontWeight: 'bold', whiteSpace: 'nowrap', cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                                }}
                            >
                                📰 최신 글
                            </button>
                            {missions.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => handleMissionChange(m)}
                                    style={{
                                        padding: '10px 20px', borderRadius: '16px', border: 'none',
                                        background: selectedMission?.id === m.id
                                            ? (m.mission_type === 'meeting' || m.input_template === 'meeting' ? '#7E22CE' : 'var(--primary-color)')
                                            : (m.mission_type === 'meeting' || m.input_template === 'meeting' ? '#FAF5FF' : 'white'),
                                        color: selectedMission?.id === m.id
                                            ? 'white'
                                            : (m.mission_type === 'meeting' || m.input_template === 'meeting' ? '#7E22CE' : '#607D8B'),
                                        fontWeight: 'bold', whiteSpace: 'nowrap', cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)', transition: 'all 0.2s',
                                        outline: m.mission_type === 'meeting' || m.input_template === 'meeting' ? '1px solid #D8B4FE' : 'none'
                                    }}
                                >
                                    {m.mission_type === 'meeting' || m.input_template === 'meeting' ? '🏛️ ' : ''}{m.title}
                                </button>
                            ))}
                        </div>

                        {isMeetingMission && (
                            <div style={{
                                margin: '-8px 0 20px', padding: '14px 18px',
                                borderRadius: '18px 8px 18px 8px',
                                background: 'linear-gradient(135deg, #F5F3FF, #FAF5FF)',
                                border: '1px solid #D8B4FE', color: '#6B21A8',
                                fontWeight: '800', fontSize: '0.9rem', lineHeight: '1.5'
                            }}>
                                🏛️ 친구들의 안건을 읽고 마음에 드는 제안을 골라 보세요.
                                선택 수는 모든 친구에게 함께 보여요.
                            </div>
                        )}

                        <div style={GRID_STYLE}>
                            {loading ? (
                                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px' }}>우리 반이 나눈 글을 불러오는 중... ✨</div>
                            ) : posts.length === 0 ? (
                                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', background: 'white', borderRadius: '24px' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🌵</div>
                                    <p style={{ color: '#95A5A6', fontWeight: 'bold' }}>{selectedMission ? '아직 이 과제에 제출된 글이 없어요.' : '아직 공개된 최신 글이 없어요.'}</p>
                                </div>
                            ) : (
                                <>
                                    {posts.map((post, index) => (
                                        <PostCard
                                            key={post.id}
                                            post={post}
                                            isLast={index === posts.length - 1}
                                            lastElementRef={lastElementRef}
                                            onClick={setViewingPost}
                                            isMeeting={isMeetingMission}
                                            studentId={studentSession.id}
                                            onMeetingPick={handleMeetingPick}
                                        />
                                    ))}
                                    {loadingMore && (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px', color: '#3498DB', fontWeight: 'bold' }}>
                                            우리 반의 소중한 글을 더 가져오고 있어요... ✨
                                        </div>
                                    )}
                                    {!hasMore && posts.length > 0 && (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px', color: '#ADB5BD', fontSize: '0.9rem' }}>
                                            모든 글을 다 읽었어요! 👏
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </>
                ) : (
                    <div style={GRID_STYLE}>
                        {classmates.length === 0 ? (
                            <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', background: 'white', borderRadius: '24px' }}>
                                <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🥚</div>
                                <p style={{ color: '#95A5A6', fontWeight: 'bold' }}>아직 다른 친구들을 찾지 못했어요.</p>
                            </div>
                        ) : (
                            classmates.map((friend) => (
                                <FriendHideoutPreviewCard
                                    key={friend.id}
                                    friend={friend}
                                    onSelect={setViewingFriendHideout}
                                />
                            ))
                        )}
                    </div>
                )}
            </Card>

            <AnimatePresence>
                {viewingPost && (
                    <PostDetailModal
                        key={viewingPost.id}
                        post={viewingPost}
                        mission={viewingMission}
                        studentSession={studentSession}
                        onClose={handleCloseModal}
                        reactionIcons={viewingIsMeeting ? MEETING_REACTION_ICONS : REACTION_ICONS}
                        isMobile={isMobile}
                        ACCESSORIES={ACCESSORIES}
                        classmates={classmates}
                        enforcePublicAccess={viewingPost.student_id !== studentSession.id}
                    />
                )}
                {viewingFriendHideout && (
                    <Suspense fallback={(
                        <div style={{ position: 'fixed', inset: 0, zIndex: 10001, display: 'grid', placeItems: 'center', background: 'rgba(0,0,0,.82)', color: 'white', fontWeight: 900 }}>
                            친구 아지트 정보창을 여는 중... 🏠
                        </div>
                    )}>
                        <FriendProfileShell
                            friend={viewingFriendHideout}
                            viewerId={studentSession.id}
                            classId={resolvedClassId}
                            onClose={() => setViewingFriendHideout(null)}
                            onOpenPost={handleOpenFriendPost}
                        />
                    </Suspense>
                )}
            </AnimatePresence>
        </>
    );
};

export default memo(FriendsHideout);

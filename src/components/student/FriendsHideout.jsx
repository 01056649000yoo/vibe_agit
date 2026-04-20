import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { useFriendsHideout } from '../../hooks/useFriendsHideout';
import PostDetailModal from './PostDetailModal';

// 상수 및 아이콘 설정 (Optimization 5: 외부 상수화)
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

const CONTAINER_STYLE = { maxWidth: '900px', padding: '32px', background: '#F8F9FA', border: 'none' };
const TAB_CONTAINER_STYLE = { display: 'flex', gap: '12px', marginBottom: '24px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' };
const GRID_STYLE = { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' };

const HIDEOUT_BACKGROUNDS = {
    default: { id: 'default', name: '기본 초원', color: 'linear-gradient(135deg, #FFF9C4 0%, #FFFDE7 100%)', border: '#FFF176', textColor: '#5D4037', subColor: '#8D6E63', glow: 'rgba(255, 241, 118, 0.3)' },
    volcano: { id: 'volcano', name: '🌋 화산 동굴', color: 'linear-gradient(135deg, #4A0000 0%, #8B0000 100%)', border: '#FF5722', textColor: 'white', subColor: '#FFCCBC', price: 300, glow: 'rgba(255, 87, 34, 0.4)' },
    sky: { id: 'sky', name: '☁️ 천상 전당', color: 'linear-gradient(135deg, #B3E5FC 0%, #E1F5FE 100%)', border: '#4FC3F7', textColor: '#01579B', subColor: '#0288D1', price: 500, glow: 'rgba(79, 195, 247, 0.3)' },
    crystal: { id: 'crystal', name: '💎 수정 궁전', color: 'linear-gradient(135deg, #4A148C 0%, #7B1FA2 100%)', border: '#BA68C8', textColor: 'white', subColor: '#E1BEE7', price: 1000, glow: 'rgba(186, 104, 200, 0.4)' },
    storm: { id: 'storm', name: '🌩️ 번개 폭풍', color: 'linear-gradient(135deg, #1A237E 0%, #000000 100%)', border: '#7986CB', textColor: 'white', subColor: '#C5CAE9', price: 700, glow: 'rgba(121, 134, 203, 0.5)' },
    galaxy: { id: 'galaxy', name: '🌌 달빛 은하수', color: 'linear-gradient(135deg, #0D47A1 0%, #000000 100%)', border: '#90CAF9', textColor: 'white', subColor: '#E3F2FD', price: 500, glow: 'rgba(144, 202, 249, 0.4)' },
    legend: { id: 'legend', name: '🌈 무지개 성소', color: 'linear-gradient(135deg, #FF9A9E 0%, #FAD0C4 99%, #FAD0C4 100%)', border: '#FFD700', textColor: '#D81B60', subColor: '#AD1457', price: 0, requiresMaxLevel: true, glow: 'rgba(255, 215, 0, 0.6)' }
};

const getDragonStage = (level) => {
    const basePath = '/assets/dragons';
    if (level >= 5) return { name: '전설의 수호신룡', image: `${basePath}/dragon_stage_5.webp` };
    if (level === 4) return { name: '불을 내뿜는 성장한 용', image: `${basePath}/dragon_stage_4.webp` };
    if (level === 3) return { name: '푸른 빛의 어린 용', image: `${basePath}/dragon_stage_3.webp` };
    if (level === 2) return { name: '갓 태어난 용', image: `${basePath}/dragon_stage_2.webp` };
    return { name: '신비로운 알', image: `${basePath}/dragon_stage_1.webp` };
};

// [신규] 친구 아지트 구경 모달 (읽기 전용 - 잘림 방지 및 가독성 개선)
const FriendHideoutModal = memo(({ classmate, onClose, isMobile }) => {
    if (!classmate) return null;
    const petData = classmate.pet_data || { name: '친구 드래곤', level: 1, background: 'default' };
    const bg = HIDEOUT_BACKGROUNDS[petData.background] || HIDEOUT_BACKGROUNDS.default;
    const dragonInfo = getDragonStage(petData.level);

    return (
        <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
            backdropFilter: 'blur(10px)', zIndex: 10001, display: 'flex', // zIndex nav보다 높게 설정
            justifyContent: 'center', alignItems: 'center', // 항상 중앙 정렬
            padding: '20px' // 모바일에서도 여백
        }} onClick={onClose}>
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }} // 팝업 효과로 변경
                animate={{ scale: 1, opacity: 1 }}
                onClick={e => e.stopPropagation()}
                style={{
                    background: 'white',
                    width: '100%',
                    maxWidth: '600px',
                    maxHeight: '90vh',
                    borderRadius: '32px', // 항상 둥근 모서리
                    position: 'relative',
                    boxShadow: `0 25px 60px rgba(0,0,0,0.4)`,
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column'
                }}
            >
                {/* 상단 닫기 버튼 */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '24px', right: '24px',
                        background: 'rgba(0,0,0,0.1)', border: 'none',
                        borderRadius: '50%', width: '40px', height: '40px',
                        cursor: 'pointer', fontWeight: 'bold', zIndex: 10,
                        color: 'white', backdropFilter: 'blur(5px)'
                    }}
                >✕</button>

                {/* 스크롤 가능한 영역 (패딩 포함) */}
                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '32px 20px' : '40px' }}>
                    <div style={{ textAlign: 'center', marginBottom: '32px' }}>
                        <div style={{ marginBottom: '12px' }}>
                            <span style={{
                                background: bg.color, color: bg.textColor, padding: '6px 18px',
                                borderRadius: '20px', fontSize: '0.9rem', fontWeight: '900',
                                boxShadow: `0 4px 12px ${bg.glow}`, display: 'inline-block'
                            }}>
                                🏠 {classmate.name}의 아지트 방문 중
                            </span>
                        </div>
                        <h2 style={{ margin: '0 0 4px 0', color: '#2C3E50', fontSize: '2.2rem', fontWeight: '950' }}>{petData.name}</h2>
                        <span style={{ color: '#7F8C8D', fontSize: '1.1rem', fontWeight: 'bold' }}>Lv.{petData.level} {dragonInfo.name}</span>
                    </div>

                    {/* 아지트 배경 및 드래곤 박스 */}
                    <div style={{
                        position: 'relative', height: '320px', background: bg.color,
                        borderRadius: '24px', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', border: `4px solid ${bg.border}`,
                        overflow: 'hidden', boxShadow: `inset 0 0 40px rgba(0,0,0,0.1)`
                    }}>
                        {/* 배경 데코레이션 효과 */}
                        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.1) 100%)' }} />

                        <motion.div
                            animate={{ y: [0, -20, 0], scale: [1, 1.05, 1] }}
                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                            style={{ position: 'relative', zIndex: 2 }}
                        >
                            <img src={dragonInfo.image} alt="Dragon" style={{ width: '260px', height: '260px', objectFit: 'contain', filter: `drop-shadow(0 20px 30px ${bg.glow})` }} />
                        </motion.div>

                        {/* 바닥 그림자 */}
                        <div style={{ position: 'absolute', bottom: '20%', width: '160px', height: '24px', background: 'rgba(0,0,0,0.15)', borderRadius: '50%', filter: 'blur(10px)', zIndex: 1 }} />
                    </div>

                    <div style={{
                        marginTop: '32px', color: '#5D4037', background: '#FFF9C4',
                        padding: '24px', borderRadius: '24px', border: '1px solid #FFE082',
                        fontSize: '1rem', lineHeight: '1.6', textAlign: 'center',
                        boxShadow: '0 4px 10px rgba(0,0,0,0.02)'
                    }}>
                        {/* [추가] 친구 드래곤 경험치 바 */}
                        <div style={{ marginBottom: '16px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 'bold' }}>
                                <span>성장도</span>
                                <span>{petData.exp}%</span>
                            </div>
                            <div style={{ height: '10px', background: 'rgba(0,0,0,0.05)', borderRadius: '5px', overflow: 'hidden' }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${petData.exp}%` }} style={{ height: '100%', background: petData.exp >= 100 ? 'linear-gradient(90deg, #FFD700, #BA68C8)' : 'linear-gradient(90deg, #FBC02D, #FFA000)', borderRadius: '5px' }} />
                            </div>
                        </div>

                        <div style={{ fontSize: '1.5rem', marginBottom: '8px' }}>💖</div>
                        <strong>{classmate.name}</strong> 친구가 정성을 다해 드래곤을 키우고 있어요! <br />
                        멋진 드래곤으로 성장할 수 있게 응원해주세요.
                    </div>
                </div>

                {/* 하단 버튼 (이머시브 강화) */}
                <div style={{ padding: '24px', background: '#F8F9FA', borderTop: '1px solid #E9ECEF', textAlign: 'center' }}>
                    <Button variant="primary" onClick={onClose} style={{ width: '100%', borderRadius: '16px', fontWeight: 'bold', height: '54px' }}>
                        우와, 멋지다! 구경 끝내기
                    </Button>
                </div>
            </motion.div>
        </div>
    );
});

// 개별 포스트 카드 컴포넌트 분리 및 memo 적용
const PostCard = memo(({ post, isLast, lastElementRef, onClick }) => {
    const authorName =
        post.student_name ||
        (Array.isArray(post.students) ? post.students[0]?.name : post.students?.name) ||
        '알 수 없는 친구';

    return (
        <motion.div
            ref={isLast ? lastElementRef : null}
            whileHover={{ y: -5 }}
            onClick={() => onClick(post)}
            style={{
                background: 'white', padding: '24px', borderRadius: '24px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.03)', cursor: 'pointer',
                border: '1px solid #E9ECEF',
                height: '200px', display: 'flex', flexDirection: 'column'
            }}
        >
            <div style={{ marginBottom: '12px' }}>
                <span style={{
                    fontSize: '0.8rem', padding: '4px 8px', background: '#E1F5FE',
                    color: '#0288D1', borderRadius: '8px', fontWeight: 'bold'
                }}>
                    {authorName}
                </span>
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
        </motion.div>
    );
});

/**
 * 역할: 학생 - 친구들의 글을 읽고 반응/댓글 남기기 (친구 글 아지트) 🌈
 */
const FriendsHideout = ({ studentSession, onBack, params }) => {
    const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 1024);
    const [activeMainTab, setActiveMainTab] = useState('posts'); // 'posts' or 'dragons'
    const [viewingFriendHideout, setViewingFriendHideout] = useState(null);
    const observer = useRef();

    const {
        missions, selectedMission, posts, classmates, loading, loadingMore, hasMore, loadMore,
        viewingPost, setViewingPost, handleMissionChange
    } = useFriendsHideout(studentSession, params);

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
        else setViewingPost(null);
    }, [params, onBack, setViewingPost]);

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
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', marginBottom: '32px', gap: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 돌아가기</Button>
                        <h2 style={{ margin: 0, color: '#2C3E50', fontWeight: '900', fontSize: '1.8rem' }}>👀 친구 아지트</h2>
                    </div>
                    <div style={{ background: '#E9ECEF', padding: '6px', borderRadius: '16px', display: 'flex', gap: '4px' }}>
                        <button
                            onClick={() => setActiveMainTab('posts')}
                            style={{ padding: '8px 16px', border: 'none', borderRadius: '12px', background: activeMainTab === 'posts' ? 'white' : 'transparent', fontWeight: 'bold', color: activeMainTab === 'posts' ? '#2C3E50' : '#7F8C8D', cursor: 'pointer', transition: 'all 0.2s', boxShadow: activeMainTab === 'posts' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' }}
                        >🏷️ 친구들의 글</button>
                        <button
                            onClick={() => setActiveMainTab('dragons')}
                            style={{ padding: '8px 16px', border: 'none', borderRadius: '12px', background: activeMainTab === 'dragons' ? 'white' : 'transparent', fontWeight: 'bold', color: activeMainTab === 'dragons' ? '#2C3E50' : '#7F8C8D', cursor: 'pointer', transition: 'all 0.2s', boxShadow: activeMainTab === 'dragons' ? '0 2px 8px rgba(0,0,0,0.1)' : 'none' }}
                        >🐉 드래곤 친구들</button>
                    </div>
                </div>

                {activeMainTab === 'posts' ? (
                    <>
                        <div style={TAB_CONTAINER_STYLE}>
                            {missions.map(m => (
                                <button
                                    key={m.id}
                                    onClick={() => handleMissionChange(m)}
                                    style={{
                                        padding: '10px 20px', borderRadius: '16px', border: 'none',
                                        background: selectedMission?.id === m.id ? 'var(--primary-color)' : 'white',
                                        color: selectedMission?.id === m.id ? 'white' : '#607D8B',
                                        fontWeight: 'bold', whiteSpace: 'nowrap', cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(0,0,0,0.05)', transition: 'all 0.2s'
                                    }}
                                >
                                    {m.title}
                                </button>
                            ))}
                        </div>

                        <div style={GRID_STYLE}>
                            {loading ? (
                                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px' }}>친구들의 글을 불러오는 중... ✨</div>
                            ) : posts.length === 0 ? (
                                <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '60px', background: 'white', borderRadius: '24px' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🌵</div>
                                    <p style={{ color: '#95A5A6', fontWeight: 'bold' }}>아직 제출된 친구의 글이 없어요.</p>
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
                                        />
                                    ))}
                                    {loadingMore && (
                                        <div style={{ gridColumn: '1/-1', textAlign: 'center', padding: '20px', color: '#3498DB', fontWeight: 'bold' }}>
                                            친구들의 소중한 글을 더 가져오고 있어요... ✨
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
                            classmates.map(friend => {
                                const pet = friend.pet_data || { name: '친구 드래곤', level: 1, background: 'default' };
                                const dragon = getDragonStage(pet.level);
                                const bg = HIDEOUT_BACKGROUNDS[pet.background] || HIDEOUT_BACKGROUNDS.default;

                                return (
                                    <motion.div
                                        key={friend.id}
                                        whileHover={{ scale: 1.02 }}
                                        onClick={() => setViewingFriendHideout(friend)}
                                        style={{
                                            background: 'white', padding: '20px', borderRadius: '24px',
                                            boxShadow: '0 4px 15px rgba(0,0,0,0.05)', cursor: 'pointer',
                                            border: '1px solid #E9ECEF', display: 'flex', alignItems: 'center', gap: '16px'
                                        }}
                                    >
                                        <div style={{
                                            width: '64px', height: '64px', background: bg.color,
                                            borderRadius: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            overflow: 'hidden', border: `1px solid ${bg.border}`
                                        }}>
                                            <img src={dragon.image} alt="D" style={{ width: '45px', height: '45px', objectFit: 'contain' }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: '0.8rem', color: '#7F8C8D', fontWeight: 'bold' }}>{friend.name} 친구</div>
                                            <div style={{ fontSize: '1.1rem', fontWeight: '900', color: '#2C3E50' }}>{pet.name}</div>
                                            <div style={{ fontSize: '0.75rem', color: bg.subColor, fontWeight: 'bold' }}>Lv.{pet.level} {dragon.name}</div>
                                            {/* [추가] 미니 경험치 바 */}
                                            <div style={{ height: '4px', background: '#F1F3F5', borderRadius: '2px', overflow: 'hidden', marginTop: '6px', width: '80%' }}>
                                                <div style={{ width: `${pet.exp}%`, height: '100%', background: pet.exp >= 100 ? 'linear-gradient(90deg, #FFD700, #BA68C8)' : '#FBC02D', transition: 'width 0.5s ease' }} />
                                            </div>
                                        </div>
                                        <div style={{ fontSize: '1.2rem' }}>🏠</div>
                                    </motion.div>
                                );
                            })
                        )}
                    </div>
                )}
            </Card>

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
                        classmates={classmates}
                    />
                )}
                {viewingFriendHideout && (
                    <FriendHideoutModal
                        classmate={viewingFriendHideout}
                        onClose={() => setViewingFriendHideout(null)}
                        isMobile={isMobile}
                    />
                )}
            </AnimatePresence>
        </>
    );
};

export default memo(FriendsHideout);

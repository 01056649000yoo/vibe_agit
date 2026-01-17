import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { usePostInteractions } from '../../hooks/usePostInteractions';

/**
 * 역할: 학생 - 친구들의 글을 읽고 반응/댓글 남기기 (친구 글 아지트) 🌈
 */
const FriendsHideout = ({ studentSession, onBack, params }) => {
    const [missions, setMissions] = useState([]);
    const [selectedMission, setSelectedMission] = useState(null);
    const [posts, setPosts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [viewingPost, setViewingPost] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth < 768);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth < 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // 반응 아이콘 설정
    const reactionIcons = [
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

    useEffect(() => {
        fetchMissions();
        if (params?.initialPostId) {
            handleInitialPost(params.initialPostId);
        }
    }, [params]);

    const handleInitialPost = async (postId) => {
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select('*, students:student_id(name, pet_data), writing_missions(allow_comments)')
                .eq('id', postId)
                .maybeSingle();

            if (error) throw error;
            if (data) {
                console.log('[FriendsHideout] 초기 포스트 로드 성공:', data);
                setViewingPost(data);
            }
        } catch (err) {
            console.error('초기 포스트 로드 실패:', err.message);
        }
    };

    const fetchMissions = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('writing_missions')
                .select('*')
                .eq('class_id', studentSession.classId || studentSession.class_id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setMissions(data || []);
            if (data?.length > 0) {
                setSelectedMission(data[0]);
                fetchPosts(data[0].id);
            }
        } catch (err) {
            console.error('미션 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const fetchPosts = async (missionId) => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    *,
                    students:student_id!inner(name, class_id, pet_data),
                    writing_missions(allow_comments)
                `)
                .eq('mission_id', missionId)
                .eq('is_submitted', true)
                .neq('student_id', studentSession.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
            console.log(`[FriendsHideout] 미션(${missionId}) 포스트 로드 성공:`, data);
            setPosts(data || []);
        } catch (err) {
            console.error('친구 글 로드 실패:', err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleMissionChange = (mission) => {
        setSelectedMission(mission);
        fetchPosts(mission.id);
    };

    return (
        <Card style={{ maxWidth: '900px', padding: '32px', background: '#F8F9FA', border: 'none' }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <Button variant="ghost" size="sm" onClick={onBack}>⬅️ 돌아가기</Button>
                    <h2 style={{ margin: 0, color: '#2C3E50', fontWeight: '900', fontSize: '1.8rem' }}>👀 친구 글 아지트</h2>
                </div>
            </div>

            {/* 미션 탭 */}
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

            {/* 글 목록 */}
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
                        onClose={() => {
                            // The provided snippet seems to be for a different context (StudentFeedbackModal)
                            // and introduces undefined variables like `isRewriteRelated`, `item`, `onNavigate`.
                            // As the instruction also mentions "Refactor PostDetailModal in FriendsHideout to use the usePostInteractions hook for reactions and comments",
                            // and this hook is already in use, I will only apply the `params?.initialPostId` logic
                            // which is already present and correct for this component's `onClose`.
                            // The other part of the provided snippet is not applicable here.
                            if (params?.initialPostId) {
                                // 소식 알림을 통해 들어온 경우, 글을 닫으면 바로 대시보드로 돌아가기
                                onBack();
                            } else {
                                setViewingPost(null);
                            }
                        }}
                        reactionIcons={reactionIcons}
                        isMobile={isMobile}
                        ACCESSORIES={ACCESSORIES}
                    />
                )}
            </AnimatePresence>
        </Card>
    );
};

const PostDetailModal = ({ post, mission, studentSession, onClose, reactionIcons, isMobile, ACCESSORIES }) => {
    const [commentInput, setCommentInput] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    // [전면 수정] usePostInteractions 훅 사용
    const {
        reactions,
        comments,
        loading,
        handleReaction,
        addComment
    } = usePostInteractions(post.id, studentSession.id);

    useEffect(() => {
        // 모달 오픈 시 배경 스크롤 방지
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, []);

    const handleCommentSubmit = async (e) => {
        e.preventDefault();
        if (!commentInput.trim() || submittingComment) return;

        setSubmittingComment(true);
        try {
            const success = await addComment(commentInput);
            if (success) {
                // 보상 포인트 지급 (5P)
                const { data: studentData } = await supabase
                    .from('students')
                    .select('total_points')
                    .eq('id', studentSession.id)
                    .maybeSingle();

                const newPoints = (studentData?.total_points || 0) + 5;
                await supabase
                    .from('students')
                    .update({ total_points: newPoints })
                    .eq('id', studentSession.id);

                await supabase
                    .from('point_logs')
                    .insert({
                        student_id: studentSession.id,
                        amount: 5,
                        reason: `친구 글에 따뜻한 응원을 남겨주셨네요! ✨`
                    });

                setCommentInput('');
                alert('댓글을 남기고 5포인트를 받았어요! ✨');
            }
        } catch (err) {
            console.error('댓글 저장 실패:', err.message);
        } finally {
            setSubmittingComment(false);
        }
    };

    const getReactionCount = (type) => reactions.filter(r => r.reaction_type === type).length;

    // 포탈(Portal)을 사용하여 document.body 바로 아래에 렌더링
    return createPortal(
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed',
                top: 0, left: 0, width: '100vw', height: '100vh',
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                zIndex: 3000, // 최상단 배치
                display: 'flex',
                justifyContent: 'center',
                alignItems: isMobile ? 'flex-end' : 'center',
                padding: isMobile ? '0' : '20px'
            }}
            onClick={onClose}
        >
            <motion.div
                initial={{ y: isMobile ? '100%' : 80, scale: isMobile ? 1 : 0.9, opacity: isMobile ? 1 : 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ y: isMobile ? '100%' : 80, scale: isMobile ? 1 : 0.9, opacity: isMobile ? 1 : 0 }}
                transition={{ type: 'spring', damping: 30, stiffness: 250 }}
                style={{
                    background: 'white',
                    borderRadius: isMobile ? '32px 32px 0 0' : '40px',
                    width: isMobile ? '100%' : '90%',
                    maxWidth: '850px',
                    maxHeight: isMobile ? '95vh' : '90vh',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 50px 120px rgba(0,0,0,0.5)',
                    position: 'relative'
                }}
                onClick={e => e.stopPropagation()}
            >
                <header style={{
                    padding: isMobile ? '20px' : '28px 40px',
                    borderBottom: '1px solid #F1F3F5',
                    display: 'flex',
                    alignItems: 'center',
                    background: 'white',
                    flexShrink: 0
                }}>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#F8F9FA', border: 'none',
                            width: '44px', height: '44px', borderRadius: '14px',
                            fontSize: '1.2rem', cursor: 'pointer', color: '#636E72',
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            transition: 'all 0.2s'
                        }}
                    >
                        ⬅️
                    </button>
                    <div style={{ flex: 1, textAlign: 'center', padding: '0 20px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '15px' }}>
                        {/* 친구 드래곤 표시 */}
                        {post.students?.pet_data && (
                            <div style={{ position: 'relative', width: '50px', height: '50px', background: '#FFFDE7', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2rem', border: '1px solid #FFE082' }}>
                                {(() => {
                                    const lvl = post.students.pet_data.level || 1;
                                    const emoji = lvl >= 5 ? '🌈' : lvl >= 4 ? '👑' : lvl >= 3 ? '🌳' : lvl >= 2 ? '🌿' : '🌱';
                                    return emoji;
                                })()}
                                {post.students.pet_data.equippedItems?.map(itemId => {
                                    const item = ACCESSORIES.find(a => a.id === itemId);
                                    if (!item) return null;
                                    return (
                                        <div key={item.id} style={{ position: 'absolute', ...item.pos, fontSize: '1rem', pointerEvents: 'none' }}>
                                            {item.emoji}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                        <div style={{ textAlign: 'left' }}>
                            <div style={{ fontSize: '0.85rem', color: '#3498DB', fontWeight: '900', marginBottom: '2px' }}>
                                {post.students?.name} 학생의 소중한 이야기 ✍️
                            </div>
                            <h3 style={{
                                margin: 0, fontWeight: '900', color: '#2D3436',
                                fontSize: isMobile ? '1rem' : '1.3rem',
                                maxWidth: isMobile ? '150px' : '400px',
                                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                            }}>
                                {post.title}
                            </h3>
                        </div>
                    </div>
                    <div style={{ width: '44px' }} />
                </header>

                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '28px 20px 80px 20px' : '48px 60px 100px 60px', scrollbarWidth: 'thin' }}>
                    <div style={{
                        fontSize: isMobile ? '1.1rem' : '1.3rem',
                        lineHeight: '1.9',
                        whiteSpace: 'pre-wrap',
                        color: '#2D3436',
                        marginBottom: '80px',
                        letterSpacing: '-0.02em',
                        wordBreak: 'break-word'
                    }}>
                        {post.content}
                    </div>

                    {/* 반응 바 - 상큼한 5종 가로 1열 배치 */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        gap: isMobile ? '8px' : '12px',
                        padding: isMobile ? '16px 10px' : '20px',
                        background: '#F8F9FA',
                        borderRadius: '24px',
                        marginBottom: '48px',
                        border: '1px solid #F1F3F5',
                        overflowX: 'auto',
                        scrollbarWidth: 'none'
                    }}>
                        {reactionIcons.map((icon) => {
                            const isMine = reactions.some(r => r.student_id === studentSession.id && r.reaction_type === icon.type);

                            return (
                                <button
                                    key={icon.type}
                                    onClick={() => handleReaction(icon.type)}
                                    style={{
                                        flex: 1,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: '4px',
                                        padding: isMobile ? '8px 4px' : '12px 8px',
                                        border: isMine ? '2px solid #3498DB' : '1px solid #ECEFF1',
                                        background: isMine ? '#E3F2FD' : 'white',
                                        borderRadius: '16px',
                                        boxShadow: isMine ? '0 4px 10px rgba(52, 152, 219, 0.15)' : '0 2px 4px rgba(0,0,0,0.02)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        minWidth: isMobile ? '60px' : '80px',
                                        whiteSpace: 'nowrap'
                                    }}
                                    onMouseEnter={e => {
                                        if (!isMine) e.currentTarget.style.background = '#F0F7FF';
                                    }}
                                    onMouseLeave={e => {
                                        if (!isMine) e.currentTarget.style.background = 'white';
                                    }}
                                >
                                    {/* 1층: 이모티콘 */}
                                    <span style={{ fontSize: isMobile ? '1.2rem' : '1.4rem' }}>{icon.emoji}</span>

                                    {/* 2층: 의미 라벨 */}
                                    <span style={{
                                        fontSize: '0.7rem',
                                        fontWeight: 'bold',
                                        color: isMine ? '#3498DB' : '#7F8C8D',
                                        letterSpacing: '-0.03em'
                                    }}>
                                        {icon.label}
                                    </span>

                                    {/* 3층: 숫자 */}
                                    <span style={{
                                        fontSize: '0.85rem',
                                        fontWeight: '900',
                                        color: isMine ? '#2980B9' : '#ADB5BD'
                                    }}>
                                        {getReactionCount(icon.type)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    <div style={{ borderTop: '2px solid #F1F3F5', paddingTop: '48px' }}>
                        <h4 style={{ margin: '0 0 24px 0', fontSize: '1.25rem', fontWeight: '900', color: '#2D3436' }}>
                            💬 친구들의 따뜻한 한마디
                        </h4>

                        {mission?.allow_comments === false ? (
                            <div style={{
                                textAlign: 'center',
                                padding: '40px',
                                background: '#F8F9FA',
                                borderRadius: '24px',
                                border: '1px solid #E9ECEF',
                                color: '#95A5A6',
                                fontWeight: 'bold'
                            }}>
                                <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '8px' }}>🔒</span>
                                선생님이 댓글창을 닫아두셨어요. 🔒
                            </div>
                        ) : (
                            <>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px', marginBottom: '40px' }}>
                                    {comments.length === 0 ? (
                                        <div style={{ textAlign: 'center', color: '#B2BEC3', fontSize: '1rem', padding: '50px', background: '#FDFDFD', borderRadius: '24px', border: '2px dashed #F1F3F5' }}>
                                            첫 번째 응원의 주인공이 되어보세요! ✨
                                        </div>
                                    ) : (
                                        comments.map(c => (
                                            <div key={c.id} style={{
                                                padding: '20px 24px', background: '#F8F9FA', borderRadius: '24px',
                                                border: '1px solid #F1F3F5'
                                            }}>
                                                <div style={{ fontWeight: '900', fontSize: '0.9rem', color: '#3498DB', marginBottom: '8px' }}>{c.students?.name}</div>
                                                <div style={{ fontSize: '1.05rem', color: '#2D3436', lineHeight: '1.7' }}>{c.content}</div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <form onSubmit={handleCommentSubmit} style={{
                                    display: 'flex', gap: '14px', background: 'white',
                                    padding: '10px', borderRadius: '22px', border: '2px solid #F1F3F5',
                                    boxShadow: '0 8px 16px rgba(0,0,0,0.04)'
                                }}>
                                    <input
                                        type="text"
                                        value={commentInput}
                                        onChange={e => setCommentInput(e.target.value)}
                                        placeholder="따뜻한 응원을 남겨주세요... (댓글 쓰면 5P!) ✨"
                                        style={{
                                            flex: 1, padding: '14px 20px', border: 'none', outline: 'none',
                                            fontSize: '1.05rem', color: '#2D3436'
                                        }}
                                    />
                                    <Button type="submit" size="sm" style={{ borderRadius: '16px', padding: '0 24px', fontWeight: '900' }} disabled={submittingComment}>
                                        보내기
                                    </Button>
                                </form>
                            </>
                        )}
                    </div>
                </div>
            </motion.div>
        </motion.div>,
        document.body
    );
};

export default FriendsHideout;

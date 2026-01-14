import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabaseClient';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * 역할: 학생 - 친구들의 글을 읽고 반응/댓글 남기기 (친구 글 아지트) 🌈
 */
const FriendsHideout = ({ studentSession, onBack }) => {
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
        { type: 'heart', label: '감동이에요', emoji: '❤️' },
        { type: 'laugh', label: '재밌어요', emoji: '😂' },
        { type: 'wow', label: '멋져요', emoji: '👏' },
        { type: 'bulb', label: '배우고 가요', emoji: '💡' },
        { type: 'star', label: '반짝여요', emoji: '✨' }
    ];

    useEffect(() => {
        fetchMissions();
    }, []);

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
            // 본인 글을 제외한 친구들의 글만 가져오기 (제출 완료된 글만)
            const { data, error } = await supabase
                .from('student_posts')
                .select(`
                    *,
                    students!inner(name, class_id)
                `)
                .eq('mission_id', missionId)
                .eq('is_submitted', true)
                .neq('student_id', studentSession.id)
                .order('created_at', { ascending: false });

            if (error) throw error;
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
                        studentSession={studentSession}
                        onClose={() => setViewingPost(null)}
                        reactionIcons={reactionIcons}
                        isMobile={isMobile}
                    />
                )}
            </AnimatePresence>
        </Card>
    );
};

const PostDetailModal = ({ post, studentSession, onClose, reactionIcons, isMobile }) => {
    const [reactions, setReactions] = useState([]);
    const [comments, setComments] = useState([]);
    const [commentInput, setCommentInput] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);

    useEffect(() => {
        fetchReactions();
        fetchComments();
    }, [post.id]);

    const fetchReactions = async () => {
        const { data, error } = await supabase
            .from('post_reactions')
            .select('*')
            .eq('post_id', post.id);
        if (!error) setReactions(data || []);
    };

    const fetchComments = async () => {
        const { data, error } = await supabase
            .from('post_comments')
            .select('*, students(name)')
            .eq('post_id', post.id)
            .order('created_at', { ascending: true });
        if (!error) setComments(data || []);
    };

    const handleReaction = async (type) => {
        try {
            const { error } = await supabase
                .from('post_reactions')
                .upsert({
                    post_id: post.id,
                    user_id: studentSession.id,
                    reaction_type: type
                }, { onConflict: 'post_id,user_id,reaction_type' });

            if (error) throw error;
            fetchReactions();
        } catch (err) {
            console.error('반응 저장 실패:', err.message);
        }
    };

    const handleCommentSubmit = async (e) => {
        e.preventDefault();
        if (!commentInput.trim() || submittingComment) return;

        setSubmittingComment(true);
        try {
            // 1. 댓글 저장
            const { error: commentError } = await supabase
                .from('post_comments')
                .insert({
                    post_id: post.id,
                    author_id: studentSession.id,
                    content: commentInput.trim()
                });

            if (commentError) throw commentError;

            // 2. 포인트 지급 (5포인트)
            const { data: studentData } = await supabase
                .from('students')
                .select('total_points')
                .eq('id', studentSession.id)
                .single();

            const newPoints = (studentData?.total_points || 0) + 5;
            await supabase
                .from('students')
                .update({ total_points: newPoints })
                .eq('id', studentSession.id);

            // 3. 로그 남기기
            await supabase
                .from('point_logs')
                .insert({
                    student_id: studentSession.id,
                    amount: 5,
                    reason: `친구 글에 따뜻한 댓글 남기기 보상 💬`
                });

            setCommentInput('');
            fetchComments();
            alert('댓글을 남기고 5포인트를 받았어요! ✨');
        } catch (err) {
            console.error('댓글 저장 실패:', err.message);
        } finally {
            setSubmittingComment(false);
        }
    };

    const getReactionCount = (type) => reactions.filter(r => r.reaction_type === type).length;

    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(8px)',
                WebkitBackdropFilter: 'blur(8px)',
                zIndex: 2000,
                display: 'flex', justifyContent: 'center', alignItems: 'center',
                padding: isMobile ? '0' : '20px'
            }}
            onClick={onClose}
        >
            <motion.div
                initial={{ y: 50, scale: 0.95, opacity: 0 }}
                animate={{ y: 0, scale: 1, opacity: 1 }}
                exit={{ y: 50, scale: 0.95, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                style={{
                    background: 'white',
                    borderRadius: isMobile ? '24px 24px 0 0' : '32px',
                    width: isMobile ? '100%' : '95%',
                    maxWidth: '800px',
                    maxHeight: isMobile ? '95vh' : '90vh',
                    display: 'flex', flexDirection: 'column',
                    overflow: 'hidden',
                    boxShadow: '0 40px 100px rgba(0,0,0,0.3)',
                    margin: isMobile ? 'auto 0 0 0' : '0 auto'
                }}
                onClick={e => e.stopPropagation()}
            >
                <header style={{
                    padding: isMobile ? '20px' : '28px 40px',
                    borderBottom: '1px solid #F1F3F5',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexShrink: 0
                }}>
                    <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                            <span style={{
                                fontSize: '0.85rem',
                                color: '#3498DB',
                                fontWeight: '900',
                                background: '#E3F2FD',
                                padding: '4px 10px',
                                borderRadius: '8px'
                            }}>
                                ✍️ {post.students?.name}
                            </span>
                            <span style={{ fontSize: '0.8rem', color: '#ADB5BD' }}>친구의 소중한 글</span>
                        </div>
                        <h3 style={{
                            margin: 0,
                            fontWeight: '900',
                            color: '#2C3E50',
                            fontSize: isMobile ? '1.25rem' : '1.6rem',
                            lineHeight: '1.3'
                        }}>
                            {post.title}
                        </h3>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#F8F9FA',
                            border: 'none',
                            width: '48px',
                            height: '48px',
                            borderRadius: '50%',
                            fontSize: '1.4rem',
                            cursor: 'pointer',
                            color: '#ADB5BD',
                            display: 'flex',
                            justifyContent: 'center',
                            alignItems: 'center',
                            transition: 'all 0.2s',
                            marginLeft: '16px'
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = '#F1F3F5'}
                        onMouseLeave={e => e.currentTarget.style.background = '#F8F9FA'}
                    >
                        ✕
                    </button>
                </header>

                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '24px 20px 60px 20px' : '40px 40px 80px 40px', scrollbarWidth: 'thin' }}>
                    <div style={{
                        fontSize: isMobile ? '1.1rem' : '1.25rem',
                        lineHeight: '1.9',
                        whiteSpace: 'pre-wrap',
                        color: '#34495E',
                        marginBottom: '60px',
                        letterSpacing: '-0.01em'
                    }}>
                        {post.content}
                    </div>

                    {/* 반응 바 */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        gap: '12px',
                        padding: '20px',
                        background: '#F8F9FA',
                        borderRadius: '24px',
                        marginBottom: '32px'
                    }}>
                        {reactionIcons.map(icon => (
                            <button
                                key={icon.type}
                                onClick={() => handleReaction(icon.type)}
                                style={{
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '4px',
                                    padding: '8px 12px',
                                    border: 'none',
                                    background: 'white',
                                    borderRadius: '16px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.05)',
                                    cursor: 'pointer',
                                    transition: 'transform 0.1s'
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.1)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <span style={{ fontSize: '1.5rem' }}>{icon.emoji}</span>
                                <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#7F8C8D' }}>
                                    {getReactionCount(icon.type)}
                                </span>
                            </button>
                        ))}
                    </div>

                    {/* 댓글 영역 */}
                    <div style={{ borderTop: '1px solid #EEE', paddingTop: '32px' }}>
                        <h4 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '900', color: '#2C3E50' }}>💬 친구들의 피드백</h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
                            {comments.length === 0 ? (
                                <p style={{ textAlign: 'center', color: '#ADB5BD', fontSize: '0.9rem', padding: '20px' }}>첫 번째 댓글을 남겨보세요! ✍️</p>
                            ) : (
                                comments.map(c => (
                                    <div key={c.id} style={{ padding: '12px 16px', background: '#F8F9FA', borderRadius: '16px' }}>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.85rem', color: '#3498DB', marginBottom: '4px' }}>{c.students?.name}</div>
                                        <div style={{ fontSize: '0.95rem', color: '#2C3E50' }}>{c.content}</div>
                                    </div>
                                ))
                            )}
                        </div>

                        <form onSubmit={handleCommentSubmit} style={{ display: 'flex', gap: '8px' }}>
                            <input
                                type="text"
                                value={commentInput}
                                onChange={e => setCommentInput(e.target.value)}
                                placeholder="친구의 글에 따뜻한 응원을 남겨주세요..."
                                style={{
                                    flex: 1,
                                    padding: '12px 16px',
                                    borderRadius: '12px',
                                    border: '2px solid #EEE',
                                    outline: 'none',
                                    fontSize: '0.95rem'
                                }}
                            />
                            <Button type="submit" size="sm" disabled={submittingComment}>남기기</Button>
                        </form>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};

export default FriendsHideout;

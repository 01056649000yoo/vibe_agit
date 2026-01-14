import React, { useState, useEffect } from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { supabase } from '../../lib/supabaseClient';
import { motion } from 'framer-motion';

/**
 * 역할: 학생 메인 대시보드 - 포인트 표시 및 활동 메뉴
 * props:
 *  - studentSession: 학생 세션 정보 (id, name, className 등)
 *  - onLogout: 로그아웃 처리 함수
 */
const StudentDashboard = ({ studentSession, onLogout, onNavigate }) => {
    const [points, setPoints] = useState(0);
    const [hasActivity, setHasActivity] = useState(false);
    const [showFeedback, setShowFeedback] = useState(false);
    const [feedbacks, setFeedbacks] = useState([]);
    const [loadingFeedback, setLoadingFeedback] = useState(false);

    useEffect(() => {
        if (studentSession?.id) {
            fetchMyPoints();
            checkActivity();
        }
    }, [studentSession]);

    const fetchMyPoints = async () => {
        const { data, error } = await supabase
            .from('students')
            .select('total_points')
            .eq('id', studentSession.id)
            .single();

        if (data) {
            setPoints(data.total_points || 0);
        }
    };

    const checkActivity = async () => {
        try {
            const { data: myPosts } = await supabase
                .from('student_posts')
                .select('id')
                .eq('student_id', studentSession.id);

            if (!myPosts || myPosts.length === 0) return;
            const postIds = myPosts.map(p => p.id);

            const { count: reactionCount } = await supabase
                .from('post_reactions')
                .select('*', { count: 'exact', head: true })
                .in('post_id', postIds)
                .neq('user_id', studentSession.id);

            const { count: commentCount } = await supabase
                .from('post_comments')
                .select('*', { count: 'exact', head: true })
                .in('post_id', postIds)
                .neq('author_id', studentSession.id);

            setHasActivity((reactionCount || 0) + (commentCount || 0) > 0);
        } catch (err) {
            console.error('활동 확인 실패:', err.message);
        }
    };

    const fetchFeedbacks = async () => {
        setLoadingFeedback(true);
        try {
            const { data: myPosts } = await supabase
                .from('student_posts')
                .select('id, title')
                .eq('student_id', studentSession.id);

            if (!myPosts || myPosts.length === 0) {
                setFeedbacks([]);
                return;
            }
            const postIds = myPosts.map(p => p.id);

            // 반응 가져오기
            const { data: reactions } = await supabase
                .from('post_reactions')
                .select('*, students(name), student_posts(title, id)')
                .in('post_id', postIds)
                .neq('user_id', studentSession.id);

            // 댓글 가져오기
            const { data: comments } = await supabase
                .from('post_comments')
                .select('*, students:author_id(name), student_posts(title, id)')
                .in('post_id', postIds)
                .neq('author_id', studentSession.id);

            const combined = [
                ...(reactions || []).map(r => ({ ...r, type: 'reaction' })),
                ...(comments || []).map(c => ({ ...c, type: 'comment' }))
            ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

            setFeedbacks(combined);
        } catch (err) {
            console.error('피드백 로드 실패:', err.message);
        } finally {
            setLoadingFeedback(false);
        }
    };

    const openFeedback = () => {
        setShowFeedback(true);
        fetchFeedbacks();
    };

    return (
        <Card style={{ maxWidth: '600px', background: '#FFFDF7', border: '2px solid #FFE082' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem' }}>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{
                        background: '#FFE082',
                        color: '#795548',
                        padding: '6px 16px',
                        borderRadius: '20px',
                        fontSize: '0.9rem',
                        fontWeight: 'bold',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                    }}>
                        🎒 {studentSession.className || '우리 반'} 친구
                    </div>
                    {hasActivity && (
                        <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={openFeedback}
                            style={{
                                background: '#FF5252',
                                color: 'white',
                                border: 'none',
                                padding: '6px 12px',
                                borderRadius: '20px',
                                fontSize: '0.8rem',
                                fontWeight: 'bold',
                                cursor: 'pointer',
                                boxShadow: '0 4px 10px rgba(255, 82, 82, 0.3)'
                            }}
                        >
                            🔔 내 글 소식
                        </motion.button>
                    )}
                </div>
                <Button variant="ghost" size="sm" onClick={onLogout}>
                    로그아웃 🚪
                </Button>
            </div>

            <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
                <div style={{ fontSize: '4rem', marginBottom: '10px' }}>🌟</div>
                <h1 style={{ fontSize: '2.4rem', color: '#5D4037', marginBottom: '0.5rem' }}>
                    안녕, <span style={{ color: '#FBC02D' }}>{studentSession.name}</span>!
                </h1>
                <p style={{ color: '#8D6E63', fontSize: '1.1rem' }}>어서와요, 오늘 어떤 이야기를 들려줄 건가요?</p>
            </div>

            {/* 포인트 표시 영역 */}
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 260, damping: 20 }}
                style={{
                    background: 'white',
                    padding: '24px',
                    borderRadius: '30px',
                    border: '3px solid #FFECB3',
                    marginBottom: '2.5rem',
                    boxShadow: '0 10px 20px rgba(255, 213, 79, 0.15)',
                    textAlign: 'center'
                }}
            >
                <div style={{ fontSize: '1.1rem', color: '#8D6E63', fontWeight: 'bold', marginBottom: '8px' }}>
                    반짝이는 포인트가 ✨
                </div>
                <motion.div
                    key={points}
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    style={{
                        fontSize: '3.5rem',
                        fontWeight: '900',
                        color: '#FBC02D',
                        textShadow: '2px 2px 0px rgba(251, 192, 45, 0.1)'
                    }}
                >
                    {points}점
                </motion.div>
                <div style={{ fontSize: '1.1rem', color: '#8D6E63', fontWeight: 'bold', marginTop: '8px' }}>
                    모였어!
                </div>
            </motion.div>

            {/* 주요 활동 메뉴 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                        background: 'white', padding: '24px', borderRadius: '24px', border: '2px solid #FFE082',
                        textAlign: 'center', cursor: 'pointer', transition: 'box-shadow 0.2s', position: 'relative',
                        boxShadow: '0 4px 6px rgba(255, 224, 130, 0.2)'
                    }}
                    onClick={() => onNavigate('mission_list')}
                >
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📝</div>
                    <h3 style={{ margin: 0, color: '#5D4037' }}>글쓰기 미션</h3>
                    <p style={{ fontSize: '0.85rem', color: '#9E9E9E', marginTop: '8px' }}>선생님의 주제 확인</p>
                </motion.div>

                <motion.div
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    style={{
                        background: 'white', padding: '24px', borderRadius: '24px', border: '2px solid #FFE082',
                        textAlign: 'center', cursor: 'pointer', transition: 'box-shadow 0.2s', position: 'relative',
                        boxShadow: '0 4px 6px rgba(255, 224, 130, 0.2)'
                    }}
                    onClick={() => onNavigate('friends_hideout')}
                >
                    {hasActivity && (
                        <div style={{
                            position: 'absolute', top: '15px', right: '15px',
                            width: '12px', height: '12px', background: '#FF5252',
                            borderRadius: '50%', border: '2px solid white',
                            boxShadow: '0 0 10px rgba(255, 82, 82, 0.5)'
                        }} />
                    )}
                    <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>👀</div>
                    <h3 style={{ margin: 0, color: '#5D4037' }}>친구 아지트</h3>
                    <p style={{ fontSize: '0.85rem', color: '#9E9E9E', marginTop: '8px' }}>친구들의 글 읽기</p>
                </motion.div>
            </div>

            <div style={{
                marginTop: '24px', padding: '20px', background: '#FDFCF0',
                borderRadius: '20px', textAlign: 'center', border: '1px dashed #FFE082'
            }}>
                <p style={{ margin: 0, color: '#9E9E9E', fontSize: '0.9rem' }}>
                    🚩 오늘의 목표: 멋진 글 완성하고 포인트 더 받기!
                </p>
            </div>

            {/* 피드백 모아보기 모달 */}
            {showFeedback && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    background: 'rgba(0,0,0,0.5)', zIndex: 2000,
                    display: 'flex', justifyContent: 'center', alignItems: 'center',
                    padding: '20px'
                }} onClick={() => setShowFeedback(false)}>
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        style={{
                            background: 'white',
                            width: '100%',
                            maxWidth: '500px',
                            maxHeight: '80vh',
                            borderRadius: '32px',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 20px 60px rgba(0,0,0,0.2)'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '24px', borderBottom: '1px solid #EEE', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1.2rem', color: '#5D4037' }}>🔔 내 글 소식</h3>
                            <button onClick={() => setShowFeedback(false)} style={{ border: 'none', background: 'none', fontSize: '1.2rem', cursor: 'pointer' }}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                            {loadingFeedback ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#9E9E9E' }}>소식을 가져오고 있어요... 🏃‍♂️</div>
                            ) : feedbacks.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px', color: '#9E9E9E' }}>
                                    <div style={{ fontSize: '3rem', marginBottom: '16px' }}>📭</div>
                                    아직 새로운 소식이 없어요.
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    {feedbacks.map((f, idx) => (
                                        <div
                                            key={f.id || idx}
                                            style={{
                                                padding: '16px',
                                                background: '#F9F9F9',
                                                borderRadius: '20px',
                                                border: '1px solid #F1F1F1',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s'
                                            }}
                                            onClick={() => {
                                                setShowFeedback(false);
                                                onNavigate('friends_hideout', { initialPostId: f.post_id || f.student_posts?.id });
                                            }}
                                            onMouseEnter={e => {
                                                e.currentTarget.style.background = '#F0F7FF';
                                                e.currentTarget.style.borderColor = '#D0E1F9';
                                            }}
                                            onMouseLeave={e => {
                                                e.currentTarget.style.background = '#F9F9F9';
                                                e.currentTarget.style.borderColor = '#F1F1F1';
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
                                                    {f.students?.name} 친구가 {f.type === 'reaction' ? '리액션을 남겼어요!' : '댓글을 남겼어요!'}
                                                </span>
                                            </div>
                                            <div style={{ fontSize: '0.85rem', color: '#9E9E9E', marginBottom: '4px' }}>
                                                글 제목: "{f.student_posts?.title}"
                                            </div>
                                            {f.type === 'comment' && (
                                                <div style={{
                                                    fontSize: '0.9rem', color: '#795548', background: 'white',
                                                    padding: '8px 12px', borderRadius: '12px', marginTop: '6px',
                                                    border: '1px solid #EEE'
                                                }}>
                                                    {f.content}
                                                </div>
                                            )}
                                            <div style={{ fontSize: '0.75rem', color: '#BDBDBD', marginTop: '8px', textAlign: 'right' }}>
                                                {new Date(f.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </div>
            )}
        </Card>
    );
};

export default StudentDashboard;

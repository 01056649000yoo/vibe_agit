import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabaseClient';
import { usePostInteractions } from '../../hooks/usePostInteractions';
import Button from '../common/Button';

const PostDetailModal = ({ post, mission, studentSession, onClose, reactionIcons, isMobile, ACCESSORIES }) => {
    const [commentInput, setCommentInput] = useState('');
    const [submittingComment, setSubmittingComment] = useState(false);
    const [editingCommentId, setEditingCommentId] = useState(null);
    const [isTeacher, setIsTeacher] = useState(false);

    const {
        reactions,
        comments,
        handleReaction,
        addComment,
        updateComment,
        deleteComment
    } = usePostInteractions(post.id, studentSession?.id);

    useEffect(() => {
        const checkTeacher = async () => {
            const { data } = await supabase.auth.getSession();
            if (data?.session?.user?.user_metadata?.user_type === 'teacher') setIsTeacher(true);
        };
        checkTeacher();
    }, []);

    useEffect(() => {
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
            if (editingCommentId) {
                const success = await updateComment(editingCommentId, commentInput);
                if (success) {
                    setEditingCommentId(null);
                    setCommentInput('');
                    alert('댓글이 수정되었습니다! ✨');
                }
            } else {
                const alreadyCommented = comments.some(c => c.student_id === studentSession?.id);
                if (alreadyCommented) {
                    alert('댓글은 하나만 작성할 수 있어요! 기존 댓글을 수정해 주세요! ✍️');
                    setSubmittingComment(false);
                    return;
                }

                const success = await addComment(commentInput);
                if (success) {
                    if (studentSession?.id) {
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
                    }
                    setCommentInput('');
                    alert('댓글을 남기고 5포인트를 받았어요! ✨');
                }
            }
        } catch (err) {
            console.error('댓글 작업 실패:', err.message);
        } finally {
            setSubmittingComment(false);
        }
    };

    const handleEditComment = (comment) => {
        setEditingCommentId(comment.id);
        setCommentInput(comment.content);
    };

    const handleDeleteCommentClick = async (commentId) => {
        if (!confirm('정말 이 댓글을 삭제할까요?')) return;
        const success = await deleteComment(commentId);
        if (success) {
            alert('댓글이 삭제되었습니다.');
            if (editingCommentId === commentId) {
                setEditingCommentId(null);
                setCommentInput('');
            }
        }
    };

    const getReactionCount = (type) => reactions.filter(r => r.reaction_type === type).length;

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
                zIndex: 3000,
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
                {/* 헤더 섹션 */}
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

                    {/* 반응 섹션 */}
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
                                >
                                    <span style={{ fontSize: isMobile ? '1.2rem' : '1.4rem' }}>{icon.emoji}</span>
                                    <span style={{ fontSize: '0.7rem', fontWeight: 'bold', color: isMine ? '#3498DB' : '#7F8C8D', letterSpacing: '-0.03em' }}>
                                        {icon.label}
                                    </span>
                                    <span style={{ fontSize: '0.85rem', fontWeight: '900', color: isMine ? '#2980B9' : '#ADB5BD' }}>
                                        {getReactionCount(icon.type)}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* 댓글 섹션 */}
                    <div style={{ borderTop: '2px solid #F1F3F5', paddingTop: '48px' }}>
                        <h4 style={{ margin: '0 0 24px 0', fontSize: '1.25rem', fontWeight: '900', color: '#2D3436' }}>
                            💬 친구들의 따뜻한 한마디
                        </h4>

                        {mission?.allow_comments === false ? (
                            <div style={{ textAlign: 'center', padding: '40px', background: '#F8F9FA', borderRadius: '24px', border: '1px solid #E9ECEF', color: '#95A5A6', fontWeight: 'bold' }}>
                                <span style={{ fontSize: '1.5rem', display: 'block', marginBottom: '8px' }}>🔒</span>
                                선생님이 댓글창을 닫아두셨어요.
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
                                            <div key={c.id} style={{ padding: '20px 24px', background: (c.student_id === studentSession?.id) ? '#E3F2FD' : '#F8F9FA', borderRadius: '24px', border: (c.student_id === studentSession?.id) ? '1px solid #BBDEFB' : '1px solid #F1F3F5', position: 'relative' }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                    <div style={{ fontWeight: '900', fontSize: '0.9rem', color: (c.student_id === studentSession?.id) ? '#1976D2' : '#3498DB' }}>
                                                        {c.students?.name} {(c.student_id === studentSession?.id) && '(나)'}
                                                    </div>
                                                    <div style={{ display: 'flex', gap: '8px' }}>
                                                        {(c.student_id === studentSession?.id) && (
                                                            <button onClick={() => handleEditComment(c)} style={{ background: 'none', border: 'none', color: '#7F8C8D', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>수정</button>
                                                        )}
                                                        {((c.student_id === studentSession?.id) || isTeacher) && (
                                                            <button onClick={() => handleDeleteCommentClick(c.id)} style={{ background: 'none', border: 'none', color: '#E74C3C', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 'bold' }}>삭제</button>
                                                        )}
                                                    </div>
                                                </div>
                                                <div style={{ fontSize: '1.05rem', color: '#2D3436', lineHeight: '1.7' }}>{c.content}</div>
                                            </div>
                                        ))
                                    )}
                                </div>

                                <form onSubmit={handleCommentSubmit} style={{ display: 'flex', gap: '14px', background: 'white', padding: '10px', borderRadius: '22px', border: editingCommentId ? '2px solid #3498DB' : '2px solid #F1F3F5', boxShadow: '0 8px 16px rgba(0,0,0,0.04)' }}>
                                    <input
                                        type="text"
                                        value={commentInput}
                                        onChange={e => setCommentInput(e.target.value)}
                                        placeholder={editingCommentId ? "댓글을 수정하고 있어요..." : "따뜻한 응원을 남겨주세요... (댓글 쓰면 5P!) ✨"}
                                        style={{ flex: 1, padding: '14px 20px', border: 'none', outline: 'none', fontSize: '1.05rem', color: '#2D3436' }}
                                    />
                                    {editingCommentId && (
                                        <Button type="button" variant="ghost" size="sm" onClick={() => { setEditingCommentId(null); setCommentInput(''); }}>취소</Button>
                                    )}
                                    <Button type="submit" size="sm" style={{ borderRadius: '16px', padding: '0 24px', fontWeight: '900' }} disabled={submittingComment}>
                                        {editingCommentId ? '수정' : '보내기'}
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

export default PostDetailModal;

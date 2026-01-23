import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';

const PostDetailViewer = ({
    selectedPost, setSelectedPost, selectedMission,
    handleRequestRewrite, handleApprovePost, handleRecovery,
    handleGenerateSingleAI, tempFeedback, setTempFeedback,
    isGenerating, showCompleteToast, postReactions, postComments,
    reactionIcons, isMobile
}) => {
    const textareaRef = useRef(null);
    const [showOriginal, setShowOriginal] = useState(false);

    // 자동 높이 조절
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [tempFeedback, selectedPost]);

    return (
        <AnimatePresence>
            {selectedPost && (
                <motion.div
                    initial={{ opacity: 0, x: '100%' }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: '100%' }}
                    transition={{ type: 'spring', damping: 25, stiffness: 200 }}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'white', zIndex: 1100,
                        display: 'flex', flexDirection: 'column',
                        boxSizing: 'border-box'
                    }}
                >
                    <header style={{
                        padding: '16px 20px', borderBottom: '1px solid #F1F3F5',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        flexShrink: 0
                    }}>
                        <button
                            onClick={() => setSelectedPost(null)}
                            style={{
                                backgroundColor: '#F8F9FA', border: 'none', padding: '8px 16px',
                                borderRadius: '12px', fontSize: '0.9rem', fontWeight: 'bold',
                                color: '#495057', cursor: 'pointer'
                            }}
                        >
                            ← 뒤로가기
                        </button>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '0.8rem', color: '#95A5A6', fontWeight: 'bold' }}>{selectedMission?.title}</div>
                            <div style={{ fontSize: '1rem', color: '#2C3E50', fontWeight: '900' }}>{selectedPost.students?.name} 학생의 글</div>
                        </div>
                        <div style={{ display: 'flex', gap: '8px' }}>
                            {selectedPost.is_submitted && !selectedPost.is_confirmed && (
                                <>
                                    <Button
                                        onClick={() => handleRequestRewrite(selectedPost)}
                                        style={{
                                            backgroundColor: '#FFF3E0', color: '#E65100', border: '1px solid #FFE0B2',
                                            padding: '8px 12px', fontSize: '0.85rem', fontWeight: 'bold'
                                        }}
                                    >
                                        ♻️ 다시 쓰기 요청
                                    </Button>
                                    <Button
                                        onClick={() => handleApprovePost(selectedPost)}
                                        style={{
                                            backgroundColor: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9',
                                            padding: '8px 12px', fontSize: '0.85rem', fontWeight: 'bold'
                                        }}
                                    >
                                        ✅ 승인 및 포인트 지급
                                    </Button>
                                </>
                            )}
                            {selectedPost.is_confirmed && (
                                <Button
                                    onClick={() => handleRecovery(selectedPost)}
                                    style={{
                                        backgroundColor: '#FFEBEE', color: '#C62828', border: '1px solid #FFCDD2',
                                        padding: '8px 12px', fontSize: '0.85rem', fontWeight: 'bold'
                                    }}
                                >
                                    ⚠️ 승인 취소 & 포인트 회수
                                </Button>
                            )}
                        </div>
                    </header>

                    <main style={{
                        flex: 1, overflowY: 'auto', padding: isMobile ? '24px 20px' : '40px',
                        maxWidth: '1200px', margin: '0 auto', width: '100%', boxSizing: 'border-box',
                        display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '6fr 4fr', gap: '40px'
                    }}>
                        <div>
                            <h2 style={{
                                fontSize: isMobile ? '1.5rem' : '2rem',
                                color: '#2C3E50', fontWeight: '900',
                                marginBottom: '24px', lineHeight: '1.4',
                                borderLeft: '6px solid #FBC02D', paddingLeft: '20px',
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                            }}>
                                <div>
                                    {showOriginal ? (selectedPost.original_title || selectedPost.title) : (selectedPost.title || '제목 없음')}
                                    {showOriginal && <span style={{ fontSize: '0.9rem', color: '#E67E22', marginLeft: '12px', background: '#FFF3E0', padding: '2px 8px', borderRadius: '6px' }}>최초 제출본</span>}
                                </div>
                                {selectedPost.original_content && (
                                    <button
                                        onClick={() => setShowOriginal(!showOriginal)}
                                        style={{
                                            fontSize: '0.85rem', padding: '6px 12px', borderRadius: '10px',
                                            border: showOriginal ? '2px solid #3498DB' : '1px solid #DEE2E6',
                                            background: showOriginal ? '#EBF5FB' : 'white',
                                            color: showOriginal ? '#3498DB' : '#7F8C8D',
                                            fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s'
                                        }}
                                    >
                                        {showOriginal ? '✨ 최신글 보기' : '📜 최초글 비교하기'}
                                    </button>
                                )}
                            </h2>
                            <div style={{
                                fontSize: isMobile ? '1.1rem' : '1.25rem',
                                color: showOriginal ? '#7F8C8D' : '#444',
                                lineHeight: '1.8',
                                whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                paddingBottom: '40px',
                                transition: 'color 0.2s'
                            }}>
                                {showOriginal ? (selectedPost.original_content || '기록된 최초 내용이 없습니다.') : selectedPost.content}
                            </div>

                            <div style={{ borderTop: '2px solid #F1F3F5', paddingTop: '40px', marginTop: '20px' }}>
                                <div style={{ marginBottom: '48px' }}>
                                    <h4 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#2C3E50', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        🌈 친구들의 반응 현황
                                    </h4>
                                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                        {reactionIcons.map(icon => {
                                            const count = postReactions.filter(r => r.reaction_type === icon.type).length;
                                            return (
                                                <div key={icon.type} style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                    padding: '10px 20px', background: '#F8F9FA', borderRadius: '16px',
                                                    border: '1px solid #ECEFF1', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                                }}>
                                                    <span style={{ fontSize: '1.4rem' }}>{icon.emoji}</span>
                                                    <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#546E7A' }}>{icon.label}</span>
                                                    <span style={{ fontSize: '1rem', fontWeight: '900', color: '#3498DB' }}>{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div>
                                    <h4 style={{ fontSize: '1.2rem', fontWeight: '900', color: '#2C3E50', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        💬 친구들의 따뜻한 응원 ({postComments.length})
                                    </h4>
                                    {postComments.length === 0 ? (
                                        <div style={{ padding: '40px', textAlign: 'center', color: '#94A3B8', background: '#F8F9FA', borderRadius: '24px', border: '2px dashed #E2E8F0' }}>
                                            아직 작성된 댓글이 없습니다.
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {postComments.map(comment => (
                                                <div key={comment.id} style={{ padding: '20px 24px', background: '#F8F9FA', borderRadius: '24px', border: '1px solid #F1F3F5' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                                        <span style={{ fontWeight: '900', fontSize: '1rem', color: '#3498DB' }}>{comment.students?.name}</span>
                                                        <span style={{ fontSize: '0.8rem', color: '#94A3B8' }}>{new Date(comment.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                                                    </div>
                                                    <div style={{ fontSize: '1.05rem', color: '#334155', lineHeight: '1.7' }}>{comment.content}</div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <aside style={{
                            display: 'flex', flexDirection: 'column',
                            position: isMobile ? 'static' : 'sticky',
                            top: '20px',
                            height: isMobile ? 'auto' : 'calc(100vh - 180px)',
                            minHeight: isMobile ? '400px' : '0'
                        }}>
                            <div style={{
                                background: '#F8F9FA', borderRadius: '24px', padding: '24px',
                                border: '1px solid #E9ECEF', boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                display: 'flex', flexDirection: 'column', flex: 1,
                                overflow: 'hidden'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                    <h4 style={{ margin: 0, color: '#2C3E50', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        📝 선생님의 피드백
                                    </h4>
                                    <Button
                                        onClick={handleGenerateSingleAI}
                                        disabled={isGenerating}
                                        style={{
                                            backgroundColor: '#3498DB', color: 'white', padding: '6px 12px',
                                            fontSize: '0.8rem', borderRadius: '10px'
                                        }}
                                    >
                                        {isGenerating ? '✨ 분석 중...' : '✨ AI 피드백 생성'}
                                    </Button>
                                </div>
                                <div style={{ position: 'relative', flex: 1, display: 'flex', flexDirection: 'column' }}>
                                    <textarea
                                        ref={textareaRef}
                                        value={tempFeedback}
                                        onChange={(e) => setTempFeedback(e.target.value)}
                                        placeholder="AI 선생님의 도움을 받거나 직접 따뜻한 조언을 남겨주세요..."
                                        style={{
                                            width: '100%', flex: 1, minHeight: '150px', padding: '24px',
                                            borderRadius: '20px', border: '1px solid #E0E4E8',
                                            fontSize: '1.1rem', lineHeight: '2', outline: 'none',
                                            resize: 'none', transition: 'all 0.1s', color: '#2C3E50',
                                            backgroundColor: '#fff',
                                            overflowY: 'auto',
                                            fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
                                            letterSpacing: '-0.01em',
                                            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                                        }}
                                        onFocus={e => e.target.style.borderColor = '#3498DB'}
                                        onBlur={e => e.target.style.borderColor = '#E0E4E8'}
                                    />

                                    <AnimatePresence>
                                        {isGenerating && (
                                            <motion.div
                                                initial={{ opacity: 0 }}
                                                animate={{ opacity: 1 }}
                                                exit={{ opacity: 0 }}
                                                style={{
                                                    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                                    background: 'rgba(255, 255, 255, 0.85)',
                                                    backdropFilter: 'blur(4px)',
                                                    display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                                    borderRadius: '20px', zIndex: 10, textAlign: 'center', padding: '20px'
                                                }}
                                            >
                                                <motion.div
                                                    animate={{
                                                        scale: [1, 1.2, 1],
                                                        rotate: [0, 10, -10, 0]
                                                    }}
                                                    transition={{ duration: 2, repeat: Infinity }}
                                                    style={{ fontSize: '3rem', marginBottom: '20px' }}
                                                >
                                                    🤖
                                                </motion.div>
                                                <h3 style={{ margin: '0 0 10px 0', color: '#2C3E50', fontWeight: '900', fontSize: '1.2rem' }}>
                                                    AI 선생님이 분석 중입니다...
                                                </h3>
                                                <p style={{ margin: 0, color: '#64748B', fontSize: '0.95rem', lineHeight: '1.5' }}>
                                                    문맥과 맞춤법을 꼼꼼히 읽고 있어요.<br />
                                                    잠시만 기다려주세요! (약 10~15초 소요)
                                                </p>
                                                <motion.div
                                                    style={{
                                                        marginTop: '20px', width: '100px', height: '4px',
                                                        background: '#E2E8F0', borderRadius: '2px', overflow: 'hidden'
                                                    }}
                                                >
                                                    <motion.div
                                                        animate={{ x: [-100, 100] }}
                                                        transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }}
                                                        style={{ width: '40px', height: '100%', background: '#3498DB' }}
                                                    />
                                                </motion.div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    <AnimatePresence>
                                        {showCompleteToast && (
                                            <motion.div
                                                initial={{ opacity: 0, y: 20 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                exit={{ opacity: 0, y: -20 }}
                                                style={{
                                                    position: 'absolute', bottom: '20px', left: '50%', transform: 'translateX(-50%)',
                                                    background: '#2D3436', color: 'white', padding: '12px 24px',
                                                    borderRadius: '30px', fontWeight: 'bold', fontSize: '0.9rem',
                                                    display: 'flex', alignItems: 'center', gap: '8px', zIndex: 20,
                                                    boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'
                                                }}
                                            >
                                                <span>✅ AI 피드백이 완료되었습니다!</span>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                                <p style={{ margin: '12px 0 0 0', fontSize: '0.8rem', color: '#95A5A6', textAlign: 'center' }}>
                                    * 피드백은 [다시 쓰기] 또는 [승인] 요청 시 학생에게 전달됩니다.
                                </p>
                            </div>
                        </aside>
                    </main>

                    <footer style={{
                        padding: '20px', borderTop: '1px solid #F1F3F5',
                        textAlign: 'center', color: '#95A5A6', fontSize: '0.85rem'
                    }}>
                        글자 수: {selectedPost.char_count}자 | 제출 시간: {new Date(selectedPost.created_at).toLocaleString()}
                    </footer>
                </motion.div>
            )
            }
        </AnimatePresence >
    );
};

export default PostDetailViewer;

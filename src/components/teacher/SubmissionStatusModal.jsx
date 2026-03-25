import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';

const SubmissionStatusModal = ({
    selectedMission, setSelectedMission, posts, loadingPosts,
    handleBulkAIAction, handleBulkApprove, handleBulkRecovery,
    handleBulkRequestRewrite, setSelectedPost, setTempFeedback, isGenerating, isMobile
}) => {
    const [isCollectViewOpen, setIsCollectViewOpen] = React.useState(false);
    const [isReactionViewOpen, setIsReactionViewOpen] = React.useState(false);

    // [성능 최적화] 지연 렌더링을 위한 표시 개수 상태
    const [mainDisplayLimit, setMainDisplayLimit] = React.useState(20);
    const [collectDisplayLimit, setCollectDisplayLimit] = React.useState(10);
    const [reactionDisplayLimit, setReactionDisplayLimit] = React.useState(12);

    const reactionIcons = [
        { type: 'heart', label: '좋아요', emoji: '❤️' },
        { type: 'laugh', label: '재밌어요', emoji: '😂' },
        { type: 'wow', label: '멋져요', emoji: '👏' },
        { type: 'bulb', label: '배워요', emoji: '💡' },
        { type: 'star', label: '최고야', emoji: '✨' }
    ];

    return (
        <AnimatePresence>
            {selectedMission && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        background: 'rgba(0,0,0,0.5)', zIndex: 1000,
                        display: 'flex', justifyContent: 'center', alignItems: 'center',
                        padding: '20px', boxSizing: 'border-box'
                    }}
                    onClick={() => setSelectedMission(null)}
                >
                    <motion.div
                        initial={{ scale: 0.9, y: 20 }}
                        animate={{ scale: 1, y: 0 }}
                        exit={{ scale: 0.9, y: 20 }}
                        style={{
                            background: 'white', borderRadius: '28px',
                            width: '100%', maxWidth: '1100px', maxHeight: '95vh',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '24px', borderBottom: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: '#1976D2', background: '#E3F2FD', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{selectedMission.genre}</span>
                                <h4 style={{ margin: '8px 0 0 0', fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900' }}>{selectedMission.title} ({posts.length}명)</h4>
                            </div>
                            <button onClick={() => setSelectedMission(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '24px', background: '#FAFAFA' }}>
                            {loadingPosts ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>글을 불러오고 있어요...</div>
                            ) : posts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '60px', color: '#95A5A6' }}>제출된 글이 없습니다.</div>
                            ) : (
                                <>
                                    {/* 일괄 동작 영역 */}
                                    <div style={{ display: 'flex', gap: '8px', padding: '0 0 16px 0', borderBottom: '1px dashed #EEE', marginBottom: '8px', flexWrap: 'wrap' }}>
                                        {/* Row 1: 모아보기 버튼들 */}
                                        <Button
                                            onClick={() => setIsCollectViewOpen(true)}
                                            style={{
                                                flex: '1 1 48%',
                                                backgroundColor: '#EEF2FF',
                                                color: '#4F46E5',
                                                border: '2px solid #C3DAFE',
                                                fontWeight: '900',
                                                fontSize: '0.85rem',
                                                padding: '12px 8px'
                                            }}
                                        >
                                            📂 학생 글 모아보기 ✨
                                        </Button>

                                        <Button
                                            onClick={() => setIsReactionViewOpen(true)}
                                            style={{
                                                flex: '1 1 48%',
                                                backgroundColor: '#FFFBEB',
                                                color: '#D97706',
                                                border: '2px solid #FCD34D',
                                                fontWeight: '900',
                                                fontSize: '0.85rem',
                                                padding: '12px 8px'
                                            }}
                                        >
                                            📊 학생 반응 모아보기 ✨
                                        </Button>

                                        {/* Row 2: 일괄 요청/승인 버튼들 */}
                                        {posts.some(p => p.is_submitted && !p.is_confirmed) && (
                                            <>
                                                <Button
                                                    onClick={handleBulkRequestRewrite}
                                                    disabled={isGenerating || loadingPosts}
                                                    style={{
                                                        flex: '1 1 48%',
                                                        backgroundColor: '#FFF3E0',
                                                        color: '#E65100',
                                                        border: '2px solid #FFE0B2',
                                                        fontWeight: '900',
                                                        fontSize: '0.85rem',
                                                        padding: '12px 8px'
                                                    }}
                                                >
                                                    ♻️ 일괄 다시쓰기 요청
                                                </Button>
                                                <Button
                                                    onClick={handleBulkApprove}
                                                    disabled={isGenerating || loadingPosts}
                                                    style={{
                                                        flex: '1 1 48%',
                                                        backgroundColor: '#E8F5E9',
                                                        color: '#2E7D32',
                                                        border: '2px solid #C8E6C9',
                                                        fontWeight: '900',
                                                        fontSize: '0.85rem',
                                                        padding: '12px 8px'
                                                    }}
                                                >
                                                    ✅ 일괄 승인
                                                </Button>
                                            </>
                                        )}

                                        {/* Row 3: AI 피드백 및 승인 취소 버튼들 */}
                                        <Button
                                            onClick={handleBulkAIAction}
                                            disabled={isGenerating || loadingPosts}
                                            style={{
                                                flex: '1 1 48%',
                                                backgroundColor: '#F3E5F5',
                                                color: '#7B1FA2',
                                                border: '2px solid #E1BEE7',
                                                fontWeight: '900',
                                                fontSize: '0.85rem',
                                                padding: '12px 8px'
                                            }}
                                        >
                                            {isGenerating ? '🤖 피드백 생성 중...' : '🤖 일괄 AI 피드백'}
                                        </Button>

                                        {posts.some(p => p.is_confirmed) && (
                                            <Button
                                                onClick={handleBulkRecovery}
                                                disabled={isGenerating || loadingPosts}
                                                style={{
                                                    flex: '1 1 48%',
                                                    backgroundColor: '#FFEBEE',
                                                    color: '#C62828',
                                                    border: '2px solid #FFCDD2',
                                                    fontWeight: '900',
                                                    fontSize: '0.85rem',
                                                    padding: '12px 8px'
                                                }}
                                            >
                                                ⚠️ 일괄 승인 취소/회수
                                            </Button>
                                        )}
                                    </div>

                                    {/* 지연 렌더링된 리스트 */}
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                                        gap: '20px',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}>
                                        {posts.slice(0, mainDisplayLimit).map(post => (
                                            <motion.div
                                                initial={{ opacity: 0, y: 10 }}
                                                animate={{ opacity: 1, y: 0 }}
                                                key={post.id}
                                                onClick={() => {
                                                    setSelectedPost(post);
                                                    setTempFeedback(post.ai_feedback || '');
                                                }}
                                                style={{
                                                    padding: '16px', borderRadius: '16px', background: '#F8F9FA',
                                                    border: '1px solid #E9ECEF', cursor: 'pointer',
                                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                                    transition: 'all 0.2s'
                                                }}
                                                onMouseEnter={e => e.currentTarget.style.background = '#F1F3F5'}
                                                onMouseLeave={e => e.currentTarget.style.background = '#F8F9FA'}
                                            >
                                                <div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                                        <span style={{ fontWeight: '900', color: '#2C3E50' }}>{post.students?.name}</span>
                                                        {post.is_confirmed ? (
                                                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#E8F5E9', color: '#2E7D32', borderRadius: '4px', fontWeight: 'bold' }}>✅ 지급 완료</span>
                                                        ) : post.is_submitted ? (
                                                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#E3F2FD', color: '#1565C0', borderRadius: '4px', fontWeight: 'bold' }}>⏳ 승인 대기</span>
                                                        ) : post.is_returned ? (
                                                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#FFF3E0', color: '#E65100', borderRadius: '4px', fontWeight: 'bold' }}>♻️ 다시 쓰기 중</span>
                                                        ) : (
                                                            <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: '#F1F3F5', color: '#6C757D', borderRadius: '4px', fontWeight: 'bold' }}>📝 작성 중</span>
                                                        )}
                                                    </div>
                                                    <div style={{ fontSize: '0.8rem', color: '#95A5A6' }}>
                                                        {post.char_count}자 · {new Date(post.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                </div>
                                                <div style={{ color: '#3498DB', fontWeight: 'bold', fontSize: '0.85rem' }}>읽어보기 ➔</div>
                                            </motion.div>
                                        ))}
                                    </div>

                                    {/* 더보기 버튼 */}
                                    {mainDisplayLimit < posts.length && (
                                        <div style={{ padding: '24px 0', textAlign: 'center' }}>
                                            <Button 
                                                variant="ghost" 
                                                onClick={() => setMainDisplayLimit(prev => prev + 20)}
                                                style={{ border: '1px solid #DEE2E6', color: '#607D8B' }}
                                            >
                                                학생 더 보기 ({mainDisplayLimit} / {posts.length}) 🔽
                                            </Button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </motion.div>

                    {/* [수정] 학생 글 모아보기 모달 */}
                    <AnimatePresence>
                        {isCollectViewOpen && (
                            <div style={{
                                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(0,0,0,0.6)', zIndex: 3000,
                                display: 'flex', justifyContent: 'center', alignItems: 'center',
                                padding: '20px', boxSizing: 'border-box'
                            }} onClick={() => setIsCollectViewOpen(false)}>
                                <motion.div
                                    initial={{ opacity: 0, y: 30, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 30, scale: 0.95 }}
                                    style={{
                                        background: 'white', borderRadius: '32px',
                                        width: '100%', maxWidth: '1100px', maxHeight: '92vh',
                                        display: 'flex', flexDirection: 'column', overflow: 'hidden',
                                        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                                        boxSizing: 'border-box'
                                    }}
                                    onClick={e => e.stopPropagation()}
                                >
                                    <header style={{ padding: '20px 40px', borderBottom: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <div>
                                            <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#2C3E50' }}>📂 학생 글 모아보기</h3>
                                            <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#7F8C8D' }}>한 화면에 {collectDisplayLimit}개씩 표시됩니다. (총 {posts.length}건)</p>
                                        </div>
                                        <Button onClick={() => setIsCollectViewOpen(false)} style={{ background: '#F8F9FA', color: '#495057', border: '1px solid #E9ECEF', borderRadius: '12px' }}>✕ 닫기</Button>
                                    </header>
                                    <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '16px' : '32px', background: '#FAFAFA' }}>
                                        <div style={{
                                            maxWidth: '1020px',
                                            margin: '0 auto',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '32px',
                                            width: '100%',
                                            boxSizing: 'border-box'
                                        }}>
                                            {posts.slice(0, collectDisplayLimit).map((post, idx) => (
                                                <div key={post.id} style={{
                                                    background: 'white', borderRadius: '24px', padding: '24px',
                                                    border: '1px solid #E9ECEF', boxShadow: '0 4px 12px rgba(0,0,0,0.02)',
                                                    width: '100%', boxSizing: 'border-box'
                                                }}>
                                                    <div style={{ paddingBottom: '16px', borderBottom: '1px solid #F8F9FA', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                        <span style={{ fontWeight: '900', color: '#3498DB', fontSize: '1.1rem' }}>{idx + 1}. {post.students?.name}</span>
                                                        <span style={{ fontSize: '0.85rem', color: '#95A5A6' }}>{post.char_count}자 작성</span>
                                                    </div>

                                                    <div style={{
                                                        display: 'grid',
                                                        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
                                                        gap: '24px',
                                                        width: '100%'
                                                    }}>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#10B981', marginBottom: '10px' }}>📜 처음글 (초안)</div>
                                                            <div style={{
                                                                padding: '20px', background: '#F0FDF4', borderRadius: '16px',
                                                                border: '1px solid #DCFCE7', fontSize: '0.95rem', color: '#333',
                                                                lineHeight: '1.8', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                                                            }}>{post.original_content || '기록 없음'}</div>
                                                        </div>
                                                        <div style={{ minWidth: 0 }}>
                                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#3B82F6', marginBottom: '10px' }}>✨ 마지막글 (수정본)</div>
                                                            <div style={{
                                                                padding: '20px', background: '#EFF6FF', borderRadius: '16px',
                                                                border: '1px solid #DBEAFE', fontSize: '0.95rem', color: '#333',
                                                                lineHeight: '1.8', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
                                                            }}>{post.content || '기록 없음'}</div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}

                                            {collectDisplayLimit < posts.length && (
                                                <div style={{ textAlign: 'center', paddingBottom: '40px' }}>
                                                    <Button onClick={() => setCollectDisplayLimit(prev => prev + 10)}>글 더 보기 🔽</Button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>

                    {/* [신규] 학생 반응 모아보기 모달 */}
                    <AnimatePresence>
                        {isReactionViewOpen && (
                            <motion.div
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                exit={{ opacity: 0, scale: 0.95 }}
                                style={{
                                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                    background: 'white', zIndex: 3000,
                                    display: 'flex', flexDirection: 'column',
                                    boxSizing: 'border-box'
                                }}
                                onClick={e => e.stopPropagation()}
                            >
                                <header style={{ padding: '20px 40px', borderBottom: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <div>
                                        <h3 style={{ margin: 0, fontSize: '1.5rem', fontWeight: '900', color: '#2C3E50' }}>📊 학생 반응 및 댓글 모아보기</h3>
                                        <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', color: '#7F8C8D' }}>한 화면에 {reactionDisplayLimit}개씩 표시됩니다. (총 {posts.length}건)</p>
                                    </div>
                                    <Button onClick={() => setIsReactionViewOpen(false)} style={{ background: '#F8F9FA', color: '#495057', border: '1px solid #E9ECEF', borderRadius: '12px' }}>✕ 닫기</Button>
                                </header>
                                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '20px' : '40px', background: '#FAFAFA' }}>
                                    <div style={{
                                        display: 'grid',
                                        gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(360px, 1fr))',
                                        gap: '24px',
                                        justifyContent: 'center',
                                        margin: '0 auto',
                                        maxWidth: '1200px',
                                        boxSizing: 'border-box'
                                    }}>
                                        {posts.slice(0, reactionDisplayLimit).map((post, idx) => (
                                            <div key={post.id} style={{ background: 'white', borderRadius: '20px', padding: '20px', border: '1px solid #E9ECEF', boxShadow: '0 4px 12px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column' }}>
                                                <div style={{ paddingBottom: '12px', borderBottom: '1px solid #F8F9FA', marginBottom: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexDirection: 'column', gap: '4px', width: '100%', overflow: 'hidden' }}>
                                                    <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '1rem' }}>{idx + 1}. {post.students?.name}</span>
                                                    <span style={{
                                                        fontSize: '0.8rem', color: '#7F8C8D', fontWeight: 'bold',
                                                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                                        width: '100%', display: 'block'
                                                    }} title={post.title}>「 {post.title} 」</span>
                                                </div>

                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
                                                    <div>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#3498DB', marginBottom: '8px' }}>🌈 받은 반응</div>
                                                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                                            {reactionIcons.map(icon => {
                                                                const count = post.post_reactions?.filter(r => r.reaction_type === icon.type).length || 0;
                                                                if (count === 0) return null;
                                                                return (
                                                                    <div key={icon.type} style={{
                                                                        padding: '4px 8px', background: '#F8F9FA', borderRadius: '8px',
                                                                        border: '1px solid #ECEFF1', display: 'flex', alignItems: 'center', gap: '4px'
                                                                    }}>
                                                                        <span style={{ fontSize: '1rem' }}>{icon.emoji}</span>
                                                                        <span style={{ fontWeight: '900', color: '#2C3E50', fontSize: '0.8rem' }}>{count}</span>
                                                                    </div>
                                                                );
                                                            })}
                                                            {(!post.post_reactions || post.post_reactions.length === 0) && (
                                                                <div style={{ fontSize: '0.8rem', color: '#B2BEC3' }}>반응 대기 중... 🐣</div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div style={{ flex: 1 }}>
                                                        <div style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#E67E22', marginBottom: '8px' }}>💬 작성된 댓글</div>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                            {post.post_comments && post.post_comments.length > 0 ? (
                                                                post.post_comments.slice(0, 3).map(comment => {
                                                                    const isTeacher = !!comment.teacher_id;
                                                                    return (
                                                                        <div key={comment.id} style={{
                                                                            padding: '10px 12px',
                                                                            background: isTeacher ? '#EFF6FF' : '#FFF7ED',
                                                                            borderRadius: '12px',
                                                                            border: isTeacher ? '1px solid #BFDBFE' : '1px solid #FFEDD5'
                                                                        }}>
                                                                            <div style={{ fontWeight: 'bold', color: isTeacher ? '#1E40AF' : '#C2410C', fontSize: '0.75rem', marginBottom: '2px' }}>
                                                                                {isTeacher ? '🍎 선생님' : (comment.students?.name || '친구')}
                                                                            </div>
                                                                            <div style={{ color: isTeacher ? '#1E3A8A' : '#431407', fontSize: '0.85rem', lineHeight: '1.4' }}>{comment.content}</div>
                                                                        </div>
                                                                    );
                                                                })
                                                            ) : (
                                                                <div style={{ fontSize: '0.8rem', color: '#B2BEC3', fontStyle: 'italic' }}>댓글을 기다리고 있어요 🐣</div>
                                                            )}
                                                            {post.post_comments?.length > 3 && (
                                                                <div style={{ fontSize: '0.7rem', color: '#ADB5BD', textAlign: 'center' }}>외 {post.post_comments.length - 3}개의 댓글 더 있음</div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    {reactionDisplayLimit < posts.length && (
                                        <div style={{ textAlign: 'center', padding: '40px 0' }}>
                                            <Button onClick={() => setReactionDisplayLimit(prev => prev + 12)}>반응 더 보기 🔽</Button>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SubmissionStatusModal;

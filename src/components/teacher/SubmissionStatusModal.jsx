import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';

const SubmissionStatusModal = ({
    selectedMission, setSelectedMission, posts, loadingPosts,
    handleBulkAIAction, handleBulkApprove, handleBulkRecovery,
    handleBulkRequestRewrite, setSelectedPost, setTempFeedback, isGenerating
}) => {
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
                            background: 'white', borderRadius: '24px',
                            width: '100%', maxWidth: '600px', maxHeight: '80vh',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ padding: '24px', borderBottom: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <span style={{ fontSize: '0.8rem', color: '#1976D2', background: '#E3F2FD', padding: '2px 8px', borderRadius: '6px', fontWeight: 'bold' }}>{selectedMission.genre}</span>
                                <h4 style={{ margin: '8px 0 0 0', fontSize: '1.2rem', color: '#2C3E50', fontWeight: '900' }}>{selectedMission.title}</h4>
                            </div>
                            <button onClick={() => setSelectedMission(null)} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                        </div>

                        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
                            {loadingPosts ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>데이터를 불러오는 중...</div>
                            ) : posts.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#ADB5BD' }}>아직 제출한 학생이 없습니다. 🐥</div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    {/* 일괄 동작 영역 */}
                                    <div style={{ display: 'flex', gap: '8px', padding: '0 0 16px 0', borderBottom: '1px dashed #EEE', marginBottom: '8px', flexWrap: 'wrap' }}>
                                        <Button
                                            onClick={handleBulkAIAction}
                                            disabled={isGenerating || loadingPosts}
                                            style={{
                                                flex: '1 1 100%',
                                                backgroundColor: '#F3E5F5',
                                                color: '#7B1FA2',
                                                border: '2px solid #E1BEE7',
                                                fontWeight: '900',
                                                fontSize: '0.85rem',
                                                marginBottom: '4px'
                                            }}
                                        >
                                            {isGenerating ? '🤖 피드백 생성 중...' : '🤖 일괄 AI 피드백 생성 후 다시쓰기 요청'}
                                        </Button>

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
                                                        fontSize: '0.85rem'
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
                                                        fontSize: '0.85rem'
                                                    }}
                                                >
                                                    ✅ 일괄 승인
                                                </Button>
                                            </>
                                        )}

                                        {posts.some(p => p.is_confirmed) && (
                                            <Button
                                                onClick={handleBulkRecovery}
                                                disabled={isGenerating || loadingPosts}
                                                style={{
                                                    flex: '1 1 100%',
                                                    backgroundColor: '#FFEBEE',
                                                    color: '#C62828',
                                                    border: '2px solid #FFCDD2',
                                                    fontWeight: '900',
                                                    fontSize: '0.85rem',
                                                    marginTop: '4px'
                                                }}
                                            >
                                                ⚠️ 일괄 승인 취소/회수
                                            </Button>
                                        )}
                                    </div>

                                    {posts.map(post => (
                                        <div
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
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default SubmissionStatusModal;

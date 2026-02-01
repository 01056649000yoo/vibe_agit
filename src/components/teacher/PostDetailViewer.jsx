import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import { useEvaluation } from '../../hooks/useEvaluation';

const PostDetailViewer = ({
    selectedPost, setSelectedPost, selectedMission,
    handleRequestRewrite, handleApprovePost, handleRecovery,
    handleGenerateSingleAI, tempFeedback, setTempFeedback,
    isGenerating, showCompleteToast, postReactions, postComments,
    reactionIcons, isMobile, onUpdate, isEvaluationMode, posts = []
}) => {
    const { saveEvaluation, loading: evalLoading } = useEvaluation();
    const textareaRef = useRef(null);
    const [showOriginal, setShowOriginal] = useState(false);
    const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);

    // 평가 관련 상태
    const [initialEval, setInitialEval] = useState(selectedPost?.initial_eval || null);
    const [finalEval, setFinalEval] = useState(selectedPost?.final_eval || null);
    const [evalComment, setEvalComment] = useState(selectedPost?.eval_comment || '');
    const [isFeedbackVisible, setIsFeedbackVisible] = useState(true);

    useEffect(() => {
        if (selectedPost) {
            setInitialEval(selectedPost.initial_eval);
            setFinalEval(selectedPost.final_eval);
            setEvalComment(selectedPost.eval_comment || '');
            setShowOriginal(false);
        }
    }, [selectedPost]);

    const handleSaveEval = async () => {
        const result = await saveEvaluation(selectedPost.id, {
            initial_eval: initialEval,
            final_eval: finalEval,
            eval_comment: evalComment
        });
        if (result.success) {
            alert('성취도 평가가 저장되었습니다! 📊');
            if (onUpdate) onUpdate();
        } else {
            alert('평가 저장 중 오류가 발생했습니다.');
        }
    };

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
                        display: 'flex', flexDirection: 'row',
                        boxSizing: 'border-box'
                    }}
                >
                    {/* [신규] 평가 모드 전용 학생 리스트 사이드바 */}
                    {isEvaluationMode && !isMobile && (
                        <div style={{
                            width: '280px',
                            background: '#F8F9FA',
                            borderRight: '1px solid #E9ECEF',
                            display: 'flex',
                            flexDirection: 'column',
                            flexShrink: 0
                        }}>
                            <div style={{ padding: '24px 20px', borderBottom: '1px solid #E9ECEF' }}>
                                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '900', color: '#2C3E50', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🎯 평가 명단
                                </h4>
                                <div style={{ fontSize: '0.8rem', color: '#94A3B8', marginTop: '4px' }}>제출 인원: {posts.length}명</div>
                            </div>
                            <div style={{ flex: 1, overflowY: 'auto', padding: '12px' }}>
                                {posts.map(post => (
                                    <button
                                        key={post.id}
                                        onClick={() => setSelectedPost(post)}
                                        style={{
                                            width: '100%',
                                            padding: '12px 16px',
                                            marginBottom: '8px',
                                            borderRadius: '12px',
                                            border: 'none',
                                            textAlign: 'left',
                                            cursor: 'pointer',
                                            background: selectedPost.id === post.id ? 'white' : 'transparent',
                                            boxShadow: selectedPost.id === post.id ? '0 4px 12px rgba(0,0,0,0.05)' : 'none',
                                            border: selectedPost.id === post.id ? '1px solid #3498DB' : '1px solid transparent',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'center'
                                        }}
                                    >
                                        <div>
                                            <div style={{ fontWeight: 'bold', color: selectedPost.id === post.id ? '#3498DB' : '#495057', fontSize: '0.95rem' }}>
                                                {post.students?.name}
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: '#ADB5BD', marginTop: '2px' }}>
                                                {post.char_count}자
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                            {post.final_eval != null ? (
                                                <span style={{
                                                    fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px',
                                                    background: '#E8F5E9', color: '#2E7D32', fontWeight: '900',
                                                    border: '1px solid #C8E6C9'
                                                }}>
                                                    📊 평가완료
                                                </span>
                                            ) : (
                                                <span style={{
                                                    fontSize: '0.65rem', padding: '2px 6px', borderRadius: '6px',
                                                    background: '#F8F9FA', color: '#94A3B8', fontWeight: '900',
                                                    border: '1px solid #E9ECEF'
                                                }}>
                                                    대기 중
                                                </span>
                                            )}
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                {post.is_confirmed ? (
                                                    <span style={{ fontSize: '0.8rem' }}>✅</span>
                                                ) : post.is_returned ? (
                                                    <span style={{ fontSize: '0.8rem' }}>♻️</span>
                                                ) : (
                                                    <span style={{ fontSize: '0.8rem' }}>⏳</span>
                                                )}
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
                                <div style={{ fontSize: '1rem', color: '#2C3E50', fontWeight: '900' }}>{selectedPost.students?.name} 학생의 글 {isEvaluationMode ? '평가 중' : ''}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
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
                                        ⚠️ 승인 취소/회수
                                    </Button>
                                )}
                                {selectedMission?.evaluation_rubric?.use_rubric && (
                                    <Button
                                        onClick={() => setIsEvalModalOpen(true)}
                                        style={{
                                            backgroundColor: '#2C3E50', color: 'white',
                                            padding: '8px 16px', fontSize: '0.85rem', fontWeight: 'bold',
                                            borderRadius: '12px'
                                        }}
                                    >
                                        📊 성장 평가
                                    </Button>
                                )}
                                <div style={{ width: '1px', height: '24px', background: '#F1F3F5', margin: '0 4px' }} />
                                <Button
                                    onClick={() => setIsFeedbackVisible(!isFeedbackVisible)}
                                    style={{
                                        backgroundColor: isFeedbackVisible ? '#F8F9FA' : '#3498DB',
                                        color: isFeedbackVisible ? '#4B5563' : 'white',
                                        border: '1px solid #E5E7EB',
                                        padding: '8px 16px', fontSize: '0.85rem', fontWeight: 'bold',
                                        borderRadius: '12px'
                                    }}
                                >
                                    {isFeedbackVisible ? '💬 피드백 접기' : '💬 피드백 열기'}
                                </Button>
                            </div>
                        </header>

                        <main style={{
                            flex: 1, overflowY: 'auto', padding: isMobile ? '24px 20px' : '40px',
                            maxWidth: (showOriginal || !isFeedbackVisible) ? '1600px' : '1200px',
                            margin: '0 auto', width: '100%', boxSizing: 'border-box',
                            display: 'flex', gap: '40px', transition: 'all 0.3s'
                        }}>
                            <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    marginBottom: '24px', borderBottom: '2px solid #F1F3F5', paddingBottom: '16px'
                                }}>
                                    <h2 style={{
                                        fontSize: isMobile ? '1.5rem' : '1.8rem',
                                        color: '#2C3E50', fontWeight: '900',
                                        margin: 0, lineHeight: '1.4',
                                        borderLeft: '5px solid #FBC02D', paddingLeft: '16px'
                                    }}>
                                        {showOriginal ? (selectedPost.original_title || selectedPost.title) : (selectedPost.title || '제목 없음')}
                                    </h2>
                                    {selectedPost.original_content && (
                                        <button
                                            onClick={() => setShowOriginal(!showOriginal)}
                                            style={{
                                                fontSize: '0.85rem', padding: '8px 16px', borderRadius: '12px',
                                                border: showOriginal ? '2px solid #3498DB' : '1px solid #DEE2E6',
                                                background: showOriginal ? '#EBF5FB' : 'white',
                                                color: showOriginal ? '#3498DB' : '#7F8C8D',
                                                fontWeight: 'bold', cursor: 'pointer', transition: 'all 0.2s',
                                                display: 'flex', alignItems: 'center', gap: '6px'
                                            }}
                                        >
                                            {showOriginal ? '✨ 최신글만 보기' : '📜 최초글과 비교하기'}
                                        </button>
                                    )}
                                </div>

                                {showOriginal ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '30px', flex: 1 }}>
                                        {/* Left: Original Content */}
                                        <div style={{
                                            background: '#F8F9FA', borderRadius: '24px', padding: '24px',
                                            border: '1px solid #E9ECEF', display: 'flex', flexDirection: 'column'
                                        }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#10B981', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                🌱 최초 제출 (초안)
                                            </div>
                                            <div style={{
                                                fontSize: '1.15rem', color: '#64748B', lineHeight: '1.8',
                                                whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                            }}>
                                                {selectedPost.original_content || '최초 내용 기록이 없습니다.'}
                                            </div>
                                        </div>

                                        {/* Right: Final Content */}
                                        <div style={{
                                            background: 'white', borderRadius: '24px', padding: '24px',
                                            border: '1px solid #E9ECEF', boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                                            display: 'flex', flexDirection: 'column'
                                        }}>
                                            <div style={{ fontSize: '0.85rem', fontWeight: 'bold', color: '#3B82F6', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                ✨ 최종 제출 (수정본)
                                            </div>
                                            <div style={{
                                                fontSize: '1.15rem', color: '#1F2937', lineHeight: '1.8',
                                                whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                            }}>
                                                {selectedPost.content}
                                            </div>
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{
                                        fontSize: isMobile ? '1.15rem' : '1.3rem',
                                        color: '#374151',
                                        lineHeight: '2',
                                        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                        padding: '0 10px'
                                    }}>
                                        {selectedPost.content}
                                    </div>
                                )}
                            </div>

                            {/* Sidebar Area */}
                            {isFeedbackVisible && !isMobile && (
                                <aside style={{
                                    width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column',
                                    position: 'sticky', top: '20px', height: 'fit-content'
                                }}>
                                    <div style={{
                                        background: '#F8F9FA', borderRadius: '24px', padding: '24px',
                                        border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <h4 style={{ margin: 0, color: '#1F2937', fontWeight: '900', fontSize: '1.05rem' }}>
                                                📝 선생님 피드백
                                            </h4>
                                            <Button
                                                onClick={handleGenerateSingleAI}
                                                disabled={isGenerating}
                                                style={{
                                                    backgroundColor: '#3498DB', color: 'white', padding: '6px 12px',
                                                    fontSize: '0.8rem', borderRadius: '10px'
                                                }}
                                            >
                                                {isGenerating ? '✨ 분석 중...' : '✨ AI 생성'}
                                            </Button>
                                        </div>
                                        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
                                            <textarea
                                                ref={textareaRef}
                                                value={tempFeedback}
                                                onChange={(e) => setTempFeedback(e.target.value)}
                                                placeholder="학생에게 격려와 피드백을 남겨주세요..."
                                                style={{
                                                    width: '100%', minHeight: '300px', padding: '20px',
                                                    borderRadius: '20px', border: '1px solid #D1D5DB',
                                                    fontSize: '1.1rem', lineHeight: '1.8', outline: 'none',
                                                    resize: 'none', transition: 'all 0.1s', color: '#374151',
                                                    backgroundColor: '#fff'
                                                }}
                                            />
                                            <AnimatePresence>
                                                {isGenerating && (
                                                    <motion.div
                                                        initial={{ opacity: 0 }}
                                                        animate={{ opacity: 1 }}
                                                        exit={{ opacity: 0 }}
                                                        style={{
                                                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                                            background: 'rgba(255, 255, 255, 0.9)',
                                                            display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
                                                            borderRadius: '20px', zIndex: 10, textAlign: 'center'
                                                        }}
                                                    >
                                                        <motion.div
                                                            animate={{ rotate: 360 }}
                                                            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                                                            style={{ fontSize: '2rem', marginBottom: '12px' }}
                                                        >
                                                            🤖
                                                        </motion.div>
                                                        <div style={{ fontWeight: 'bold', color: '#4B5563', fontSize: '0.9rem' }}>AI가 글을 읽는 중...</div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <p style={{ margin: '12px 0 0 0', fontSize: '0.75rem', color: '#9CA3AF', textAlign: 'center' }}>
                                            * 피드백은 학생의 [글 보관함]에서 확인 가능합니다.
                                        </p>
                                    </div>
                                </aside>
                            )}
                        </main>

                        <footer style={{
                            padding: '20px', borderTop: '1px solid #F1F3F5',
                            textAlign: 'center', color: '#95A5A6', fontSize: '0.85rem'
                        }}>
                            글자 수: {selectedPost.char_count}자 | 제출 시간: {new Date(selectedPost.created_at).toLocaleString()}
                        </footer>
                    </div>

                    {/* [신규] 성장 평가 모달 */}
                    <AnimatePresence>
                        {isEvalModalOpen && (
                            <div style={{
                                position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                                background: 'rgba(0,0,0,0.5)', zIndex: 2000,
                                display: 'flex', justifyContent: 'center', alignItems: 'center'
                            }} onClick={() => setIsEvalModalOpen(false)}>
                                <motion.div
                                    initial={{ opacity: 0, y: 20, scale: 0.95 }}
                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                    exit={{ opacity: 0, y: 20, scale: 0.95 }}
                                    onClick={e => e.stopPropagation()}
                                    style={{
                                        background: 'white', borderRadius: '32px', width: '95%', maxWidth: '900px',
                                        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column'
                                    }}
                                >
                                    <header style={{ padding: '24px 32px', borderBottom: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.4rem', fontWeight: '900', color: '#2C3E50' }}>📊 성장 및 성취도 평가</h3>
                                        <button onClick={() => setIsEvalModalOpen(false)} style={{ border: 'none', background: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#ADB5BD' }}>✕</button>
                                    </header>

                                    <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                        {/* 처음글 섹션 */}
                                        <section>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '900', color: '#10B981', background: '#ECFDF5', padding: '4px 12px', borderRadius: '8px', whiteSpace: 'nowrap' }}>📜 처음글 (초안)</div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                    {selectedMission.evaluation_rubric.levels.map(lvl => (
                                                        <button
                                                            key={lvl.score}
                                                            onClick={() => setInitialEval(lvl.score)}
                                                            style={{
                                                                padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer',
                                                                background: initialEval === lvl.score ? '#10B981' : 'white',
                                                                color: initialEval === lvl.score ? 'white' : '#64748B', fontWeight: 'bold'
                                                            }}
                                                        >
                                                            {lvl.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div style={{ padding: '24px', background: '#F8FAFC', borderRadius: '20px', border: '1px solid #E2E8F0', fontSize: '1rem', color: '#444', maxHeight: '350px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.8' }}>
                                                {selectedPost.original_content || '처음글 기록이 없습니다.'}
                                            </div>
                                        </section>

                                        {/* 화살표 및 성장 상태 */}
                                        <div style={{ textAlign: 'center', margin: '-20px 0' }}>
                                            <span style={{ fontSize: '0.9rem', marginRight: '6px', verticalAlign: 'middle' }}>👇</span>
                                            <div style={{ background: '#FFFBEB', color: '#F59E0B', display: 'inline-block', padding: '2px 10px', borderRadius: '10px', border: '1px solid #FEF3C7', fontWeight: '900', fontSize: '0.75rem', verticalAlign: 'middle' }}>
                                                {initialEval && finalEval ? (finalEval > initialEval ? '실력 쑥쑥! 🌱' : finalEval < initialEval ? '아쉬움 💡' : '유지 중 ✨') : '평가 대기 중'}
                                            </div>
                                        </div>

                                        {/* 마지막글 섹션 */}
                                        <section>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                                                <div style={{ fontSize: '0.9rem', fontWeight: '900', color: '#3B82F6', background: '#EFF6FF', padding: '4px 12px', borderRadius: '8px', whiteSpace: 'nowrap' }}>✨ 마지막글 (수정본)</div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                    {selectedMission.evaluation_rubric.levels.map(lvl => (
                                                        <button
                                                            key={lvl.score}
                                                            onClick={() => setFinalEval(lvl.score)}
                                                            style={{
                                                                padding: '6px 12px', fontSize: '0.8rem', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer',
                                                                background: finalEval === lvl.score ? '#3B82F6' : 'white',
                                                                color: finalEval === lvl.score ? 'white' : '#64748B', fontWeight: 'bold'
                                                            }}
                                                        >
                                                            {lvl.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div style={{ padding: '24px', background: '#F8FAFC', borderRadius: '20px', border: '1px solid #E2E8F0', fontSize: '1rem', color: '#333', maxHeight: '350px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.8', fontWeight: '500' }}>
                                                {selectedPost.content}
                                            </div>
                                        </section>

                                        {/* 코멘트 섹션 */}
                                        <section>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 'bold', color: '#2C3E50', marginBottom: '12px' }}>📝 선생님의 격려 코멘트</div>
                                            <textarea
                                                value={evalComment}
                                                onChange={e => setEvalComment(e.target.value)}
                                                placeholder="학생에게 전달할 따뜻한 조언이나 성취도 평가의 근거를 남겨주세요."
                                                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', fontSize: '1rem', minHeight: '100px', resize: 'none', background: '#F8FAFC', outline: 'none' }}
                                            />
                                        </section>
                                    </div>

                                    <footer style={{ padding: '24px 32px', borderTop: '1px solid #F1F3F5', display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                        <Button variant="ghost" onClick={() => setIsEvalModalOpen(false)}>취소</Button>
                                        <Button
                                            onClick={async () => {
                                                await handleSaveEval();
                                                setIsEvalModalOpen(false);
                                            }}
                                            disabled={evalLoading}
                                            style={{ background: '#2C3E50', color: 'white', fontWeight: 'bold', borderRadius: '12px', padding: '12px 30px' }}
                                        >
                                            {evalLoading ? '저장 중...' : '평가 결과 저장하기'}
                                        </Button>
                                    </footer>
                                </motion.div>
                            </div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default PostDetailViewer;

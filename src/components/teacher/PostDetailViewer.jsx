import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Button from '../common/Button';
import ModalCloseButton from '../common/ModalCloseButton';
import PromptRuleButton, { PROMPT_ACCENT } from './PromptRuleButton';
import { useEvaluation } from '../../hooks/useEvaluation';
import ReportDocument from '../../modules/writing/mission-types/report/ReportDocument';
import { isReportStructuredContent } from '../../modules/writing/mission-types/report/reportContent';
import LabOutlineReferenceCard from '../../modules/writing/references/LabOutlineReferenceCard';
import WritingPresentationModal from '../../modules/writing/presentation/WritingPresentationModal';

const PostDetailViewer = ({
    selectedPost, setSelectedPost, selectedMission,
    handleRequestRewrite, handleApprovePost, handleRecovery,
    handleGenerateSingleAI, tempFeedback, setTempFeedback,
    isGenerating, postComments,
    isMobile, onUpdate, isEvaluationMode, posts = [],
    addTeacherComment, deleteTeacherComment, handleTeacherEditPost,
    outlineReference, postDetailLoading, onRefreshPostDetail
}) => {
    const { saveEvaluation, loading: evalLoading } = useEvaluation();
    const textareaRef = useRef(null);
    const [showOriginal, setShowOriginal] = useState(false);
    const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
    const [teacherCommentInput, setTeacherCommentInput] = useState('');
    const [isSubmittingComment, setIsSubmittingComment] = useState(false);
    const [currentTeacherUid, setCurrentTeacherUid] = useState(null);
    const [isTeacherEditMode, setIsTeacherEditMode] = useState(false);
    const [editedTitle, setEditedTitle] = useState('');
    const [editedContent, setEditedContent] = useState('');
    const [isSavingTeacherEdit, setIsSavingTeacherEdit] = useState(false);
    const [presentationVersion, setPresentationVersion] = useState(null);
    const isReportPost = isReportStructuredContent(selectedPost?.structured_content);
    const outlineNotice = outlineReference ? (
        <>
            {outlineReference.selectionChangedAfterFirstSubmit && (
                <p>학생이 첫 제출 뒤 다른 개요로 교체했습니다. 현재 고정된 개요를 보여줍니다.</p>
            )}
            {outlineReference.contentChangedAfterFirstSubmit && (
                <p>첫 제출 뒤 연구소 개요가 추가로 수정되어 서버에 저장된 최신본을 보여줍니다.</p>
            )}
            {outlineReference.contentChangedAfterApproval && (
                <p>최종 승인 뒤에도 같은 개요의 내용이 수정되었습니다.</p>
            )}
            {!outlineReference.selectionChangedAfterFirstSubmit
                && !outlineReference.contentChangedAfterFirstSubmit
                && !outlineReference.contentChangedAfterApproval && (
                <p>학생이 이 글에 고정한 개요의 최신 저장 내용입니다.</p>
            )}
        </>
    ) : null;

    // 현재 교사 uid 조회
    useEffect(() => {
        import('../../lib/supabaseClient').then(({ supabase }) => {
            supabase.auth.getUser().then(({ data: { user } }) => {
                if (user) setCurrentTeacherUid(user.id);
            });
        });
    }, []);

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
            setIsTeacherEditMode(false);
            setEditedTitle(selectedPost.title || '');
            setEditedContent(selectedPost.content || '');
            setPresentationVersion(null);
        }
    }, [selectedPost]);

    const handleSaveTeacherEdit = async () => {
        if (!selectedPost || !handleTeacherEditPost || isSavingTeacherEdit) return;

        if (!editedTitle.trim()) {
            alert('제목을 입력해주세요.');
            return;
        }

        if (!editedContent.trim()) {
            alert('본문을 입력해주세요.');
            return;
        }

        setIsSavingTeacherEdit(true);
        const success = await handleTeacherEditPost(selectedPost.id, editedTitle.trim(), editedContent);
        setIsSavingTeacherEdit(false);

        if (success) {
            setIsTeacherEditMode(false);
            if (onUpdate) onUpdate();
            alert('수정본을 학생에게 보냈습니다.');
        }
    };

    const handlePresentationKeyDown = (event, version) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        setPresentationVersion(version);
    };

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
                                <h4 style={{ margin: 0, fontSize: 'var(--ui-text-lg)', fontWeight: '900', color: '#2C3E50', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    🎯 평가 명단
                                </h4>
                                <div style={{ fontSize: 'var(--ui-text-sm)', color: '#94A3B8', marginTop: '4px' }}>제출 인원: {posts.length}명</div>
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
                                            <div style={{ fontWeight: 'bold', color: selectedPost.id === post.id ? '#3498DB' : '#495057', fontSize: 'var(--ui-text-md)' }}>
                                                {post.students?.name}
                                            </div>
                                            <div style={{ fontSize: 'var(--ui-text-sm)', color: '#ADB5BD', marginTop: '2px' }}>
                                                {post.char_count}자
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px' }}>
                                            {post.final_eval != null ? (
                                                <span style={{
                                                    fontSize: 'var(--ui-text-sm)', padding: '2px 6px', borderRadius: '6px',
                                                    background: '#E8F5E9', color: '#2E7D32', fontWeight: '900',
                                                    border: '1px solid #C8E6C9'
                                                }}>
                                                    📊 평가완료
                                                </span>
                                            ) : (
                                                <span style={{
                                                    fontSize: 'var(--ui-text-sm)', padding: '2px 6px', borderRadius: '6px',
                                                    background: '#F8F9FA', color: '#94A3B8', fontWeight: '900',
                                                    border: '1px solid #E9ECEF'
                                                }}>
                                                    대기 중
                                                </span>
                                            )}
                                            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
                                                {post.is_confirmed ? (
                                                    <span style={{ fontSize: 'var(--ui-text-sm)' }}>✅</span>
                                                ) : post.is_returned ? (
                                                    <span style={{ fontSize: 'var(--ui-text-sm)' }}>♻️</span>
                                                ) : (
                                                    <span style={{ fontSize: 'var(--ui-text-sm)' }}>⏳</span>
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
                                    borderRadius: '12px', fontSize: 'var(--ui-text-md)', fontWeight: 'bold',
                                    color: '#495057', cursor: 'pointer'
                                }}
                            >
                                ← 뒤로가기
                            </button>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 'var(--ui-text-sm)', color: '#95A5A6', fontWeight: 'bold' }}>{selectedMission?.title}</div>
                                <div style={{ fontSize: 'var(--ui-text-lg)', color: '#2C3E50', fontWeight: '900' }}>{selectedPost.students?.name} 학생의 글 {isEvaluationMode ? '평가 중' : ''}</div>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                {selectedPost.is_submitted && !selectedPost.is_confirmed && (
                                    <>
                                        <Button
                                            onClick={() => handleRequestRewrite(selectedPost)}
                                            disabled={isTeacherEditMode}
                                            style={{
                                                backgroundColor: '#FFF3E0', color: '#E65100', border: '1px solid #FFE0B2',
                                                padding: '8px 12px', fontSize: 'var(--ui-text-sm)', fontWeight: 'bold',
                                                opacity: isTeacherEditMode ? 0.4 : 1,
                                                cursor: isTeacherEditMode ? 'not-allowed' : 'pointer'
                                            }}
                                        >
                                            ♻️ 다시 쓰기 요청
                                        </Button>
                                        <Button
                                            onClick={() => handleApprovePost(selectedPost)}
                                            disabled={isTeacherEditMode}
                                            style={{
                                                backgroundColor: '#E8F5E9', color: '#2E7D32', border: '1px solid #C8E6C9',
                                                padding: '8px 12px', fontSize: 'var(--ui-text-sm)', fontWeight: 'bold',
                                                opacity: isTeacherEditMode ? 0.4 : 1,
                                                cursor: isTeacherEditMode ? 'not-allowed' : 'pointer'
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
                                            padding: '8px 12px', fontSize: 'var(--ui-text-sm)', fontWeight: 'bold'
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
                                            padding: '8px 16px', fontSize: 'var(--ui-text-sm)', fontWeight: 'bold',
                                            borderRadius: '12px'
                                        }}
                                    >
                                        📊 성장 평가
                                    </Button>
                                )}
                                {!selectedPost.is_confirmed && handleTeacherEditPost && !isReportPost && (
                                    <Button
                                        onClick={() => {
                                            if (isTeacherEditMode) {
                                                setIsTeacherEditMode(false);
                                                setEditedTitle(selectedPost.title || '');
                                                setEditedContent(selectedPost.content || '');
                                            } else {
                                                setShowOriginal(false);
                                                setIsTeacherEditMode(true);
                                            }
                                        }}
                                        style={{
                                            backgroundColor: isTeacherEditMode ? '#FEF3C7' : '#EEF2FF',
                                            color: isTeacherEditMode ? '#92400E' : '#4338CA',
                                            border: isTeacherEditMode ? '1px solid #FCD34D' : '1px solid #C7D2FE',
                                            padding: '8px 12px', fontSize: 'var(--ui-text-sm)', fontWeight: 'bold'
                                        }}
                                    >
                                        {isTeacherEditMode ? '수정 모드 종료' : '수정 모드'}
                                    </Button>
                                )}
                                <div style={{ width: '1px', height: '24px', background: '#F1F3F5', margin: '0 4px' }} />
                                <Button
                                    onClick={() => setIsFeedbackVisible(!isFeedbackVisible)}
                                    style={{
                                        backgroundColor: isFeedbackVisible ? '#F8F9FA' : '#3498DB',
                                        color: isFeedbackVisible ? '#4B5563' : 'white',
                                        border: '1px solid #E5E7EB',
                                        padding: '8px 16px', fontSize: 'var(--ui-text-sm)', fontWeight: 'bold',
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
                                    {!isTeacherEditMode && selectedPost.original_content && (
                                        <button
                                            onClick={() => setShowOriginal(!showOriginal)}
                                            style={{
                                                fontSize: 'var(--ui-text-sm)', padding: '8px 16px', borderRadius: '12px',
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

                                {outlineReference && (
                                    <div style={{ marginBottom: '24px' }}>
                                        <LabOutlineReferenceCard
                                            result={outlineReference}
                                            eyebrow="학생 참고 개요"
                                            heading="학생이 참고한 최신 개요"
                                            badge="이 글에 고정됨"
                                            notice={outlineNotice}
                                            actions={onRefreshPostDetail ? (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => void onRefreshPostDetail()}
                                                    disabled={postDetailLoading}
                                                >
                                                    {postDetailLoading ? '최신 내용 확인 중…' : '최신 개요 다시 불러오기'}
                                                </Button>
                                            ) : null}
                                        />
                                    </div>
                                )}

                                {!postDetailLoading && outlineReference === null && selectedPost.mission_id && (
                                    <div style={{
                                        marginBottom: '24px', padding: '14px 16px', border: '1px dashed #CBD5E1',
                                        borderRadius: '14px', background: '#F8FAFC', color: '#64748B',
                                        fontSize: 'var(--ui-text-sm)', fontWeight: '700'
                                    }}>
                                        이 글에 고정된 연구소 개요가 없습니다.
                                    </div>
                                )}

                                {isTeacherEditMode ? (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1 }}>
                                        <div style={{
                                            background: '#FFF8E1',
                                            border: '1px solid #FDE68A',
                                            borderRadius: '18px',
                                            padding: '16px 18px',
                                            color: '#8A5A00',
                                            fontSize: 'var(--ui-text-md)',
                                            lineHeight: '1.6'
                                        }}>
                                            학생 글을 직접 다듬은 뒤 저장하면 학생 화면에서 이 수정본을 이어서 볼 수 있습니다.
                                        </div>
                                        <input
                                            type="text"
                                            value={editedTitle}
                                            onChange={(e) => setEditedTitle(e.target.value)}
                                            placeholder="수정된 제목을 입력하세요"
                                            style={{
                                                width: '100%',
                                                padding: '16px 18px',
                                                borderRadius: '18px',
                                                border: '1px solid #D1D5DB',
                                                fontSize: isMobile ? '1.2rem' : '1.4rem',
                                                fontWeight: '800',
                                                color: '#1F2937',
                                                outline: 'none',
                                                boxSizing: 'border-box'
                                            }}
                                        />
                                        <textarea
                                            value={editedContent}
                                            onChange={(e) => setEditedContent(e.target.value)}
                                            placeholder="학생에게 전달할 수정본을 입력하세요"
                                            style={{
                                                width: '100%',
                                                minHeight: isMobile ? '360px' : '520px',
                                                padding: '20px',
                                                borderRadius: '22px',
                                                border: '1px solid #D1D5DB',
                                                fontSize: isMobile ? '1.05rem' : '1.15rem',
                                                lineHeight: '1.9',
                                                color: '#374151',
                                                outline: 'none',
                                                resize: 'vertical',
                                                boxSizing: 'border-box',
                                                background: '#FFFFFF'
                                            }}
                                        />
                                        <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                                            <Button
                                                onClick={() => {
                                                    setIsTeacherEditMode(false);
                                                    setEditedTitle(selectedPost.title || '');
                                                    setEditedContent(selectedPost.content || '');
                                                }}
                                                style={{
                                                    backgroundColor: '#F8F9FA',
                                                    color: '#4B5563',
                                                    border: '1px solid #E5E7EB',
                                                    padding: '10px 16px',
                                                    fontSize: 'var(--ui-text-md)',
                                                    fontWeight: 'bold'
                                                }}
                                            >
                                                취소
                                            </Button>
                                            <Button
                                                onClick={handleSaveTeacherEdit}
                                                disabled={isSavingTeacherEdit}
                                                style={{
                                                    backgroundColor: '#2563EB',
                                                    color: 'white',
                                                    border: '1px solid #1D4ED8',
                                                    padding: '10px 18px',
                                                    fontSize: 'var(--ui-text-md)',
                                                    fontWeight: 'bold'
                                                }}
                                            >
                                                {isSavingTeacherEdit ? '저장 중...' : '수정본 저장 및 되돌려주기'}
                                            </Button>
                                        </div>
                                    </div>
                                ) : showOriginal ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '30px', flex: 1 }}>
                                        {/* Left: Original Content */}
                                        <article
                                            className="writing-presentation-trigger"
                                            role="button"
                                            tabIndex="0"
                                            aria-label="최초 제출 글 전체 화면으로 보기"
                                            onClick={() => setPresentationVersion('original')}
                                            onKeyDown={(event) => handlePresentationKeyDown(event, 'original')}
                                            style={{
                                             background: '#F8F9FA', borderRadius: '24px', padding: '24px',
                                             border: '1px solid #E9ECEF', display: 'flex', flexDirection: 'column'
                                        }}>
                                            <div className="writing-presentation-trigger__heading" style={{ fontSize: 'var(--ui-text-sm)', fontWeight: 'bold', color: '#10B981', marginBottom: '16px' }}>
                                                <span>🌱 최초 제출 (초안)</span>
                                                <span className="writing-presentation-trigger__hint">크게 보기</span>
                                            </div>
                                            <div style={{
                                                fontSize: '1.15rem', color: '#64748B', lineHeight: '1.8',
                                                whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                            }}>
                                                {selectedPost.original_content || '최초 내용 기록이 없습니다.'}
                                            </div>
                                        </article>

                                        {/* Right: Final Content */}
                                        <article
                                            className="writing-presentation-trigger"
                                            role="button"
                                            tabIndex="0"
                                            aria-label="최종 제출 글 전체 화면으로 보기"
                                            onClick={() => setPresentationVersion('final')}
                                            onKeyDown={(event) => handlePresentationKeyDown(event, 'final')}
                                            style={{
                                             background: 'white', borderRadius: '24px', padding: '24px',
                                             border: '1px solid #E9ECEF', boxShadow: '0 4px 20px rgba(0,0,0,0.03)',
                                             display: 'flex', flexDirection: 'column'
                                        }}>
                                            <div className="writing-presentation-trigger__heading" style={{ fontSize: 'var(--ui-text-sm)', fontWeight: 'bold', color: '#3B82F6', marginBottom: '16px' }}>
                                                <span>✨ 최종 제출 (수정본)</span>
                                                <span className="writing-presentation-trigger__hint">크게 보기</span>
                                            </div>
                                            <div style={{
                                                fontSize: '1.15rem', color: '#1F2937', lineHeight: '1.8',
                                                whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                            }}>
                                                {isReportPost ? (
                                                    <ReportDocument structuredContent={selectedPost.structured_content} content={selectedPost.content} compact />
                                                ) : selectedPost.content}
                                            </div>
                                        </article>
                                    </div>
                                ) : (
                                    <article
                                        className="writing-presentation-trigger"
                                        role="button"
                                        tabIndex="0"
                                        aria-label="현재 글 전체 화면으로 보기"
                                        onClick={() => setPresentationVersion('final')}
                                        onKeyDown={(event) => handlePresentationKeyDown(event, 'final')}
                                        style={{
                                         fontSize: isMobile ? '1.15rem' : '1.3rem',
                                         color: '#374151',
                                         lineHeight: '2',
                                         whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                                         padding: '18px 20px', border: '1px solid transparent', borderRadius: '20px',
                                         background: 'transparent'
                                    }}>
                                        <span className="writing-presentation-trigger__hint" style={{ display: 'table', margin: '0 0 14px auto' }}>전체 화면으로 읽기</span>
                                        {isReportPost ? (
                                            <ReportDocument structuredContent={selectedPost.structured_content} content={selectedPost.content} />
                                        ) : selectedPost.content}
                                    </article>
                                )}
                            </div>

                            {/* Sidebar Area */}
                            {isFeedbackVisible && !isMobile && (
                                <aside style={{
                                    width: '380px', flexShrink: 0, display: 'flex', flexDirection: 'column',
                                    gap: '16px',
                                    position: 'sticky', top: '20px', height: 'fit-content'
                                }}>
                                    {/* 피드백 섹션 */}
                                    <div style={{
                                        background: '#F8F9FA', borderRadius: '24px', padding: '24px',
                                        border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                        display: 'flex', flexDirection: 'column', overflow: 'hidden'
                                    }}>
                                        {/* 제목과 조작 버튼은 줄을 나눈다.
                                            한 줄에 같이 두면 기준 이름이 조금만 길어도 줄바꿈이 일어나
                                            제목까지 두 줄로 밀린다(사이드바 폭이 380px 로 좁다). */}
                                        <div style={{ marginBottom: '16px' }}>
                                            <h4 style={{ margin: '0 0 10px', color: '#1F2937', fontWeight: '900', fontSize: 'var(--ui-text-lg)' }}>
                                                📝 선생님 피드백
                                            </h4>
                                            {/* 두 버튼은 같은 규격(size="sm")·같은 강조색을 써서 한 벌로 보이게 한다.
                                                기준 버튼이 남는 폭을 차지하고 긴 이름은 말줄임표로 잘린다. */}
                                            <div style={{ display: 'flex', alignItems: 'stretch', gap: '8px' }}>
                                                <PromptRuleButton kind="feedback" style={{ flex: '1 1 auto', minWidth: 0 }} />
                                                <Button
                                                    size="sm"
                                                    onClick={handleGenerateSingleAI}
                                                    disabled={isGenerating}
                                                    style={{
                                                        flexShrink: 0, whiteSpace: 'nowrap',
                                                        background: PROMPT_ACCENT.feedback, color: 'white',
                                                        border: '1px solid transparent', boxShadow: 'none'
                                                    }}
                                                >
                                                    {isGenerating ? '✨ 분석 중…' : '✨ AI 생성'}
                                                </Button>
                                            </div>
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
                                                        <div style={{ fontWeight: 'bold', color: '#4B5563', fontSize: 'var(--ui-text-md)' }}>AI가 글을 읽는 중...</div>
                                                    </motion.div>
                                                )}
                                            </AnimatePresence>
                                        </div>
                                        <p style={{ margin: '12px 0 0 0', fontSize: 'var(--ui-text-sm)', color: '#9CA3AF', textAlign: 'center' }}>
                                            * 피드백은 학생의 [글 보관함]에서 확인 가능합니다.
                                        </p>
                                    </div>

                                    {/* 댓글 섹션 */}
                                    <div style={{
                                        background: '#F8F9FA', borderRadius: '24px', padding: '24px',
                                        border: '1px solid #E5E7EB', boxShadow: '0 4px 12px rgba(0,0,0,0.03)',
                                        display: 'flex', flexDirection: 'column', gap: '12px'
                                    }}>
                                        <h4 style={{ margin: 0, color: '#1F2937', fontWeight: '900', fontSize: 'var(--ui-text-lg)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            💬 학생 댓글
                                            <span style={{ fontSize: 'var(--ui-text-sm)', fontWeight: 'normal', color: '#9CA3AF' }}>({postComments.length}개)</span>
                                        </h4>

                                        {/* 댓글 목록 */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '280px', overflowY: 'auto' }}>
                                            {postComments.length === 0 ? (
                                                <div style={{ textAlign: 'center', color: '#ADB5BD', fontSize: 'var(--ui-text-sm)', padding: '20px 0' }}>
                                                    아직 댓글이 없습니다
                                                </div>
                                            ) : (
                                                postComments.map(comment => {
                                                    const isTeacherComment = !!comment.teacher_id;
                                                    const isMyComment = isTeacherComment && comment.teacher_id === currentTeacherUid;
                                                    return (
                                                        <div
                                                            key={comment.id}
                                                            style={{
                                                                background: isTeacherComment ? '#EFF6FF' : 'white',
                                                                border: isTeacherComment ? '1px solid #BFDBFE' : '1px solid #E9ECEF',
                                                                borderRadius: '14px',
                                                                padding: '10px 14px',
                                                                display: 'flex',
                                                                flexDirection: 'column',
                                                                gap: '4px'
                                                            }}
                                                        >
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                    {isTeacherComment ? (
                                                                        <span style={{
                                                                            fontSize: 'var(--ui-text-sm)', fontWeight: '900',
                                                                            background: '#3B82F6', color: 'white',
                                                                            padding: '2px 7px', borderRadius: '6px'
                                                                        }}>🍎 선생님</span>
                                                                    ) : (
                                                                        <span style={{ fontSize: 'var(--ui-text-sm)', fontWeight: 'bold', color: '#374151' }}>
                                                                            {comment.students?.name || '학생'}
                                                                        </span>
                                                                    )}
                                                                    <span style={{ fontSize: 'var(--ui-text-sm)', color: '#ADB5BD' }}>
                                                                        {new Date(comment.created_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                                    </span>
                                                                </div>
                                                                {(isMyComment || !isTeacherComment) && deleteTeacherComment && (
                                                                    <button
                                                                        onClick={() => deleteTeacherComment(comment.id, selectedPost.id)}
                                                                        title="댓글 삭제"
                                                                        style={{
                                                                            background: 'none', border: 'none',
                                                                            cursor: 'pointer', fontSize: 'var(--ui-text-sm)',
                                                                            color: '#CBD5E1', padding: '0 2px'
                                                                        }}
                                                                    >🗑️</button>
                                                                )}
                                                            </div>
                                                            <div style={{ fontSize: 'var(--ui-text-md)', color: '#374151', lineHeight: '1.5' }}>
                                                                {comment.content}
                                                            </div>
                                                        </div>
                                                    );
                                                })
                                            )}
                                        </div>

                                        {/* 교사 댓글 입력 */}
                                        {addTeacherComment && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid #E9ECEF', paddingTop: '12px' }}>
                                                <textarea
                                                    value={teacherCommentInput}
                                                    onChange={e => setTeacherCommentInput(e.target.value)}
                                                    placeholder="격려 댓글을 남겨주세요... 🍎"
                                                    rows={2}
                                                    style={{
                                                        width: '100%', padding: '10px 14px',
                                                        borderRadius: '12px', border: '1px solid #D1D5DB',
                                                        fontSize: 'var(--ui-text-md)', lineHeight: '1.6', outline: 'none',
                                                        resize: 'none', color: '#374151', boxSizing: 'border-box',
                                                        backgroundColor: 'white'
                                                    }}
                                                    onKeyDown={async e => {
                                                        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !isSubmittingComment) {
                                                            e.preventDefault();
                                                            if (!teacherCommentInput.trim()) return;
                                                            setIsSubmittingComment(true);
                                                            const ok = await addTeacherComment(selectedPost.id, teacherCommentInput);
                                                            if (ok) setTeacherCommentInput('');
                                                            setIsSubmittingComment(false);
                                                        }
                                                    }}
                                                />
                                                <button
                                                    disabled={!teacherCommentInput.trim() || isSubmittingComment}
                                                    onClick={async () => {
                                                        if (!teacherCommentInput.trim() || isSubmittingComment) return;
                                                        setIsSubmittingComment(true);
                                                        const ok = await addTeacherComment(selectedPost.id, teacherCommentInput);
                                                        if (ok) setTeacherCommentInput('');
                                                        setIsSubmittingComment(false);
                                                    }}
                                                    style={{
                                                        padding: '9px 0',
                                                        borderRadius: '12px',
                                                        border: 'none',
                                                        background: teacherCommentInput.trim() ? '#3B82F6' : '#E9ECEF',
                                                        color: teacherCommentInput.trim() ? 'white' : '#ADB5BD',
                                                        fontWeight: 'bold',
                                                        fontSize: 'var(--ui-text-sm)',
                                                        cursor: teacherCommentInput.trim() ? 'pointer' : 'not-allowed',
                                                        transition: 'all 0.2s'
                                                    }}
                                                >
                                                    {isSubmittingComment ? '등록 중...' : '💬 댓글 등록 (Ctrl+Enter)'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </aside>
                            )}

                        </main>

                        <footer style={{
                            padding: '20px', borderTop: '1px solid #F1F3F5',
                            textAlign: 'center', color: '#95A5A6', fontSize: 'var(--ui-text-sm)'
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
                                        <h3 style={{ margin: 0, fontSize: 'var(--ui-text-xl)', fontWeight: '900', color: '#2C3E50' }}>📊 성장 및 성취도 평가</h3>
                                        <ModalCloseButton onClick={() => setIsEvalModalOpen(false)} label="성장 및 성취도 평가 닫기" />
                                    </header>

                                    <div style={{ flex: 1, overflowY: 'auto', padding: '32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
                                        {/* 처음글 섹션 */}
                                        <section>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                                                <div style={{ fontSize: 'var(--ui-text-md)', fontWeight: '900', color: '#10B981', background: '#ECFDF5', padding: '4px 12px', borderRadius: '8px', whiteSpace: 'nowrap' }}>📜 처음글 (초안)</div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                    {selectedMission.evaluation_rubric.levels.map(lvl => (
                                                        <button
                                                            key={lvl.score}
                                                            onClick={() => setInitialEval(lvl.score)}
                                                            style={{
                                                                padding: '6px 12px', fontSize: 'var(--ui-text-sm)', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer',
                                                                background: initialEval === lvl.score ? '#10B981' : 'white',
                                                                color: initialEval === lvl.score ? 'white' : '#64748B', fontWeight: 'bold'
                                                            }}
                                                        >
                                                            {lvl.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div style={{ padding: '24px', background: '#F8FAFC', borderRadius: '20px', border: '1px solid #E2E8F0', fontSize: 'var(--ui-text-lg)', color: '#444', maxHeight: '350px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.8' }}>
                                                {selectedPost.original_content || '처음글 기록이 없습니다.'}
                                            </div>
                                        </section>

                                        {/* 화살표 및 성장 상태 */}
                                        <div style={{ textAlign: 'center', margin: '-20px 0' }}>
                                            <span style={{ fontSize: 'var(--ui-text-md)', marginRight: '6px', verticalAlign: 'middle' }}>👇</span>
                                            <div style={{ background: '#FFFBEB', color: '#F59E0B', display: 'inline-block', padding: '2px 10px', borderRadius: '10px', border: '1px solid #FEF3C7', fontWeight: '900', fontSize: 'var(--ui-text-sm)', verticalAlign: 'middle' }}>
                                                {initialEval && finalEval ? (finalEval > initialEval ? '실력 쑥쑥! 🌱' : finalEval < initialEval ? '아쉬움 💡' : '유지 중 ✨') : '평가 대기 중'}
                                            </div>
                                        </div>

                                        {/* 마지막글 섹션 */}
                                        <section>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '12px' }}>
                                                <div style={{ fontSize: 'var(--ui-text-md)', fontWeight: '900', color: '#3B82F6', background: '#EFF6FF', padding: '4px 12px', borderRadius: '8px', whiteSpace: 'nowrap' }}>✨ 마지막글 (수정본)</div>
                                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                    {selectedMission.evaluation_rubric.levels.map(lvl => (
                                                        <button
                                                            key={lvl.score}
                                                            onClick={() => setFinalEval(lvl.score)}
                                                            style={{
                                                                padding: '6px 12px', fontSize: 'var(--ui-text-sm)', borderRadius: '8px', border: '1px solid #E2E8F0', cursor: 'pointer',
                                                                background: finalEval === lvl.score ? '#3B82F6' : 'white',
                                                                color: finalEval === lvl.score ? 'white' : '#64748B', fontWeight: 'bold'
                                                            }}
                                                        >
                                                            {lvl.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div style={{ padding: '24px', background: '#F8FAFC', borderRadius: '20px', border: '1px solid #E2E8F0', fontSize: 'var(--ui-text-lg)', color: '#333', maxHeight: '350px', overflowY: 'auto', whiteSpace: 'pre-wrap', lineHeight: '1.8', fontWeight: '500' }}>
                                                {isReportPost ? (
                                                    <ReportDocument structuredContent={selectedPost.structured_content} content={selectedPost.content} compact />
                                                ) : selectedPost.content}
                                            </div>
                                        </section>

                                        {/* 코멘트 섹션 */}
                                        <section>
                                            <div style={{ fontSize: 'var(--ui-text-md)', fontWeight: 'bold', color: '#2C3E50', marginBottom: '12px' }}>📝 선생님의 격려 코멘트</div>
                                            <textarea
                                                value={evalComment}
                                                onChange={e => setEvalComment(e.target.value)}
                                                placeholder="학생에게 전달할 따뜻한 조언이나 성취도 평가의 근거를 남겨주세요."
                                                style={{ width: '100%', padding: '16px', borderRadius: '16px', border: '1px solid #E2E8F0', fontSize: 'var(--ui-text-lg)', minHeight: '100px', resize: 'none', background: '#F8FAFC', outline: 'none' }}
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
                    <WritingPresentationModal
                        isOpen={presentationVersion !== null}
                        onClose={() => setPresentationVersion(null)}
                        title={presentationVersion === 'original'
                            ? (selectedPost.original_title || selectedPost.title)
                            : selectedPost.title}
                        studentName={selectedPost.students?.name}
                        versionLabel={presentationVersion === 'original'
                            ? '🌱 최초 제출 (초안)'
                            : '✨ 최종 제출 (수정본)'}
                    >
                        {presentationVersion === 'final' && isReportPost ? (
                            <ReportDocument
                                structuredContent={selectedPost.structured_content}
                                content={selectedPost.content}
                            />
                        ) : presentationVersion === 'original'
                            ? (selectedPost.original_content || '최초 내용 기록이 없습니다.')
                            : (selectedPost.content || '내용이 없습니다.')}
                    </WritingPresentationModal>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default PostDetailViewer;

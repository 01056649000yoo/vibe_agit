import React from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

const MissionForm = ({
    isFormOpen, isEditing, formData, setFormData,
    genreCategories, handleSubmit, handleCancelEdit, isMobile,
    handleGenerateQuestions, isGeneratingQuestions
}) => {
    const [isQuestionModalOpen, setIsQuestionModalOpen] = React.useState(false);
    const useAIQuestions = (formData.guide_questions?.length > 0) || formData.use_ai_questions;

    const toggleAIQuestions = () => {
        if (useAIQuestions) {
            if (window.confirm('디자인한 질문들이 모두 사라집니다. 정말 취소할까요?')) {
                setFormData({ ...formData, guide_questions: [], use_ai_questions: false });
            }
        } else {
            setFormData({ ...formData, use_ai_questions: true });
            setIsQuestionModalOpen(true);
        }
    };

    return (
        <AnimatePresence>
            {isFormOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', marginBottom: '24px' }}>
                    <Card style={{
                        padding: isMobile ? '16px' : '24px',
                        border: '2px solid #3498DB',
                        width: '100%',
                        maxWidth: 'none',
                        margin: '0 0 24px 0',
                        boxSizing: 'border-box',
                        overflow: 'hidden'
                    }}>
                        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '12px' }}>
                                <input
                                    type="text"
                                    placeholder="글쓰기 주제"
                                    value={formData.title}
                                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                                    style={{
                                        flex: 2,
                                        padding: '14px',
                                        borderRadius: '12px',
                                        border: '1px solid #ddd',
                                        fontSize: '1rem',
                                        minHeight: '48px',
                                        width: '100%',
                                        boxSizing: 'border-box'
                                    }}
                                />

                                <select value={formData.genre} onChange={e => setFormData({ ...formData, genre: e.target.value })} style={{ flex: 1, padding: '12px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '48px', width: '100%', boxSizing: 'border-box' }}>
                                    {genreCategories.map(cat => (
                                        <optgroup key={cat.label} label={cat.label}>
                                            {cat.genres.map(g => <option key={g} value={g}>{g}</option>)}
                                        </optgroup>
                                    ))}
                                </select>
                            </div>
                            <textarea
                                placeholder="안내 가이드 (학생들에게 보여줄 기본 설명)"
                                value={formData.guide}
                                onChange={e => setFormData({ ...formData, guide: e.target.value })}
                                style={{ padding: '14px', borderRadius: '12px', border: '1px solid #ddd', minHeight: '80px', fontSize: '1rem', width: '100%', boxSizing: 'border-box' }}
                            />

                            {/* [개편] 핵심 질문 설계 인터페이스 */}
                            <div style={{
                                background: '#F8F9FA',
                                padding: '20px',
                                borderRadius: '20px',
                                border: useAIQuestions ? '2px solid #3498DB' : '1px dashed #BDC3C7',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                transition: 'all 0.3s'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div
                                        onClick={toggleAIQuestions}
                                        style={{
                                            width: '50px',
                                            height: '26px',
                                            background: useAIQuestions ? '#3498DB' : '#BDC3C7',
                                            borderRadius: '13px',
                                            position: 'relative',
                                            cursor: 'pointer',
                                            transition: 'background 0.3s'
                                        }}
                                    >
                                        <div style={{
                                            width: '20px',
                                            height: '20px',
                                            background: 'white',
                                            borderRadius: '50%',
                                            position: 'absolute',
                                            top: '3px',
                                            left: useAIQuestions ? '27px' : '3px',
                                            transition: 'left 0.3s'
                                        }} />
                                    </div>
                                    <div>
                                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#2C3E50' }}>
                                            🎯 핵심 질문 설계 {useAIQuestions ? '(사용 중)' : '(선택)'}
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: '#7F8C8D' }}>
                                            {useAIQuestions
                                                ? `${formData.guide_questions?.length || 0}개의 질문이 준비되었습니다.`
                                                : '학생들이 생각의 구조를 잡을 수 있도록 AI가 질문을 만들어줍니다.'}
                                        </div>
                                    </div>
                                </div>
                                {useAIQuestions && (
                                    <Button
                                        type="button"
                                        size="sm"
                                        onClick={() => setIsQuestionModalOpen(true)}
                                        style={{
                                            background: 'linear-gradient(135deg, #36D1DC 0%, #5B86E0 100%)',
                                            borderRadius: '14px',
                                            color: 'white',
                                            fontWeight: 'bold',
                                            padding: '8px 16px',
                                            border: 'none',
                                            boxShadow: '0 4px 15px rgba(91, 134, 224, 0.3)'
                                        }}
                                    >
                                        🪄 질문 수정/설계하기
                                    </Button>
                                )}
                            </div>

                            {/* [신규] 핵심 질문 설계 모달 (Portal 사용으로 전체 화면 대응) */}
                            {typeof document !== 'undefined' && isQuestionModalOpen && createPortal(
                                <div
                                    style={{
                                        position: 'fixed',
                                        top: 0, left: 0, right: 0, bottom: 0,
                                        backgroundColor: 'rgba(0,0,0,0.6)',
                                        zIndex: 99999,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '20px',
                                        backdropFilter: 'blur(8px)',
                                        WebkitBackdropFilter: 'blur(8px)'
                                    }}
                                >
                                    <motion.div
                                        initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                        animate={{ scale: 1, opacity: 1, y: 0 }}
                                        style={{
                                            backgroundColor: 'white',
                                            width: '100%',
                                            maxWidth: '900px',
                                            maxHeight: '90vh',
                                            borderRadius: '40px',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            boxShadow: '0 40px 100px rgba(0,0,0,0.3)',
                                        }}
                                    >
                                        {/* 모달 헤더 */}
                                        <div style={{ padding: '40px 40px 24px 40px', borderBottom: '1px solid #F1F3F5', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(to right, #F8FBFF, #FFFFFF)' }}>
                                            <div>
                                                <h3 style={{ margin: 0, fontSize: '1.8rem', fontWeight: '900', color: '#2C3E50' }}>🎯 핵심 질문 설계</h3>
                                                <p style={{ margin: '8px 0 0 0', color: '#7F8C8D', fontSize: '1rem' }}>학생들에게 생각의 실마리를 제공하는 질문 리스트를 만듭니다.</p>
                                            </div>
                                            <button
                                                onClick={() => setIsQuestionModalOpen(false)}
                                                style={{ background: '#F1F3F5', border: 'none', width: '48px', height: '48px', borderRadius: '50%', cursor: 'pointer', fontSize: '1.5rem', color: '#95A5A6', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                                            >
                                                ×
                                            </button>
                                        </div>

                                        {/* 모달 바디 (스크롤 가능) */}
                                        <div style={{ padding: '40px', overflowY: 'auto', flex: 1 }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#E3F2FD', padding: '24px 32px', borderRadius: '24px', marginBottom: '32px', border: '1px solid #BBDEFB' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                                                    <div style={{ background: '#3498DB', color: 'white', padding: '10px 18px', borderRadius: '15px', fontWeight: 'bold' }}>AI 자동 생성</div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                        <span style={{ fontSize: '1rem', color: '#2C3E50', fontWeight: 'bold' }}>질문 개수: {formData.question_count || 3}개</span>
                                                        <input
                                                            type="range" min="1" max="5"
                                                            value={formData.question_count || 3}
                                                            onChange={e => setFormData({ ...formData, question_count: parseInt(e.target.value) })}
                                                            style={{ width: '120px', cursor: 'pointer', accentColor: '#3498DB' }}
                                                        />
                                                    </div>
                                                </div>
                                                <Button
                                                    type="button"
                                                    onClick={() => handleGenerateQuestions(formData.question_count || 3)}
                                                    disabled={isGeneratingQuestions}
                                                    style={{
                                                        background: 'linear-gradient(135deg, #00F2FE 0%, #4FACFE 100%)',
                                                        border: 'none',
                                                        color: 'white',
                                                        fontSize: '1rem',
                                                        padding: '12px 28px',
                                                        borderRadius: '16px',
                                                        fontWeight: '900',
                                                        boxShadow: '0 10px 20px rgba(79, 172, 254, 0.4)',
                                                        textShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                                    }}
                                                >
                                                    {isGeneratingQuestions ? '🪄 AI 설계 중...' : '🪄 AI 질문 생성하기'}
                                                </Button>
                                            </div>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                {formData.guide_questions?.length === 0 && !isGeneratingQuestions && (
                                                    <div style={{ textAlign: 'center', padding: '80px 0', color: '#BDC3C7', border: '3px dashed #F1F3F5', borderRadius: '32px' }}>
                                                        <p>아직 생성된 질문이 없습니다. AI의 도움을 받아 시작해보세요!</p>
                                                    </div>
                                                )}

                                                {formData.guide_questions?.map((q, idx) => (
                                                    <div key={idx} style={{ display: 'flex', gap: '16px', alignItems: 'flex-start', background: '#F8F9FA', padding: '16px', borderRadius: '24px' }}>
                                                        <div style={{
                                                            width: '40px', height: '40px', background: 'white', color: '#3498DB',
                                                            borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            fontWeight: '900', border: '2px solid #3498DB'
                                                        }}>
                                                            {idx + 1}
                                                        </div>
                                                        <textarea
                                                            value={q}
                                                            onChange={e => {
                                                                const newQs = [...formData.guide_questions];
                                                                newQs[idx] = e.target.value;
                                                                setFormData({ ...formData, guide_questions: newQs });
                                                            }}
                                                            style={{ flex: 1, padding: '16px', borderRadius: '16px', border: '1px solid #DEE2E6', fontSize: '1.05rem', minHeight: '80px', resize: 'none' }}
                                                        />
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                const newQs = formData.guide_questions.filter((_, i) => i !== idx);
                                                                setFormData({ ...formData, guide_questions: newQs });
                                                            }}
                                                            style={{ background: '#FFF0F0', border: 'none', color: '#FF5252', width: '40px', height: '40px', borderRadius: '12px' }}
                                                        >
                                                            ×
                                                        </button>
                                                    </div>
                                                ))}

                                                <button
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, guide_questions: [...(formData.guide_questions || []), ''] })}
                                                    style={{ padding: '20px', border: '2px dashed #3498DB', borderRadius: '24px', color: '#3498DB', fontWeight: 'bold', cursor: 'pointer' }}
                                                >
                                                    + 질문 직접 추가하기
                                                </button>
                                            </div>
                                        </div>

                                        <div style={{ padding: '32px 40px', background: '#F8F9FA', display: 'flex', justifyContent: 'flex-end' }}>
                                            <Button
                                                type="button"
                                                onClick={() => setIsQuestionModalOpen(false)}
                                                style={{ background: '#3498DB', borderRadius: '20px', padding: '16px 60px' }}
                                            >
                                                설계 완료 ✨
                                            </Button>
                                        </div>
                                    </motion.div>
                                </div>,
                                document.body
                            )}

                            <div style={{
                                display: 'flex',
                                flexDirection: isMobile ? 'column' : 'row',
                                gap: isMobile ? '12px' : '16px',
                                alignItems: 'stretch',
                                width: '100%',
                                boxSizing: 'border-box'
                            }}>
                                {/* (1) 분량 제한 섹션 */}
                                <div style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    background: '#F0F7FF',
                                    padding: '16px',
                                    borderRadius: '16px',
                                    border: '1px solid #D6EAF8',
                                    boxSizing: 'border-box'
                                }}>
                                    <label style={{ fontSize: '0.8rem', color: '#2E86C1', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        📏 분량 제한 설정
                                    </label>
                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '0.7rem', color: '#5499C7', display: 'block', marginBottom: '4px' }}>최소 글자</span>
                                            <input type="number" step="100" placeholder="글자" value={formData.min_chars} onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #AED6F1', fontSize: '0.9rem', textAlign: 'center', boxSizing: 'border-box' }} />
                                        </div>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ fontSize: '0.7rem', color: '#5499C7', display: 'block', marginBottom: '4px' }}>최소 문단</span>
                                            <input type="number" placeholder="문단" value={formData.min_paragraphs} onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })} style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid #AED6F1', fontSize: '0.9rem', textAlign: 'center', boxSizing: 'border-box' }} />
                                        </div>
                                    </div>
                                </div>

                                {/* (2) 포인트 보상 섹션 */}
                                <div style={{
                                    flex: 1,
                                    minWidth: 0,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '10px',
                                    background: '#FFFDF0',
                                    padding: '16px',
                                    borderRadius: '16px',
                                    border: '1px solid #FCF3CF',
                                    boxSizing: 'border-box'
                                }}>
                                    <label style={{ fontSize: '0.8rem', color: '#D4AC0D', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        💰 포인트 보상 설정
                                    </label>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.5)', padding: '6px 10px', borderRadius: '10px' }}>
                                            <span style={{ fontSize: '0.75rem', color: '#B7950B', fontWeight: 'bold', whiteSpace: 'nowrap' }}>기본 보상:</span>
                                            <input type="number" step="100" value={formData.base_reward} onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })} style={{ width: '80px', padding: '6px', borderRadius: '6px', border: '1px solid #F9E79F', fontSize: '0.85rem', textAlign: 'center' }} />
                                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', color: '#B7950B' }}>P</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', flexWrap: 'nowrap' }}>
                                            <span style={{ color: '#D35400', fontWeight: 'bold', whiteSpace: 'nowrap' }}>⚡ 보너스:</span>
                                            <input type="number" step="100" placeholder="글자수" value={formData.bonus_threshold} onChange={e => setFormData({ ...formData, bonus_threshold: parseInt(e.target.value) || 0 })} style={{ width: '60px', padding: '6px', borderRadius: '6px', border: '1px solid #F9E79F', fontSize: '0.8rem' }} />
                                            <span style={{ whiteSpace: 'nowrap' }}>자 ↑ 면</span>
                                            <span style={{ fontWeight: 'bold' }}>+</span>
                                            <input type="number" step="10" placeholder="점수" value={formData.bonus_reward} onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })} style={{ width: '50px', padding: '6px', borderRadius: '6px', border: '1px solid #F9E79F', fontSize: '0.8rem' }} />
                                            <span style={{ fontWeight: 'bold', color: '#D35400' }}>P</span>
                                        </div>
                                        <div style={{
                                            marginTop: '4px',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px',
                                            background: formData.allow_comments ? 'rgba(52, 152, 219, 0.1)' : 'rgba(189, 195, 199, 0.2)',
                                            padding: '8px 12px',
                                            borderRadius: '10px',
                                            cursor: 'pointer',
                                            border: formData.allow_comments ? '1px solid #3498DB' : '1px solid #BDC3C7',
                                            transition: 'all 0.2s'
                                        }} onClick={() => setFormData({ ...formData, allow_comments: !formData.allow_comments })}>
                                            <input
                                                type="checkbox"
                                                checked={formData.allow_comments}
                                                readOnly
                                                style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                            />
                                            <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: formData.allow_comments ? '#2980B9' : '#7F8C8D' }}>
                                                {formData.allow_comments ? '💬 댓글 허용됨' : '🔒 댓글 잠금'}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '12px' }}>
                                {isEditing && (
                                    <Button
                                        type="button"
                                        onClick={handleCancelEdit}
                                        style={{ flex: 1, backgroundColor: '#95A5A6', color: 'white', fontWeight: 'bold', height: '54px', borderRadius: '14px' }}
                                    >
                                        취소하기
                                    </Button>
                                )}
                                <Button type="submit" style={{ flex: 2, backgroundColor: isEditing ? '#F39C12' : '#3498DB', color: 'white', fontWeight: 'bold', height: '54px', borderRadius: '14px' }}>
                                    {isEditing ? '수정 완료 ✏️' : '글쓰기 미션 공개하기 🚀'}
                                </Button>
                            </div>
                        </form>
                    </Card>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default MissionForm;

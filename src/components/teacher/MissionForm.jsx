import React from 'react';
import Card from '../common/Card';
import Button from '../common/Button';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';

const MissionForm = ({
    isFormOpen, isEditing, formData, setFormData,
    genreCategories, handleSubmit, handleCancelEdit, isMobile,
    handleGenerateQuestions, isGeneratingQuestions,
    handleSaveDefaultRubric, handleSaveDefaultSettings,
    frequentTags, saveFrequentTag, removeFrequentTag
}) => {
    const [isQuestionModalOpen, setIsQuestionModalOpen] = React.useState(false);
    const [tagInput, setTagInput] = React.useState('');
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

    const handleAddTag = (val) => {
        const cleanVal = val.trim().replace(',', '');
        if (cleanVal && !formData.tags?.includes(cleanVal)) {
            setFormData({ ...formData, tags: [...(formData.tags || []), cleanVal] });
        }
    };

    return (
        <>

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

                                {/* 태그 입력 UI */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '16px', background: '#F8F9FF', borderRadius: '16px', border: '1px solid #E0E7FF' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <label style={{ fontSize: '0.85rem', color: '#4F46E5', fontWeight: 'bold' }}>🏷️ 미션 태그</label>
                                        <span style={{ fontSize: '0.75rem', color: '#6366F1', opacity: 0.8 }}>* 태그를 입력하면 학생들의 글을 키워드별로 분류하여 관리할 수 있습니다.</span>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                                        {formData.tags?.map((tag, index) => (
                                            <motion.div
                                                initial={{ scale: 0.8, opacity: 0 }}
                                                animate={{ scale: 1, opacity: 1 }}
                                                key={index}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '6px',
                                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                    color: 'white',
                                                    padding: '6px 14px',
                                                    borderRadius: '20px',
                                                    fontSize: '0.85rem',
                                                    fontWeight: 'bold',
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                                                }}
                                            >
                                                #{tag}
                                                <span
                                                    onClick={() => {
                                                        const newTags = formData.tags.filter((_, i) => i !== index);
                                                        setFormData({ ...formData, tags: newTags });
                                                    }}
                                                    style={{ cursor: 'pointer', opacity: 0.8, fontSize: '1.1rem', marginLeft: '4px' }}
                                                >
                                                    ×
                                                </span>
                                            </motion.div>
                                        ))}
                                    </div>

                                    <div style={{ display: 'flex', gap: '8px' }}>
                                        <input
                                            type="text"
                                            placeholder="태그 입력 (엔터 또는 쉼표)"
                                            value={tagInput}
                                            onChange={e => setTagInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter' || e.key === ',') {
                                                    e.preventDefault();
                                                    handleAddTag(tagInput);
                                                    setTagInput('');
                                                }
                                            }}
                                            style={{
                                                flex: 1,
                                                padding: '12px 16px',
                                                borderRadius: '12px',
                                                border: '1px solid #C7D2FE',
                                                fontSize: '0.9rem',
                                                boxSizing: 'border-box',
                                                background: 'white'
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            onClick={() => {
                                                saveFrequentTag(tagInput.trim().replace(',', ''));
                                                handleAddTag(tagInput);
                                                setTagInput('');
                                            }}
                                            style={{
                                                background: '#C7D2FE',
                                                color: '#4F46E5',
                                                padding: '0 16px',
                                                fontSize: '0.85rem',
                                                fontWeight: 'bold',
                                                minHeight: 'auto',
                                                height: '46px'
                                            }}
                                        >
                                            ⭐ 저장
                                        </Button>
                                    </div>

                                    {/* 자주 쓰는 태그 목록 */}
                                    {frequentTags?.length > 0 && (
                                        <div style={{ marginTop: '8px' }}>
                                            <div style={{ fontSize: '0.75rem', color: '#6366F1', marginBottom: '8px', fontWeight: 'bold' }}>⭐ 자주 쓰는 태그 (클릭해서 추가)</div>
                                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                                                {frequentTags.map((tag, idx) => (
                                                    <div
                                                        key={idx}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '4px',
                                                            background: 'white',
                                                            border: '1px solid #E0E7FF',
                                                            padding: '4px 10px',
                                                            borderRadius: '10px',
                                                            cursor: 'pointer',
                                                            transition: 'all 0.2s'
                                                        }}
                                                        onClick={() => handleAddTag(tag)}
                                                    >
                                                        <span style={{ fontSize: '0.8rem', color: '#4F46E5', fontWeight: 'bold' }}>#{tag}</span>
                                                        <span
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                removeFrequentTag(tag);
                                                            }}
                                                            style={{ color: '#FDA4AF', fontSize: '0.9rem', marginLeft: '4px', cursor: 'pointer' }}
                                                        >
                                                            ×
                                                        </span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

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

                                {typeof document !== 'undefined' && isQuestionModalOpen && createPortal(
                                    <div
                                        onClick={() => setIsQuestionModalOpen(false)}
                                        style={{
                                            position: 'fixed',
                                            top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: 'rgba(0,0,0,0.6)',
                                            zIndex: 99999,
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            padding: isMobile ? '10px' : '20px',
                                            backdropFilter: 'blur(8px)',
                                            WebkitBackdropFilter: 'blur(8px)',
                                            overflowY: 'auto'
                                        }}
                                    >
                                        <motion.div
                                            initial={{ scale: 0.9, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            exit={{ scale: 0.9, opacity: 0 }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                width: '100%',
                                                maxWidth: isMobile ? '100%' : '900px',
                                                maxHeight: '90vh',
                                                display: 'flex',
                                                flexDirection: 'column',
                                                backgroundColor: 'white',
                                                borderRadius: isMobile ? '16px' : '24px',
                                                boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
                                                overflow: 'hidden'
                                            }}
                                        >
                                            {/* 헤더 (고정) */}
                                            <div style={{
                                                padding: isMobile ? '16px' : '24px',
                                                borderBottom: '2px solid #E8F4F8',
                                                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                color: 'white',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                flexShrink: 0
                                            }}>
                                                <h3 style={{
                                                    margin: 0,
                                                    fontSize: isMobile ? '1.1rem' : '1.4rem',
                                                    fontWeight: '900',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '8px'
                                                }}>
                                                    🎯 핵심 질문 설계
                                                </h3>
                                                <button
                                                    onClick={() => setIsQuestionModalOpen(false)}
                                                    style={{
                                                        background: 'rgba(255,255,255,0.2)',
                                                        border: 'none',
                                                        color: 'white',
                                                        width: '32px',
                                                        height: '32px',
                                                        borderRadius: '50%',
                                                        cursor: 'pointer',
                                                        fontSize: '1.2rem',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        transition: 'all 0.2s'
                                                    }}
                                                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.3)'}
                                                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.2)'}
                                                >
                                                    ✕
                                                </button>
                                            </div>

                                            {/* 콘텐츠 (스크롤 가능) */}
                                            <div style={{
                                                flex: 1,
                                                overflowY: 'auto',
                                                padding: isMobile ? '16px' : '24px',
                                                backgroundColor: '#FAFBFC'
                                            }}>
                                                <div style={{
                                                    background: '#E8F4F8',
                                                    padding: isMobile ? '12px' : '16px',
                                                    borderRadius: '12px',
                                                    marginBottom: '20px',
                                                    border: '1px solid #B8E6F5'
                                                }}>
                                                    <p style={{
                                                        margin: 0,
                                                        fontSize: isMobile ? '0.85rem' : '0.9rem',
                                                        color: '#2C3E50',
                                                        lineHeight: '1.6'
                                                    }}>
                                                        💡 <strong>핵심 질문</strong>은 학생들이 글을 쓰기 전에 생각을 정리할 수 있도록 돕는 가이드입니다.
                                                        AI가 주제에 맞는 질문을 자동으로 생성하거나, 직접 입력할 수 있습니다.
                                                    </p>
                                                </div>

                                                {/* 질문 개수 선택 (간결한 슬라이더) */}
                                                <div style={{
                                                    background: '#F9FAFB',
                                                    padding: isMobile ? '12px 16px' : '14px 18px',
                                                    borderRadius: '12px',
                                                    border: '1px solid #E5E7EB',
                                                    marginBottom: '16px'
                                                }}>
                                                    <div style={{
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        gap: isMobile ? '12px' : '16px',
                                                        flexWrap: isMobile ? 'wrap' : 'nowrap'
                                                    }}>
                                                        <label style={{
                                                            fontSize: '0.85rem',
                                                            fontWeight: '600',
                                                            color: '#6B7280',
                                                            whiteSpace: 'nowrap',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '6px'
                                                        }}>
                                                            📊 AI 질문 개수
                                                        </label>

                                                        <div style={{
                                                            flex: 1,
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            gap: '12px',
                                                            minWidth: isMobile ? '100%' : '200px'
                                                        }}>
                                                            <input
                                                                type="range"
                                                                min="1"
                                                                max="5"
                                                                value={formData.question_count || 3}
                                                                onChange={(e) => setFormData({ ...formData, question_count: parseInt(e.target.value) })}
                                                                style={{
                                                                    flex: 1,
                                                                    height: '6px',
                                                                    borderRadius: '3px',
                                                                    outline: 'none',
                                                                    background: `linear-gradient(to right, 
                                                                        #8B5CF6 0%, 
                                                                        #8B5CF6 ${((formData.question_count || 3) - 1) * 25}%, 
                                                                        #E5E7EB ${((formData.question_count || 3) - 1) * 25}%, 
                                                                        #E5E7EB 100%)`,
                                                                    WebkitAppearance: 'none',
                                                                    cursor: 'pointer'
                                                                }}
                                                            />
                                                            <span style={{
                                                                fontSize: '0.9rem',
                                                                fontWeight: 'bold',
                                                                color: '#8B5CF6',
                                                                minWidth: '35px',
                                                                textAlign: 'center'
                                                            }}>
                                                                {formData.question_count || 3}개
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <style>{`
                                                        input[type="range"]::-webkit-slider-thumb {
                                                            -webkit-appearance: none;
                                                            appearance: none;
                                                            width: 18px;
                                                            height: 18px;
                                                            border-radius: 50%;
                                                            background: #8B5CF6;
                                                            cursor: pointer;
                                                            box-shadow: 0 1px 4px rgba(139, 92, 246, 0.3);
                                                            border: 2px solid white;
                                                            transition: all 0.2s;
                                                        }
                                                        input[type="range"]::-moz-range-thumb {
                                                            width: 18px;
                                                            height: 18px;
                                                            border-radius: 50%;
                                                            background: #8B5CF6;
                                                            cursor: pointer;
                                                            box-shadow: 0 1px 4px rgba(139, 92, 246, 0.3);
                                                            border: 2px solid white;
                                                            transition: all 0.2s;
                                                        }
                                                        input[type="range"]::-webkit-slider-thumb:hover {
                                                            transform: scale(1.15);
                                                            box-shadow: 0 2px 6px rgba(139, 92, 246, 0.4);
                                                        }
                                                        input[type="range"]::-moz-range-thumb:hover {
                                                            transform: scale(1.15);
                                                            box-shadow: 0 2px 6px rgba(139, 92, 246, 0.4);
                                                        }
                                                    `}</style>
                                                </div>

                                                {/* AI 생성 버튼 */}
                                                <div style={{ marginBottom: '24px', textAlign: 'center' }}>
                                                    <Button
                                                        type="button"
                                                        onClick={() => {
                                                            if (!formData.title?.trim()) {
                                                                alert('먼저 글쓰기 주제를 입력해주세요!');
                                                                return;
                                                            }
                                                            handleGenerateQuestions(formData.question_count || 3);
                                                        }}
                                                        disabled={isGeneratingQuestions}
                                                        style={{
                                                            background: 'linear-gradient(135deg, #36D1DC 0%, #5B86E0 100%)',
                                                            color: 'white',
                                                            fontWeight: 'bold',
                                                            padding: isMobile ? '12px 20px' : '14px 28px',
                                                            fontSize: isMobile ? '0.9rem' : '1rem',
                                                            borderRadius: '14px',
                                                            border: 'none',
                                                            boxShadow: '0 4px 15px rgba(91, 134, 224, 0.3)',
                                                            cursor: isGeneratingQuestions ? 'not-allowed' : 'pointer',
                                                            opacity: isGeneratingQuestions ? 0.6 : 1,
                                                            width: isMobile ? '100%' : 'auto'
                                                        }}
                                                    >
                                                        {isGeneratingQuestions ? '⏳ AI가 질문을 만들고 있어요...' : `🪄 AI로 질문 자동 생성`}
                                                    </Button>
                                                </div>

                                                {/* 질문 목록 */}
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                    {(formData.guide_questions || []).map((question, index) => (
                                                        <div
                                                            key={index}
                                                            style={{
                                                                background: 'white',
                                                                padding: isMobile ? '14px' : '18px',
                                                                borderRadius: '16px',
                                                                border: '2px solid #E0E7FF',
                                                                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
                                                            }}
                                                        >
                                                            <div style={{
                                                                display: 'flex',
                                                                alignItems: 'center',
                                                                gap: '10px',
                                                                marginBottom: '10px'
                                                            }}>
                                                                <span style={{
                                                                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                                    color: 'white',
                                                                    width: isMobile ? '28px' : '32px',
                                                                    height: isMobile ? '28px' : '32px',
                                                                    borderRadius: '50%',
                                                                    display: 'flex',
                                                                    alignItems: 'center',
                                                                    justifyContent: 'center',
                                                                    fontWeight: 'bold',
                                                                    fontSize: isMobile ? '0.85rem' : '0.9rem',
                                                                    flexShrink: 0
                                                                }}>
                                                                    {index + 1}
                                                                </span>
                                                                <input
                                                                    type="text"
                                                                    value={question}
                                                                    onChange={(e) => {
                                                                        const newQuestions = [...formData.guide_questions];
                                                                        newQuestions[index] = e.target.value;
                                                                        setFormData({ ...formData, guide_questions: newQuestions });
                                                                    }}
                                                                    placeholder={`질문 ${index + 1}을 입력하세요`}
                                                                    style={{
                                                                        flex: 1,
                                                                        padding: isMobile ? '10px' : '12px',
                                                                        border: '1px solid #C7D2FE',
                                                                        borderRadius: '10px',
                                                                        fontSize: isMobile ? '0.9rem' : '1rem',
                                                                        outline: 'none',
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                    onFocus={(e) => e.target.style.borderColor = '#667eea'}
                                                                    onBlur={(e) => e.target.style.borderColor = '#C7D2FE'}
                                                                />
                                                                <button
                                                                    onClick={() => {
                                                                        const newQuestions = formData.guide_questions.filter((_, i) => i !== index);
                                                                        setFormData({ ...formData, guide_questions: newQuestions });
                                                                    }}
                                                                    style={{
                                                                        background: '#FEE2E2',
                                                                        border: 'none',
                                                                        color: '#DC2626',
                                                                        width: isMobile ? '32px' : '36px',
                                                                        height: isMobile ? '32px' : '36px',
                                                                        borderRadius: '50%',
                                                                        cursor: 'pointer',
                                                                        fontSize: '1.1rem',
                                                                        display: 'flex',
                                                                        alignItems: 'center',
                                                                        justifyContent: 'center',
                                                                        flexShrink: 0,
                                                                        transition: 'all 0.2s'
                                                                    }}
                                                                    onMouseEnter={e => e.currentTarget.style.background = '#FCA5A5'}
                                                                    onMouseLeave={e => e.currentTarget.style.background = '#FEE2E2'}
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {/* 질문 추가 버튼 */}
                                                    <button
                                                        onClick={() => {
                                                            setFormData({
                                                                ...formData,
                                                                guide_questions: [...(formData.guide_questions || []), '']
                                                            });
                                                        }}
                                                        style={{
                                                            background: 'white',
                                                            border: '2px dashed #C7D2FE',
                                                            padding: isMobile ? '14px' : '18px',
                                                            borderRadius: '16px',
                                                            cursor: 'pointer',
                                                            color: '#667eea',
                                                            fontWeight: 'bold',
                                                            fontSize: isMobile ? '0.9rem' : '1rem',
                                                            transition: 'all 0.2s',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center',
                                                            gap: '8px'
                                                        }}
                                                        onMouseEnter={e => {
                                                            e.currentTarget.style.background = '#F5F3FF';
                                                            e.currentTarget.style.borderColor = '#667eea';
                                                        }}
                                                        onMouseLeave={e => {
                                                            e.currentTarget.style.background = 'white';
                                                            e.currentTarget.style.borderColor = '#C7D2FE';
                                                        }}
                                                    >
                                                        ➕ 질문 추가하기
                                                    </button>
                                                </div>
                                            </div>

                                            {/* 푸터 (고정) */}
                                            <div style={{
                                                padding: isMobile ? '16px' : '20px 24px',
                                                borderTop: '1px solid #E5E7EB',
                                                background: 'white',
                                                display: 'flex',
                                                gap: '12px',
                                                flexShrink: 0
                                            }}>
                                                <Button
                                                    type="button"
                                                    onClick={() => setIsQuestionModalOpen(false)}
                                                    style={{
                                                        flex: 1,
                                                        background: '#F3F4F6',
                                                        color: '#6B7280',
                                                        fontWeight: 'bold',
                                                        height: isMobile ? '48px' : '52px',
                                                        fontSize: isMobile ? '0.95rem' : '1rem'
                                                    }}
                                                >
                                                    취소
                                                </Button>
                                                <Button
                                                    type="button"
                                                    onClick={() => setIsQuestionModalOpen(false)}
                                                    style={{
                                                        flex: 2,
                                                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                                                        color: 'white',
                                                        fontWeight: 'bold',
                                                        height: isMobile ? '48px' : '52px',
                                                        fontSize: isMobile ? '0.95rem' : '1rem'
                                                    }}
                                                >
                                                    ✅ 완료
                                                </Button>
                                            </div>
                                        </motion.div>
                                    </div>,
                                    document.body
                                )}

                                {/* [통합] 미션 세부 설정 (분량, 댓글, 포인트) */}
                                <div style={{
                                    background: 'white',
                                    borderRadius: '24px',
                                    border: '1px solid #E0E0E0',
                                    padding: '32px',
                                    marginBottom: '24px',
                                    boxShadow: '0 4px 12px rgba(0,0,0,0.03)'
                                }}>
                                    {/* 헤더: 제목 + 저장 버튼 */}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.0rem', color: '#2C3E50', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            ⚙️ 미션 세부 설정
                                        </h3>
                                        <Button
                                            type="button"
                                            onClick={handleSaveDefaultSettings}
                                            style={{
                                                background: '#F8F9FA',
                                                border: '1px solid #DFE6E9',
                                                color: '#636E72',
                                                padding: '5px 12px',
                                                fontSize: '0.75rem',
                                                borderRadius: '8px',
                                                minHeight: 'auto',
                                                fontWeight: 'bold',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: '6px',
                                                transition: 'all 0.2s',
                                                boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
                                            }}
                                            onMouseOver={e => { e.currentTarget.style.background = '#E2E6EA'; e.currentTarget.style.color = '#2D3436'; }}
                                            onMouseOut={e => { e.currentTarget.style.background = '#F8F9FA'; e.currentTarget.style.color = '#636E72'; }}
                                        >
                                            <span>💾</span> 설정값을 기본으로 저장
                                        </Button>
                                    </div>

                                    {/* 컨텐츠: 2컬럼 레이아웃 */}
                                    <div style={{
                                        display: 'flex',
                                        flexDirection: isMobile ? 'column' : 'row',
                                        gap: isMobile ? '32px' : '48px',
                                        alignItems: 'flex-start'
                                    }}>
                                        {/* (Left) 분량 및 설정 */}
                                        <div style={{ flex: 1, width: '100%' }}>
                                            <label style={{ fontSize: '0.9rem', color: '#2E86C1', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                                <span style={{ fontSize: '1.1rem' }}>📏</span> 분량 및 설정
                                            </label>

                                            <div style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: '0.8rem', color: '#7F8C8D', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>최소 글자수</span>
                                                    <input
                                                        type="number"
                                                        step="50"
                                                        placeholder="0"
                                                        value={formData.min_chars}
                                                        onChange={e => setFormData({ ...formData, min_chars: parseInt(e.target.value) || 0 })}
                                                        style={{
                                                            width: '100%',
                                                            padding: '10px',
                                                            borderRadius: '12px',
                                                            border: '2px solid #AED6F1',
                                                            fontSize: '1.0rem',
                                                            textAlign: 'center',
                                                            fontWeight: 'bold',
                                                            color: '#2C3E50',
                                                            boxSizing: 'border-box'
                                                        }}
                                                    />
                                                </div>
                                                <div style={{ flex: 1 }}>
                                                    <span style={{ fontSize: '0.8rem', color: '#7F8C8D', display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>문단 개수</span>
                                                    <input
                                                        type="number"
                                                        placeholder="0"
                                                        value={formData.min_paragraphs}
                                                        onChange={e => setFormData({ ...formData, min_paragraphs: parseInt(e.target.value) || 0 })}
                                                        style={{
                                                            width: '100%',
                                                            padding: '10px',
                                                            borderRadius: '12px',
                                                            border: '2px solid #AED6F1',
                                                            fontSize: '1.0rem',
                                                            textAlign: 'center',
                                                            fontWeight: 'bold',
                                                            color: '#2C3E50',
                                                            boxSizing: 'border-box'
                                                        }}
                                                    />
                                                </div>
                                            </div>

                                            {/* 댓글 허용 토글 */}
                                            <div
                                                onClick={() => setFormData({ ...formData, allow_comments: !formData.allow_comments })}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    gap: '10px',
                                                    background: formData.allow_comments ? '#E8F6F3' : '#F8F9FA',
                                                    padding: '12px',
                                                    borderRadius: '16px',
                                                    cursor: 'pointer',
                                                    border: formData.allow_comments ? '2px solid #1ABC9C' : '2px solid #BDC3C7',
                                                    transition: 'all 0.2s',
                                                    marginTop: '8px'
                                                }}
                                            >
                                                <span style={{ fontSize: '1.1rem' }}>
                                                    {formData.allow_comments ? '💬' : '🔒'}
                                                </span>
                                                <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: formData.allow_comments ? '#16A085' : '#7F8C8D' }}>
                                                    {formData.allow_comments ? '친구 댓글 허용함' : '댓글 기능 끄기'}
                                                </span>
                                            </div>
                                        </div>

                                        {/* 구분선 (Desktop only) */}
                                        {!isMobile && <div style={{ width: '1px', alignSelf: 'stretch', background: '#ECF0F1', margin: '0 8px' }} />}

                                        {/* (Right) 포인트 보상 설정 */}
                                        <div style={{ flex: 1, width: '100%' }}>
                                            <label style={{ fontSize: '0.9rem', color: '#F39C12', fontWeight: '900', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                                                <span style={{ fontSize: '1.1rem' }}>💰</span> 포인트 보상 설정
                                            </label>

                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                {/* 기본 보상 */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: '#FFFDF0',
                                                    padding: '10px 14px',
                                                    borderRadius: '16px',
                                                    border: '1px solid #F9E79F'
                                                }}>
                                                    <span style={{ fontSize: '0.9rem', color: '#B7950B', fontWeight: 'bold' }}>기본 보상</span>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                        <input
                                                            type="number"
                                                            step="100"
                                                            value={formData.base_reward}
                                                            onChange={e => setFormData({ ...formData, base_reward: parseInt(e.target.value) || 0 })}
                                                            style={{
                                                                width: '90px',
                                                                padding: '6px',
                                                                borderRadius: '8px',
                                                                border: '2px solid #FDEBD0',
                                                                fontSize: '1.0rem',
                                                                fontWeight: 'bold',
                                                                textAlign: 'right',
                                                                color: '#D35400',
                                                                background: 'white'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: '0.9rem', fontWeight: '900', color: '#D35400' }}>P</span>
                                                    </div>
                                                </div>

                                                {/* 보너스 조건 */}
                                                <div style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'space-between',
                                                    background: '#FFFDF0',
                                                    padding: '10px 14px',
                                                    borderRadius: '16px',
                                                    border: '1px solid #F9E79F',
                                                    flexWrap: 'wrap',
                                                    gap: '8px'
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '1.1rem' }}>⚡</span>
                                                        <input
                                                            type="number"
                                                            step="100"
                                                            value={formData.bonus_threshold}
                                                            onChange={e => setFormData({ ...formData, bonus_threshold: parseInt(e.target.value) || 0 })}
                                                            style={{
                                                                width: '60px',
                                                                padding: '6px',
                                                                borderRadius: '8px',
                                                                border: '2px solid #FDEBD0',
                                                                fontSize: '0.9rem',
                                                                fontWeight: 'bold',
                                                                textAlign: 'center',
                                                                background: 'white'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: '0.8rem', color: '#7F8C8D', fontWeight: 'bold' }}>자 이상</span>
                                                    </div>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#B7950B' }}>+</span>
                                                        <input
                                                            type="number"
                                                            step="10"
                                                            value={formData.bonus_reward}
                                                            onChange={e => setFormData({ ...formData, bonus_reward: parseInt(e.target.value) || 0 })}
                                                            style={{
                                                                width: '60px',
                                                                padding: '6px',
                                                                borderRadius: '8px',
                                                                border: '2px solid #FDEBD0',
                                                                fontSize: '0.9rem',
                                                                fontWeight: 'bold',
                                                                textAlign: 'center',
                                                                color: '#D35400',
                                                                background: 'white'
                                                            }}
                                                        />
                                                        <span style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#D35400' }}>P</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* [신규] 평가 루브릭 설정 섹션 */}
                                <div style={{
                                    background: '#FFF8F0',
                                    padding: '20px',
                                    borderRadius: '20px',
                                    border: formData.evaluation_rubric?.use_rubric ? '2px solid #F39C12' : '1px dashed #E67E22',
                                    marginBottom: '8px',
                                    transition: 'all 0.3s'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: formData.evaluation_rubric?.use_rubric ? '20px' : '0' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                            <div
                                                onClick={() => setFormData({
                                                    ...formData,
                                                    evaluation_rubric: {
                                                        ...formData.evaluation_rubric,
                                                        use_rubric: !formData.evaluation_rubric?.use_rubric
                                                    }
                                                })}
                                                style={{
                                                    width: '50px', height: '26px',
                                                    background: formData.evaluation_rubric?.use_rubric ? '#F39C12' : '#BDC3C7',
                                                    borderRadius: '13px', position: 'relative', cursor: 'pointer'
                                                }}
                                            >
                                                <div style={{
                                                    width: '20px', height: '20px', background: 'white', borderRadius: '50%',
                                                    position: 'absolute', top: '3px',
                                                    left: formData.evaluation_rubric?.use_rubric ? '27px' : '3px',
                                                    transition: 'all 0.3s'
                                                }} />
                                            </div>
                                            <div>
                                                <div style={{ fontWeight: 'bold', fontSize: '0.95rem', color: '#2C3E50' }}>
                                                    📊 글쓰기 평가 루브릭 {formData.evaluation_rubric?.use_rubric ? '(사용 중)' : '(선택)'}
                                                </div>
                                                <div style={{ fontSize: '0.8rem', color: '#7F8C8D' }}>
                                                    글쓰기 완료 후 학생의 성취도를 {formData.evaluation_rubric?.levels?.length || 3}단계로 평가합니다.
                                                </div>
                                            </div>
                                        </div>

                                        {formData.evaluation_rubric?.use_rubric && (
                                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                                                <div style={{ display: 'flex', gap: '8px' }}>
                                                    {[3, 4, 5].map(lvl => {
                                                        const colors = {
                                                            3: { main: '#10B981', border: '#D1FAE5' },
                                                            4: { main: '#3B82F6', border: '#DBEAFE' },
                                                            5: { main: '#8B5CF6', border: '#EDE9FE' }
                                                        };
                                                        const theme = colors[lvl];
                                                        const isSelected = formData.evaluation_rubric.levels?.length === lvl;

                                                        return (
                                                            <button
                                                                key={lvl}
                                                                type="button"
                                                                onClick={() => {
                                                                    let newLevels = [];
                                                                    if (lvl === 3) {
                                                                        newLevels = [
                                                                            { score: 3, label: '우수' },
                                                                            { score: 2, label: '보통' },
                                                                            { score: 1, label: '노력' }
                                                                        ];
                                                                    } else if (lvl === 4) {
                                                                        newLevels = [
                                                                            { score: 4, label: '매우 우수' },
                                                                            { score: 3, label: '우수' },
                                                                            { score: 2, label: '보통' },
                                                                            { score: 1, label: '노력' }
                                                                        ];
                                                                    } else {
                                                                        newLevels = [
                                                                            { score: 5, label: '매우 우수' },
                                                                            { score: 4, label: '우수' },
                                                                            { score: 3, label: '보통' },
                                                                            { score: 2, label: '기초' },
                                                                            { score: 1, label: '노력' }
                                                                        ];
                                                                    }
                                                                    setFormData({
                                                                        ...formData,
                                                                        evaluation_rubric: { ...formData.evaluation_rubric, levels: newLevels }
                                                                    });
                                                                }}
                                                                style={{
                                                                    padding: '6px 14px',
                                                                    borderRadius: '12px',
                                                                    border: `2px solid ${isSelected ? theme.main : '#E2E8F0'}`,
                                                                    background: isSelected ? theme.main : 'white',
                                                                    color: isSelected ? 'white' : '#64748B',
                                                                    fontSize: '0.85rem',
                                                                    fontWeight: '900',
                                                                    cursor: 'pointer',
                                                                    transition: 'all 0.2s',
                                                                    boxShadow: isSelected ? `0 4px 12px ${theme.main}40` : 'none'
                                                                }}
                                                            >
                                                                {lvl}단계
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                <Button
                                                    type="button"
                                                    onClick={handleSaveDefaultRubric}
                                                    style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid #F39C12',
                                                        color: '#F39C12',
                                                        padding: '6px 12px',
                                                        fontSize: '0.8rem',
                                                        borderRadius: '10px',
                                                        fontWeight: 'bold',
                                                        minHeight: 'auto'
                                                    }}
                                                >
                                                    💾 기본값으로 저장
                                                </Button>
                                            </div>
                                        )}
                                    </div>

                                    {formData.evaluation_rubric?.use_rubric && (
                                        <div style={{
                                            display: 'grid',
                                            gridTemplateColumns: isMobile ? '1fr' : `repeat(${formData.evaluation_rubric.levels.length}, 1fr)`,
                                            gap: '10px',
                                            width: '100%',
                                            boxSizing: 'border-box'
                                        }}>
                                            {formData.evaluation_rubric.levels.map((level, idx) => (
                                                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 }}>
                                                    <span style={{ fontSize: '0.7rem', color: '#E67E22', fontWeight: 'bold' }}>{level.score}점 명칭</span>
                                                    <input
                                                        type="text"
                                                        value={level.label}
                                                        onChange={e => {
                                                            const newLevels = [...formData.evaluation_rubric.levels];
                                                            newLevels[idx].label = e.target.value;
                                                            setFormData({
                                                                ...formData,
                                                                evaluation_rubric: { ...formData.evaluation_rubric, levels: newLevels }
                                                            });
                                                        }}
                                                        style={{
                                                            width: '100%',
                                                            padding: '10px',
                                                            borderRadius: '10px',
                                                            border: '1px solid #FAD7A0',
                                                            fontSize: '0.85rem',
                                                            textAlign: 'center',
                                                            outline: 'none',
                                                            background: 'white',
                                                            boxSizing: 'border-box',
                                                            minWidth: 0
                                                        }}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    )}
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

            {/* AI 핵심 질문 생성 로딩 오버레이 (최상단 레이어 보장) */}
            <AnimatePresence>
                {isGeneratingQuestions && typeof document !== 'undefined' && createPortal(
                    <motion.div
                        key="ai-loading-root"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        style={{
                            position: 'fixed',
                            top: 0, left: 0, right: 0, bottom: 0,
                            backgroundColor: 'rgba(255, 255, 255, 0.85)',
                            backdropFilter: 'blur(20px)',
                            WebkitBackdropFilter: 'blur(20px)',
                            zIndex: 2000000000,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            textAlign: 'center'
                        }}
                    >
                        <motion.div
                            animate={{
                                scale: [1, 1.3, 1],
                                rotate: [0, 20, -20, 0]
                            }}
                            transition={{
                                duration: 1.2,
                                repeat: Infinity,
                                ease: "easeInOut"
                            }}
                            style={{ fontSize: '7rem', marginBottom: '24px', filter: 'drop-shadow(0 0 20px rgba(52, 152, 219, 0.4))' }}
                        >
                            🪄
                        </motion.div>
                        <h2 style={{ fontSize: '2.5rem', fontWeight: '950', color: '#2C3E50', margin: 0, letterSpacing: '-1px' }}>
                            핵심질문을 설계하고 있어요
                        </h2>
                    </motion.div>,
                    document.body
                )}
            </AnimatePresence>
        </>
    );
};

export default MissionForm;
